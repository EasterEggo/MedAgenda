import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import {
  HealthResponseSchema,
  type ErrorCode,
} from "@medagenda/shared";

export interface BuildAppOptions {
  logger?: boolean;
}

function toErrorCode(statusCode: number): ErrorCode {
  if (statusCode === 404) return "NOT_FOUND";
  if (statusCode === 413) return "PAYLOAD_TOO_LARGE";
  if (statusCode >= 400 && statusCode < 500) return "BAD_REQUEST";
  return "INTERNAL_ERROR";
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 100 * 1024,
  });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      app.log.error({ err: error }, "unhandled error");
    }
    const status = statusCode >= 400 ? statusCode : 500;
    return reply.code(status).send({ error: { code: toErrorCode(status) } });
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({ error: { code: "NOT_FOUND" } });
  });

  app.get("/health", async () => {
    return HealthResponseSchema.parse({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
