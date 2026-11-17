import type { FastifyBaseLogger } from "fastify";
import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { audit } from "../../lib/audit.js";
import { AppError, notFound } from "../../lib/errors.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { zonedToUtc } from "../../lib/timezone.js";
import type { RequestMeta } from "../auth/service.js";
import type {
  ClinicInputSchema,
  ClinicPatchSchema,
  ExamInputSchema,
  ExamPatchSchema,
  GenerateSlotsSchema,
  ProviderInputSchema,
  ProviderPatchSchema,
  SpecialtyInputSchema,
  SpecialtyPatchSchema,
} from "./schema.js";

const MAX_GENERATED_SLOTS = 10_000;

type In<T extends z.ZodType> = z.output<T>;

/** Maps Prisma constraint errors to stable API codes. */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code === "P2002") throw new AppError("CONFLICT", 409);
    if (code === "P2003") throw new AppError("IN_USE", 409);
    if (code === "P2025") throw notFound();
    throw e;
  }
}

export function createAdminService(deps: { prisma: PrismaClient; log: FastifyBaseLogger }) {
  const { prisma, log } = deps;
  const record = (userId: string, meta: RequestMeta, entity: string, op: string, id: string) =>
    audit(prisma, log, {
      userId,
      action: "ADMIN_CHANGE",
      ip: meta.ip,
      meta: { entity, op, id },
    });

  async function assertRefs(ids: {
    specialtyIds?: string[];
    examTypeIds?: string[];
    clinicId?: string;
  }) {
    if (ids.clinicId && !(await prisma.clinic.findUnique({ where: { id: ids.clinicId } }))) {
      throw new AppError("VALIDATION_ERROR", 400);
    }
    for (const [list, model] of [
      [ids.specialtyIds, prisma.specialty],
      [ids.examTypeIds, prisma.examType],
    ] as const) {
      if (!list?.length) continue;
      const unique = [...new Set(list)];
      const found = await (model as typeof prisma.specialty).count({
        where: { id: { in: unique } },
      });
      if (found !== unique.length) throw new AppError("VALIDATION_ERROR", 400);
    }
  }

  const providerRelations = (
    input: { specialtyIds?: string[] | undefined; examTypeIds?: string[] | undefined },
    replace: boolean,
  ) => ({
    ...(input.specialtyIds
      ? {
          specialties: {
            ...(replace ? { deleteMany: {} } : {}),
            create: [...new Set(input.specialtyIds)].map((specialtyId) => ({ specialtyId })),
          },
        }
      : {}),
    ...(input.examTypeIds
      ? {
          exams: {
            ...(replace ? { deleteMany: {} } : {}),
            create: [...new Set(input.examTypeIds)].map((examTypeId) => ({ examTypeId })),
          },
        }
      : {}),
  });

  return {
    // --- specialties
    async createSpecialty(uid: string, input: In<typeof SpecialtyInputSchema>, meta: RequestMeta) {
      const row = await guard(() => prisma.specialty.create({ data: input }));
      await record(uid, meta, "specialty", "create", row.id);
      return row;
    },
    async updateSpecialty(
      uid: string,
      id: string,
      input: In<typeof SpecialtyPatchSchema>,
      meta: RequestMeta,
    ) {
      const row = await guard(() => prisma.specialty.update({ where: { id }, data: input }));
      await record(uid, meta, "specialty", "update", id);
      return row;
    },
    async deleteSpecialty(uid: string, id: string, meta: RequestMeta) {
      await guard(() => prisma.specialty.delete({ where: { id } }));
      await record(uid, meta, "specialty", "delete", id);
    },

    // --- exams
    async createExam(uid: string, input: In<typeof ExamInputSchema>, meta: RequestMeta) {
      const row = await guard(() => prisma.examType.create({ data: input }));
      await record(uid, meta, "exam", "create", row.id);
      return row;
    },
    async updateExam(
      uid: string,
      id: string,
      input: In<typeof ExamPatchSchema>,
      meta: RequestMeta,
    ) {
      const row = await guard(() => prisma.examType.update({ where: { id }, data: input }));
      await record(uid, meta, "exam", "update", id);
      return row;
    },
    async deleteExam(uid: string, id: string, meta: RequestMeta) {
      await guard(() => prisma.examType.delete({ where: { id } }));
      await record(uid, meta, "exam", "delete", id);
    },

    // --- clinics
    async createClinic(uid: string, input: In<typeof ClinicInputSchema>, meta: RequestMeta) {
      const row = await guard(() => prisma.clinic.create({ data: input }));
      await record(uid, meta, "clinic", "create", row.id);
      return row;
    },
    async updateClinic(
      uid: string,
      id: string,
      input: In<typeof ClinicPatchSchema>,
      meta: RequestMeta,
    ) {
      const row = await guard(() => prisma.clinic.update({ where: { id }, data: input }));
      await record(uid, meta, "clinic", "update", id);
      return row;
    },
    async deleteClinic(uid: string, id: string, meta: RequestMeta) {
      await guard(() => prisma.clinic.delete({ where: { id } }));
      await record(uid, meta, "clinic", "delete", id);
    },

    // --- providers
    async createProvider(uid: string, input: In<typeof ProviderInputSchema>, meta: RequestMeta) {
      await assertRefs(input);
      const { specialtyIds, examTypeIds, ...rest } = input;
      const row = await guard(() =>
        prisma.provider.create({
          data: { ...rest, ...providerRelations({ specialtyIds, examTypeIds }, false) },
        }),
      );
      await record(uid, meta, "provider", "create", row.id);
      return row;
    },
    async updateProvider(
      uid: string,
      id: string,
      input: In<typeof ProviderPatchSchema>,
      meta: RequestMeta,
    ) {
      await assertRefs(input);
      const { specialtyIds, examTypeIds, ...rest } = input;
      const row = await guard(() =>
        prisma.provider.update({
          where: { id },
          data: { ...rest, ...providerRelations({ specialtyIds, examTypeIds }, true) },
        }),
      );
      await record(uid, meta, "provider", "update", id);
      return row;
    },
    async deleteProvider(uid: string, id: string, meta: RequestMeta) {
      await guard(() => prisma.provider.delete({ where: { id } }));
      await record(uid, meta, "provider", "delete", id);
    },

    // --- slots
    async generateSlots(uid: string, input: In<typeof GenerateSlotsSchema>, meta: RequestMeta) {
      const provider = await prisma.provider.findUnique({
        where: { id: input.providerId },
        include: { clinic: true, specialties: true, exams: true },
      });
      if (!provider) throw notFound();
      const offered =
        input.serviceType === "CONSULTATION"
          ? provider.specialties.some((s) => s.specialtyId === input.specialtyId)
          : provider.exams.some((e) => e.examTypeId === input.examTypeId);
      if (!offered) throw new AppError("VALIDATION_ERROR", 400);

      const [sh, sm] = input.startTime.split(":").map(Number) as [number, number];
      const [eh, em] = input.endTime.split(":").map(Number) as [number, number];
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      const weekdays = new Set(input.weekdays);

      const data: Prisma.SlotCreateManyInput[] = [];
      for (let t = Date.parse(input.from); t <= Date.parse(input.to); t += 86_400_000) {
        const day = new Date(t);
        if (!weekdays.has(day.getUTCDay())) continue;
        const date = day.toISOString().slice(0, 10);
        for (let m = startMin; m + input.durationMin <= endMin; m += input.durationMin) {
          data.push({
            providerId: provider.id,
            startsAt: zonedToUtc(date, m, provider.clinic.timezone),
            endsAt: zonedToUtc(date, m + input.durationMin, provider.clinic.timezone),
            serviceType: input.serviceType,
            specialtyId: input.specialtyId ?? null,
            examTypeId: input.examTypeId ?? null,
          });
          if (data.length > MAX_GENERATED_SLOTS) throw new AppError("DATE_RANGE_TOO_LARGE", 400);
        }
      }
      // Unique (providerId, startsAt): existing slots are skipped, never overwritten.
      const res = await prisma.slot.createMany({ data, skipDuplicates: true });
      await record(uid, meta, "slot", "generate", provider.id);
      return { requested: data.length, created: res.count, skipped: data.length - res.count };
    },

    async setSlotStatus(uid: string, id: string, status: "OPEN" | "BLOCKED", meta: RequestMeta) {
      const from = status === "BLOCKED" ? "OPEN" : "BLOCKED";
      const res = await prisma.slot.updateMany({ where: { id, status: from }, data: { status } });
      const slot = await prisma.slot.findUnique({ where: { id } });
      if (!slot) throw notFound();
      if (res.count === 0 && slot.status !== status) throw new AppError("SLOT_ALREADY_BOOKED", 409);
      if (res.count > 0) await record(uid, meta, "slot", status.toLowerCase(), id);
      return slot;
    },
  };
}
