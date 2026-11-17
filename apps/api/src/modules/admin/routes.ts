import type { FastifyInstance, FastifyRequest } from "fastify";
import { IdParamSchema } from "@medagenda/shared";
import { parse } from "../../lib/validate.js";
import { requireAuth, requireRole } from "../auth/guards.js";
import {
  AdminSlotsQuerySchema,
  ClinicInputSchema,
  ClinicPatchSchema,
  ExamInputSchema,
  ExamPatchSchema,
  GenerateSlotsSchema,
  ProviderInputSchema,
  ProviderPatchSchema,
  SlotPatchSchema,
  SpecialtyInputSchema,
  SpecialtyPatchSchema,
} from "./schema.js";
import { createAdminService } from "./service.js";

const meta = (request: FastifyRequest) => ({
  ip: request.ip,
  userAgent: request.headers["user-agent"],
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const s = createAdminService({ prisma: app.prisma, log: app.log });
  const pre = { preHandler: [requireAuth({ mfa: true }), requireRole("ADMIN")] };
  const uid = (r: FastifyRequest) => r.auth!.user.id;
  const id = (r: FastifyRequest) => parse(IdParamSchema, r.params).id;

  const crud = <C, P>(
    path: string,
    ops: {
      create: (u: string, i: C, m: ReturnType<typeof meta>) => Promise<unknown>;
      update: (u: string, id: string, i: P, m: ReturnType<typeof meta>) => Promise<unknown>;
      remove: (u: string, id: string, m: ReturnType<typeof meta>) => Promise<unknown>;
    },
    schemas: { create: Parameters<typeof parse>[0]; patch: Parameters<typeof parse>[0] },
  ) => {
    app.post(path, pre, async (r, reply) =>
      reply.code(201).send(await ops.create(uid(r), parse(schemas.create, r.body) as C, meta(r))),
    );
    app.patch(`${path}/:id`, pre, async (r) =>
      ops.update(uid(r), id(r), parse(schemas.patch, r.body) as P, meta(r)),
    );
    app.delete(`${path}/:id`, pre, async (r, reply) => {
      await ops.remove(uid(r), id(r), meta(r));
      return reply.code(204).send();
    });
  };

  crud(
    "/admin/specialties",
    {
      create: s.createSpecialty,
      update: s.updateSpecialty,
      remove: s.deleteSpecialty,
    },
    { create: SpecialtyInputSchema, patch: SpecialtyPatchSchema },
  );
  crud(
    "/admin/exams",
    {
      create: s.createExam,
      update: s.updateExam,
      remove: s.deleteExam,
    },
    { create: ExamInputSchema, patch: ExamPatchSchema },
  );
  crud(
    "/admin/clinics",
    {
      create: s.createClinic,
      update: s.updateClinic,
      remove: s.deleteClinic,
    },
    { create: ClinicInputSchema, patch: ClinicPatchSchema },
  );
  crud(
    "/admin/providers",
    {
      create: s.createProvider,
      update: s.updateProvider,
      remove: s.deleteProvider,
    },
    { create: ProviderInputSchema, patch: ProviderPatchSchema },
  );

  app.post("/admin/slots/generate", pre, async (r, reply) =>
    reply
      .code(201)
      .send(await s.generateSlots(uid(r), parse(GenerateSlotsSchema, r.body), meta(r))),
  );

  app.get("/admin/slots", pre, async (r) => s.listSlots(parse(AdminSlotsQuerySchema, r.query)));

  app.patch("/admin/slots/:id", pre, async (r) =>
    s.setSlotStatus(uid(r), id(r), parse(SlotPatchSchema, r.body).status, meta(r)),
  );
}
