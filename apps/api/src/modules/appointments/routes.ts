import type { FastifyInstance, FastifyRequest } from "fastify";
import { IdParamSchema } from "@medagenda/shared";
import { parse } from "../../lib/validate.js";
import { requireAuth } from "../auth/guards.js";
import { AppointmentsQuerySchema, BookAppointmentSchema, RescheduleSchema } from "./schema.js";
import { createAppointmentsService } from "./service.js";

const meta = (request: FastifyRequest) => ({
  ip: request.ip,
  userAgent: request.headers["user-agent"],
});

export async function appointmentRoutes(app: FastifyInstance): Promise<void> {
  const service = createAppointmentsService({ prisma: app.prisma, log: app.log });
  const pre = { preHandler: requireAuth({ mfa: true }) };

  app.post("/appointments", pre, async (request, reply) => {
    const body = parse(BookAppointmentSchema, request.body);
    const created = await service.book(request.auth!.user.id, body, meta(request));
    return reply.code(201).send(created);
  });

  app.get("/appointments", pre, async (request) =>
    service.list(request.auth!.user.id, parse(AppointmentsQuerySchema, request.query)),
  );

  app.get("/appointments/:id", pre, async (request) => {
    const { id } = parse(IdParamSchema, request.params);
    return service.get(request.auth!.user.id, id);
  });

  app.patch("/appointments/:id/reschedule", pre, async (request) => {
    const { id } = parse(IdParamSchema, request.params);
    const { newSlotId } = parse(RescheduleSchema, request.body);
    return service.reschedule(request.auth!.user.id, id, newSlotId, meta(request));
  });

  app.post("/appointments/:id/cancel", pre, async (request) => {
    const { id } = parse(IdParamSchema, request.params);
    return service.cancel(request.auth!.user.id, id, meta(request));
  });
}
