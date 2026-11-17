import type { FastifyBaseLogger } from "fastify";
import type { Prisma } from "@prisma/client";
import { CANCEL_MIN_NOTICE_MS, type AppointmentStatusSchema } from "@medagenda/shared";
import type { z } from "zod";
import { audit } from "../../lib/audit.js";
import { decrypt, encrypt } from "../../lib/crypto.js";
import { AppError, notFound } from "../../lib/errors.js";
import { pageArgs, toPage } from "../../lib/paginate.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { AAD } from "../auth/mappers.js";
import type { RequestMeta } from "../auth/service.js";

const TX_OPTS = { maxWait: 20_000, timeout: 20_000 } as const;

const include = {
  slot: {
    include: {
      specialty: true,
      examType: true,
      provider: { include: { clinic: true } },
    },
  },
} satisfies Prisma.AppointmentInclude;

type ApptRow = Prisma.AppointmentGetPayload<{ include: typeof include }>;

function toDto(row: ApptRow, withNotes: boolean) {
  const { slot } = row;
  return {
    id: row.id,
    status: row.status,
    slotId: row.slotId,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    serviceType: slot.serviceType,
    specialty: slot.specialty
      ? { id: slot.specialty.id, namePt: slot.specialty.namePt, nameEn: slot.specialty.nameEn }
      : null,
    examType: slot.examType
      ? {
          id: slot.examType.id,
          namePt: slot.examType.namePt,
          nameEn: slot.examType.nameEn,
          preparationPt: slot.examType.preparationPt,
          preparationEn: slot.examType.preparationEn,
        }
      : null,
    provider: { id: slot.provider.id, name: slot.provider.name, kind: slot.provider.kind },
    clinic: {
      id: slot.provider.clinic.id,
      name: slot.provider.clinic.name,
      address: slot.provider.clinic.address,
      city: slot.provider.clinic.city,
      phone: slot.provider.clinic.phone,
      timezone: slot.provider.clinic.timezone,
    },
    ...(withNotes
      ? { notes: row.notesEnc ? decrypt(Buffer.from(row.notesEnc), AAD.appointmentNotes) : null }
      : {}),
    sequence: row.sequence,
    createdAt: row.createdAt,
    cancelledAt: row.cancelledAt,
  };
}

type Tx = Prisma.TransactionClient;

/** Serialises booking operations of one user so the overlap check cannot be raced. */
async function lockUser(tx: Tx, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"appt:" + userId}))`;
}

/** Atomic claim: only an OPEN, future slot flips to BOOKED. Returns the slot or throws 409/404. */
async function claimSlot(tx: Tx, slotId: string) {
  const updated = await tx.$executeRaw`
    UPDATE "Slot" SET "status" = 'BOOKED'
    WHERE "id" = ${slotId} AND "status" = 'OPEN' AND "startsAt" > now()`;
  if (updated === 0) {
    const exists = await tx.slot.findUnique({ where: { id: slotId }, select: { id: true } });
    if (!exists) throw notFound();
    throw new AppError("SLOT_ALREADY_BOOKED", 409);
  }
  return tx.slot.findUniqueOrThrow({ where: { id: slotId } });
}

async function assertNoOverlap(
  tx: Tx,
  userId: string,
  slot: { startsAt: Date; endsAt: Date },
  excludeAppointmentId?: string,
) {
  const clash = await tx.appointment.findFirst({
    where: {
      userId,
      status: "SCHEDULED",
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      slot: { startsAt: { lt: slot.endsAt }, endsAt: { gt: slot.startsAt } },
    },
    select: { id: true },
  });
  if (clash) throw new AppError("USER_TIME_CONFLICT", 409);
}

function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "P2002";
}

export function createAppointmentsService(deps: { prisma: PrismaClient; log: FastifyBaseLogger }) {
  const { prisma, log } = deps;

  async function getOwned(userId: string, id: string): Promise<ApptRow> {
    // Ownership is part of the query: someone else's id is indistinguishable from a missing one.
    const row = await prisma.appointment.findFirst({ where: { id, userId }, include });
    if (!row) throw notFound();
    return row;
  }

  return {
    async book(
      userId: string,
      input: { slotId: string; notes?: string | undefined },
      meta: RequestMeta,
    ) {
      let id: string;
      try {
        id = await prisma.$transaction(async (tx) => {
          await lockUser(tx, userId);
          const slot = await claimSlot(tx, input.slotId);
          await assertNoOverlap(tx, userId, slot);
          const appt = await tx.appointment.create({
            data: {
              userId,
              slotId: slot.id,
              notesEnc: input.notes ? encrypt(input.notes, AAD.appointmentNotes) : null,
            },
          });
          return appt.id;
        }, TX_OPTS);
      } catch (e) {
        // Backstop: the partial unique index on slotId rejected a double booking.
        if (isUniqueViolation(e)) throw new AppError("SLOT_ALREADY_BOOKED", 409);
        throw e;
      }
      await audit(prisma, log, {
        userId,
        action: "APPT_BOOKED",
        ip: meta.ip,
        meta: { appointmentId: id, slotId: input.slotId },
      });
      return toDto(await getOwned(userId, id), true);
    },

    async list(
      userId: string,
      q: {
        limit: number;
        cursor?: string | undefined;
        from?: Date | undefined;
        to?: Date | undefined;
        status?: z.infer<typeof AppointmentStatusSchema> | undefined;
      },
    ) {
      const rows = await prisma.appointment.findMany({
        where: {
          userId,
          ...(q.status ? { status: q.status } : {}),
          ...(q.from || q.to
            ? {
                slot: {
                  startsAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) },
                },
              }
            : {}),
        },
        include,
        orderBy: [{ slot: { startsAt: "asc" } }, { id: "asc" }],
        ...pageArgs(q),
      });
      return toPage(rows, q.limit, (r) => toDto(r, false));
    },

    async get(userId: string, id: string) {
      return toDto(await getOwned(userId, id), true);
    },

    async reschedule(userId: string, id: string, newSlotId: string, meta: RequestMeta) {
      try {
        await prisma.$transaction(async (tx) => {
          await lockUser(tx, userId);
          const current = await tx.appointment.findFirst({
            where: { id, userId },
            include: { slot: true },
          });
          if (!current) throw notFound();
          if (current.status !== "SCHEDULED") throw new AppError("APPOINTMENT_NOT_SCHEDULED", 409);
          if (current.slot.startsAt.getTime() - Date.now() < CANCEL_MIN_NOTICE_MS) {
            throw new AppError("CANCELLATION_WINDOW_CLOSED", 409);
          }
          const next = await claimSlot(tx, newSlotId);
          await assertNoOverlap(tx, userId, next, current.id);
          // Free the old slot first so the live-slot unique index never sees two owners.
          await tx.slot.updateMany({
            where: { id: current.slotId, status: "BOOKED" },
            data: { status: "OPEN" },
          });
          await tx.appointment.update({
            where: { id: current.id },
            data: { slotId: next.id, sequence: { increment: 1 } },
          });
        }, TX_OPTS);
      } catch (e) {
        if (isUniqueViolation(e)) throw new AppError("SLOT_ALREADY_BOOKED", 409);
        throw e;
      }
      await audit(prisma, log, {
        userId,
        action: "APPT_RESCHEDULED",
        ip: meta.ip,
        meta: { appointmentId: id, newSlotId },
      });
      return toDto(await getOwned(userId, id), true);
    },

    async cancel(userId: string, id: string, meta: RequestMeta) {
      await prisma.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const current = await tx.appointment.findFirst({
          where: { id, userId },
          include: { slot: true },
        });
        if (!current) throw notFound();
        if (current.status !== "SCHEDULED") throw new AppError("APPOINTMENT_NOT_SCHEDULED", 409);
        if (current.slot.startsAt.getTime() - Date.now() < CANCEL_MIN_NOTICE_MS) {
          throw new AppError("CANCELLATION_WINDOW_CLOSED", 409);
        }
        const done = await tx.appointment.updateMany({
          where: { id, userId, status: "SCHEDULED" },
          data: { status: "CANCELLED", cancelledAt: new Date(), sequence: { increment: 1 } },
        });
        if (done.count === 0) throw new AppError("APPOINTMENT_NOT_SCHEDULED", 409);
        await tx.slot.updateMany({
          where: { id: current.slotId, status: "BOOKED" },
          data: { status: "OPEN" },
        });
      }, TX_OPTS);
      await audit(prisma, log, {
        userId,
        action: "APPT_CANCELLED",
        ip: meta.ip,
        meta: { appointmentId: id },
      });
      return toDto(await getOwned(userId, id), true);
    },
  };
}
