import type { FastifyInstance, FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { DeleteAccountSchema } from "@medagenda/shared";
import { AppError } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { UpdateLocaleSchema, UpdateProfileSchema } from "./schema.js";
import { requireAuth } from "../auth/guards.js";
import { createMeService } from "./service.js";

const meta = (request: FastifyRequest) => ({
  ip: request.ip,
  userAgent: request.headers["user-agent"],
});

export async function meRoutes(app: FastifyInstance): Promise<void> {
  const service = createMeService({ prisma: app.prisma, log: app.log });

  const pre = { preHandler: requireAuth() };

  // Per-IP limit on the password-confirmed and bulk-export routes (stops password guessing with a stolen session).
  await app.register(rateLimit, {
    global: false,
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: () => new AppError("RATE_LIMITED", 429),
  });
  const limited = {
    config: { rateLimit: { max: app.config.AUTH_RATE_LIMIT_MAX, timeWindow: "1 minute" } },
  };

  app.get("/me", pre, async (request) => service.getProfile(request.auth!.user.id, meta(request)));

  app.patch("/me", pre, async (request) =>
    service.updateProfile(
      request.auth!.user.id,
      parse(UpdateProfileSchema, request.body),
      meta(request),
    ),
  );

  app.patch("/me/locale", pre, async (request) => {
    const { locale } = parse(UpdateLocaleSchema, request.body);
    return service.updateLocale(request.auth!.user.id, locale, meta(request));
  });

  app.get("/me/export", { preHandler: requireAuth(), ...limited }, async (request) => {
    return service.exportData(request.auth!.user.id, meta(request));
  });

  app.delete("/me", { preHandler: requireAuth(), ...limited }, async (request, reply) => {
    const { password } = parse(DeleteAccountSchema, request.body);
    await service.deleteAccount(request.auth!.user.id, password, meta(request));
    reply.clearCookie("sid", { path: "/" });
    reply.clearCookie("_csrf", { path: "/" });
    return { ok: true };
  });
}
