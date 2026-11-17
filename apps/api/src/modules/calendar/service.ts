import type { FastifyBaseLogger } from "fastify";
import type { Prisma } from "@prisma/client";
import { audit } from "../../lib/audit.js";
import { notFound } from "../../lib/errors.js";
import { newOpaqueToken, sha256Hex } from "../../lib/password.js";
import type { PrismaClient } from "../../lib/prisma.js";
import type { RequestMeta } from "../auth/service.js";
import { buildIcs, icsFileDate, type IcsAppointment, type IcsLocale } from "./ics.js";

const include = {
  slot: { include: { specialty: true, examType: true, provider: { include: { clinic: true } } } },
} satisfies Prisma.AppointmentInclude;

type Row = Prisma.AppointmentGetPayload<{ include: typeof include }>;

const DAY_MS = 86_400_000;

function toIcsAppointment(row: Row): IcsAppointment {
  const { slot } = row;
  const clinic = slot.provider.clinic;
  return {
    icsUid: row.icsUid,
    sequence: row.sequence,
    status: row.status,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    serviceType: slot.serviceType,
    specialty: slot.specialty
      ? { namePt: slot.specialty.namePt, nameEn: slot.specialty.nameEn }
      : null,
    examType: slot.examType
      ? {
          namePt: slot.examType.namePt,
          nameEn: slot.examType.nameEn,
          preparationPt: slot.examType.preparationPt,
          preparationEn: slot.examType.preparationEn,
        }
      : null,
    providerName: slot.provider.name,
    clinic: {
      name: clinic.name,
      address: clinic.address,
      phone: clinic.phone,
      timezone: clinic.timezone,
    },
  };
}

const asLocale = (v: string): IcsLocale => (v === "en" ? "en" : "pt-BR");

export function createCalendarService(deps: {
  prisma: PrismaClient;
  log: FastifyBaseLogger;
  publicApiUrl: string;
}) {
  const { prisma, log } = deps;
  const base = deps.publicApiUrl.replace(/\/+$/, "");

  return {
    async singleIcs(userId: string, locale: string, id: string) {
      const row = await prisma.appointment.findFirst({ where: { id, userId }, include });
      if (!row) throw notFound();
      const a = toIcsAppointment(row);
      return {
        body: buildIcs([a], asLocale(locale)),
        filename: `consulta-${icsFileDate(a.startsAt, a.clinic.timezone)}.ics`,
      };
    },

    /** Creates or rotates the feed token. The plaintext token exists only in this response. */
    async createFeed(userId: string, meta: RequestMeta) {
      const token = newOpaqueToken();
      const tokenHash = sha256Hex(token);
      await prisma.calendarFeed.upsert({
        where: { userId },
        create: { userId, tokenHash },
        update: { tokenHash, revokedAt: null, createdAt: new Date() },
      });
      await audit(prisma, log, { userId, action: "CALENDAR_FEED_CREATED", ip: meta.ip });
      return { url: `${base}/api/v1/calendar/feed/${token}.ics` };
    },

    async revokeFeed(userId: string, meta: RequestMeta) {
      const res = await prisma.calendarFeed.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (res.count > 0) {
        await audit(prisma, log, { userId, action: "CALENDAR_FEED_REVOKED", ip: meta.ip });
      }
    },

    /** Public feed. Lookup is by SHA-256 of the token against a unique index (no secret compare). */
    async feedIcs(token: string) {
      const feed = await prisma.calendarFeed.findUnique({
        where: { tokenHash: sha256Hex(token) },
        include: { user: { select: { locale: true, deletedAt: true } } },
      });
      if (!feed || feed.revokedAt || feed.user.deletedAt) throw notFound();
      const now = Date.now();
      const rows = await prisma.appointment.findMany({
        where: {
          userId: feed.userId,
          status: { in: ["SCHEDULED", "CANCELLED"] },
          slot: {
            startsAt: { gte: new Date(now - 30 * DAY_MS), lte: new Date(now + 365 * DAY_MS) },
          },
        },
        include,
        orderBy: { slot: { startsAt: "asc" } },
      });
      return buildIcs(rows.map(toIcsAppointment), asLocale(feed.user.locale), {
        calendarName: true,
      });
    },
  };
}
