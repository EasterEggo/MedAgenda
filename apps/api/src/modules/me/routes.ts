import type { FastifyInstance, FastifyRequest } from "fastify";
import { DeleteAccountSchema } from "@medagenda/shared";
import { parse } from "../../lib/validate.js";
import { requireAuth } from "../auth/guards.js";
import { createMeService } from "./service.js";

const meta = (request: FastifyRequest) => ({
  ip: request.ip,
  userAgent: request.headers["user-agent"],
});

export async function meRoutes(app: FastifyInstance): Promise<void> {
  const service = createMeService({ prisma: app.prisma, log: app.log });

  app.get("/me/export", { preHandler: requireAuth({ mfa: true }) }, async (request) => {
    return service.exportData(request.auth!.user.id, meta(request));
  });

  app.delete("/me", { preHandler: requireAuth({ mfa: true }) }, async (request, reply) => {
    const { password } = parse(DeleteAccountSchema, request.body);
    await service.deleteAccount(request.auth!.user.id, password, meta(request));
    reply.clearCookie("sid", { path: "/" });
    reply.clearCookie("_csrf", { path: "/" });
    return { ok: true };
  });
}
