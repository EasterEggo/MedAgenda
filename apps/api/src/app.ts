import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import csrf from "@fastify/csrf-protection";
import helmet from "@fastify/helmet";
import { HealthResponseSchema, type ErrorCode } from "@medagenda/shared";
import type { ApiConfig } from "./config.js";
import { AppError } from "./lib/errors.js";
import type { Mailer } from "./lib/mailer.js";
import type { PrismaClient } from "./lib/prisma.js";
import { SESSION_COOKIE } from "./modules/auth/guards.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { appointmentRoutes } from "./modules/appointments/routes.js";
import { calendarRoutes } from "./modules/calendar/routes.js";
import { catalogRoutes } from "./modules/catalog/routes.js";
import { authRoutes } from "./modules/auth/routes.js";
import { meRoutes } from "./modules/me/routes.js";
import "./types.js";

export interface BuildAppOptions {
  logger?: boolean;
  /** Test hook: capture log output. */
  logStream?: { write(line: string): void };
  config: ApiConfig;
  prisma: PrismaClient;
  mailer: Mailer;
}

function toErrorCode(statusCode: number): ErrorCode {
  if (statusCode === 404) return "NOT_FOUND";
  if (statusCode === 413) return "PAYLOAD_TOO_LARGE";
  if (statusCode === 429) return "RATE_LIMITED";
  if (statusCode >= 400 && statusCode < 500) return "BAD_REQUEST";
  return "INTERNAL_ERROR";
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Cookie-authenticated requests are subject to CSRF; Bearer requests and anonymous ones are not. */
function needsCsrf(request: FastifyRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  if (request.headers.authorization !== undefined) return false;
  return Boolean(request.cookies[SESSION_COOKIE]);
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;
  const app = Fastify({
    logger:
      (options.logger ?? true) || options.logStream
        ? {
            ...(options.logStream ? { stream: options.logStream } : {}),
            level: "info",
            redact: [
              "req.headers.authorization",
              "req.headers.cookie",
              "res.headers['set-cookie']",
            ],
          }
        : false,
    bodyLimit: 100 * 1024,
    trustProxy: config.TRUST_PROXY,
  });

  app.decorate("prisma", options.prisma);
  app.decorate("mailer", options.mailer);
  app.decorate("config", config);
  app.decorateRequest("auth", undefined);

  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: { code: error.code } });
    }
    if ((error as FastifyError).code?.startsWith("FST_CSRF_")) {
      return reply.code(403).send({ error: { code: "CSRF_INVALID" } });
    }
    const statusCode = (error as FastifyError).statusCode ?? 500;
    if (statusCode >= 500) {
      // Log the error type only: messages may echo request data.
      request.log.error(
        { errName: error.name, errCode: (error as FastifyError).code },
        "unhandled error",
      );
    }
    const status = statusCode >= 400 ? statusCode : 500;
    return reply.code(status).send({ error: { code: toErrorCode(status) } });
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: { code: "NOT_FOUND" } });
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
  });
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
  });
  await app.register(cookie, { secret: config.COOKIE_SECRET });
  await app.register(csrf, {
    cookieKey: "_csrf",
    cookieOpts: { path: "/", httpOnly: true, secure: true, sameSite: "lax", signed: true },
    getToken: (request) => {
      const header = request.headers["x-csrf-token"];
      return typeof header === "string" ? header : undefined;
    },
  });

  app.addHook("onRequest", (request, reply, done) => {
    if (!needsCsrf(request)) return done();
    // On failure the plugin replies itself with an FST_CSRF_* error (mapped in the error handler).
    app.csrfProtection(request, reply, done);
  });

  app.get("/health", async () => {
    return HealthResponseSchema.parse({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { prefix: "/auth" });
      await v1.register(meRoutes);
      await v1.register(catalogRoutes);
      await v1.register(appointmentRoutes);
      await v1.register(calendarRoutes);
      await v1.register(adminRoutes);
    },
    { prefix: "/api/v1" },
  );

  return app;
}
