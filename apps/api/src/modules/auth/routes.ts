import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import {
  ForgotPasswordSchema,
  LoginSchema,
  RegisterSchema,
  ResendVerificationSchema,
  ResetPasswordSchema,
  SessionIdParamSchema,
  VerifyEmailSchema,
  type LoginResponse,
} from "@medagenda/shared";
import { AppError } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { requireAuth } from "./guards.js";
import { SESSION_COOKIE } from "./guards.js";
import { createAuthService } from "./service.js";
import { SESSION_LIFETIME_MS } from "./sessions.js";

const meta = (request: FastifyRequest) => ({
  ip: request.ip,
  userAgent: request.headers["user-agent"],
});

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(SESSION_LIFETIME_MS / 1000),
  };
}

function clearSessionCookies(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
  reply.clearCookie("_csrf", { path: "/" });
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const service = createAuthService({
    prisma: app.prisma,
    mailer: app.mailer,
    config: app.config,
    log: app.log,
  });

  // Per-IP limit on the credential-bearing routes (10/min by default).
  await app.register(rateLimit, {
    global: false,
    keyGenerator: (request) => request.ip,
    // Thrown into the app error handler, which renders `{ error: { code: "RATE_LIMITED" } }`.
    errorResponseBuilder: () => new AppError("RATE_LIMITED", 429),
  });
  const limited = {
    config: { rateLimit: { max: app.config.AUTH_RATE_LIMIT_MAX, timeWindow: "1 minute" } },
  };

  app.get("/csrf", async (_request, reply) => {
    const csrfToken = reply.generateCsrf();
    return { csrfToken };
  });

  app.post("/register", limited, async (request, reply) => {
    await service.register(parse(RegisterSchema, request.body), meta(request));
    return reply.code(202).send({ ok: true });
  });

  app.post("/verify-email", limited, async (request) => {
    await service.verifyEmail(parse(VerifyEmailSchema, request.body).token, meta(request));
    return { ok: true };
  });

  app.post("/resend-verification", limited, async (request, reply) => {
    await service.resendVerification(parse(ResendVerificationSchema, request.body).email);
    return reply.code(202).send({ ok: true });
  });

  app.post("/login", limited, async (request, reply): Promise<LoginResponse> => {
    const input = parse(LoginSchema, request.body);
    const result = await service.login(input, meta(request));
    if (input.client === "mobile") {
      return { token: result.token };
    }
    reply.setCookie(SESSION_COOKIE, result.token, sessionCookieOptions());
    return { csrfToken: reply.generateCsrf() };
  });

  app.post("/logout", { preHandler: requireAuth() }, async (request, reply) => {
    const auth = request.auth!;
    await service.logout(auth.session, meta(request));
    clearSessionCookies(reply);
    return { ok: true };
  });

  app.get("/sessions", { preHandler: requireAuth() }, async (request) => {
    const auth = request.auth!;
    return { sessions: await service.listSessions(auth.user.id, auth.session.id) };
  });

  app.delete("/sessions/:id", { preHandler: requireAuth() }, async (request) => {
    const { id } = parse(SessionIdParamSchema, request.params);
    await service.revokeSessionById(request.auth!.user.id, id, meta(request));
    return { ok: true };
  });

  app.post("/forgot", limited, async (request, reply) => {
    await service.forgotPassword(parse(ForgotPasswordSchema, request.body).email, meta(request));
    return reply.code(202).send({ ok: true });
  });

  app.post("/reset", limited, async (request) => {
    const input = parse(ResetPasswordSchema, request.body);
    await service.resetPassword(input.token, input.password, meta(request));
    return { ok: true };
  });
}
