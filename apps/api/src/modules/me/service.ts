import type { FastifyBaseLogger } from "fastify";
import type { Prisma, User, PatientProfile } from "@prisma/client";
import type { Locale, UpdateProfileSchema } from "@medagenda/shared";
import type { z } from "zod";
import { audit } from "../../lib/audit.js";
import { blindIndex, decrypt, encrypt } from "../../lib/crypto.js";
import { AppError, notFound } from "../../lib/errors.js";
import { verifySecret } from "../../lib/password.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { AAD, fromDbProfile, fromDbUser } from "../auth/mappers.js";
import { revokeAllSessions } from "../auth/sessions.js";
import type { RequestMeta } from "../auth/service.js";

const NOTES_AAD = AAD.appointmentNotes;

type UpdateProfile = z.infer<typeof UpdateProfileSchema>;

function meDto(user: User & { profile: PatientProfile | null }) {
  const account = fromDbUser(user);
  return {
    id: account.id,
    email: account.email,
    locale: account.locale,
    role: account.role,
    emailVerifiedAt: account.emailVerifiedAt,
    createdAt: account.createdAt,
    profile: user.profile ? fromDbProfile(user.profile) : null,
  };
}

export function createMeService(deps: { prisma: PrismaClient; log: FastifyBaseLogger }) {
  const { prisma, log } = deps;

  return {
    async getProfile(userId: string, meta: RequestMeta) {
      const user = await prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        include: { profile: true },
      });
      if (!user) throw notFound();
      await audit(prisma, log, { userId, action: "PROFILE_READ", ip: meta.ip });
      return meDto(user);
    },

    async updateProfile(userId: string, input: UpdateProfile, meta: RequestMeta) {
      const data: Prisma.PatientProfileUpdateInput = {
        ...(input.fullName !== undefined
          ? { fullNameEnc: encrypt(input.fullName, AAD.profileFullName) }
          : {}),
        ...(input.birthDate !== undefined
          ? { birthDateEnc: encrypt(input.birthDate, AAD.profileBirthDate) }
          : {}),
        ...(input.phone !== undefined ? { phoneEnc: encrypt(input.phone, AAD.profilePhone) } : {}),
        ...(input.healthInsurance !== undefined
          ? {
              healthInsuranceEnc:
                input.healthInsurance === null
                  ? null
                  : encrypt(input.healthInsurance, AAD.profileHealthInsurance),
            }
          : {}),
      };
      const res = await prisma.patientProfile.updateMany({
        where: { userId, user: { deletedAt: null } },
        data,
      });
      if (res.count === 0) throw notFound();
      await audit(prisma, log, {
        userId,
        action: "PROFILE_UPDATED",
        ip: meta.ip,
        meta: { fields: Object.keys(input) },
      });
      return this.getProfile(userId, meta);
    },

    async updateLocale(userId: string, locale: Locale, meta: RequestMeta) {
      const res = await prisma.user.updateMany({
        where: { id: userId, deletedAt: null },
        data: { locale },
      });
      if (res.count === 0) throw notFound();
      await audit(prisma, log, { userId, action: "LOCALE_UPDATED", ip: meta.ip, meta: { locale } });
      return { locale };
    },

    /** LGPD: everything we hold about the user, decrypted. */
    async exportData(userId: string, meta: RequestMeta) {
      const user = await prisma.user.findFirst({
        where: { id: userId, deletedAt: null },
        include: {
          profile: true,
          appointments: { include: { slot: true }, orderBy: { createdAt: "asc" } },
          sessions: true,
          auditLogs: { orderBy: { createdAt: "asc" } },
        },
      });
      if (!user) throw notFound();
      const account = fromDbUser(user);
      await audit(prisma, log, { userId, action: "PROFILE_READ", ip: meta.ip });
      await audit(prisma, log, { userId, action: "DATA_EXPORT", ip: meta.ip });
      return {
        exportedAt: new Date().toISOString(),
        account: {
          id: account.id,
          email: account.email,
          locale: account.locale,
          role: account.role,
          emailVerifiedAt: account.emailVerifiedAt,
          createdAt: account.createdAt,
        },
        profile: user.profile ? fromDbProfile(user.profile) : null,
        appointments: user.appointments.map((a) => ({
          id: a.id,
          status: a.status,
          startsAt: a.slot.startsAt,
          endsAt: a.slot.endsAt,
          notes: a.notesEnc ? decrypt(Buffer.from(a.notesEnc), NOTES_AAD) : null,
          createdAt: a.createdAt,
          cancelledAt: a.cancelledAt,
        })),
        sessions: user.sessions.map((s) => ({
          id: s.id,
          createdAt: s.createdAt,
          lastUsedAt: s.lastUsedAt,
          userAgent: s.userAgent,
          revokedAt: s.revokedAt,
        })),
        auditLog: user.auditLogs.map((l) => ({ action: l.action, createdAt: l.createdAt })),
      };
    },

    /** LGPD: soft delete, wipe encrypted fields, revoke sessions, cancel future appointments. */
    async deleteAccount(userId: string, password: string, meta: RequestMeta): Promise<void> {
      const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
      if (!user) throw notFound();
      if (!(await verifySecret(user.passwordHash, password))) {
        throw new AppError("INVALID_CREDENTIALS", 401);
      }
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        const future = await tx.appointment.findMany({
          where: { userId, status: "SCHEDULED", slot: { startsAt: { gt: now } } },
          select: { id: true, slotId: true },
        });
        for (const appt of future) {
          await tx.appointment.update({
            where: { id: appt.id },
            data: { status: "CANCELLED", cancelledAt: now, sequence: { increment: 1 } },
          });
          await tx.slot.update({ where: { id: appt.slotId }, data: { status: "OPEN" } });
        }
        await tx.appointment.updateMany({ where: { userId }, data: { notesEnc: null } });
        await tx.patientProfile.deleteMany({ where: { userId } });
        await tx.emailToken.deleteMany({ where: { userId } });
        await tx.calendarFeed.deleteMany({ where: { userId } });
        await tx.user.update({
          where: { id: userId },
          data: {
            deletedAt: now,
            // Wipe the PII; keep the row so appointment history and audit trail stay referentially valid.
            emailEnc: encrypt("", "User.emailEnc"),
            emailHash: blindIndex(`deleted:${userId}`, "email"),
            passwordHash: "!",
            lockedUntil: null,
          },
        });
      });
      await revokeAllSessions(prisma, userId);
      await audit(prisma, log, { userId, action: "ACCOUNT_DELETED", ip: meta.ip });
    },
  };
}
