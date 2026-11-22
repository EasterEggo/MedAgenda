import type { FastifyInstance, FastifyRequest } from "fastify";
import { IdParamSchema } from "@medagenda/shared";
import { notFound } from "../../lib/errors.js";
import { parse } from "../../lib/validate.js";
import { requireAuth } from "../auth/guards.js";
import { createCalendarService } from "./service.js";

const meta = (request: FastifyRequest) => ({
  ip: request.ip,
  userAgent: request.headers["user-agent"],
});

export async function calendarRoutes(app: FastifyInstance): Promise<void> {
  const service = createCalendarService({
    prisma: app.prisma,
    log: app.log,
    publicApiUrl: app.config.PUBLIC_API_URL,
  });
  const pre = { preHandler: requireAuth() };

  app.get("/appointments/:id/ics", pre, async (request, reply) => {
    const { id } = parse(IdParamSchema, request.params);
    const { user } = request.auth!;
    const { body, filename } = await service.singleIcs(user.id, user.locale, id);
    return reply
      .header("Content-Type", "text/calendar; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .header("Cache-Control", "private, no-store")
      .send(body);
  });

  app.post("/calendar/feed", pre, async (request, reply) => {
    const created = await service.createFeed(request.auth!.user.id, meta(request));
    return reply.code(201).header("Cache-Control", "no-store").send(created);
  });

  app.delete("/calendar/feed", pre, async (request, reply) => {
    await service.revokeFeed(request.auth!.user.id, meta(request));
    return reply.code(204).send();
  });

  // Public, token-authenticated. The token is never logged: the route is excluded from request logs.
  app.get("/calendar/feed/:file", { logLevel: "silent" }, async (request, reply) => {
    const { file } = request.params as { file: string };
    if (!file.endsWith(".ics")) throw notFound();
    const token = file.slice(0, -4);
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw notFound();
    const body = await service.feedIcs(token);
    return reply
      .header("Content-Type", "text/calendar; charset=utf-8")
      .header("Cache-Control", "private, max-age=900")
      .send(body);
  });
}
