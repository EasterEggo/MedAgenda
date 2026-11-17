import type { Prisma } from "@prisma/client";
import type { SlotsQuery } from "@medagenda/shared";
import { MAX_SLOT_RANGE_MS } from "@medagenda/shared";
import { AppError } from "../../lib/errors.js";
import { pageArgs, toPage } from "../../lib/paginate.js";
import type { PrismaClient } from "../../lib/prisma.js";

interface Pg {
  limit: number;
  cursor?: string | undefined;
}

const providerInclude = {
  clinic: { select: { id: true, name: true, city: true, timezone: true } },
  specialties: { select: { specialtyId: true } },
  exams: { select: { examTypeId: true } },
} satisfies Prisma.ProviderInclude;

export function createCatalogService(prisma: PrismaClient) {
  return {
    async specialties(p: Pg) {
      const rows = await prisma.specialty.findMany({
        orderBy: [{ namePt: "asc" }, { id: "asc" }],
        ...pageArgs(p),
      });
      return toPage(rows, p.limit);
    },

    async exams(p: Pg) {
      const rows = await prisma.examType.findMany({
        orderBy: [{ namePt: "asc" }, { id: "asc" }],
        ...pageArgs(p),
      });
      return toPage(rows, p.limit);
    },

    async clinics(p: Pg & { city?: string | undefined }) {
      const rows = await prisma.clinic.findMany({
        where: p.city ? { city: { equals: p.city, mode: "insensitive" } } : {},
        orderBy: [{ name: "asc" }, { id: "asc" }],
        ...pageArgs(p),
      });
      return toPage(rows, p.limit);
    },

    async providers(
      p: Pg & {
        specialtyId?: string | undefined;
        examTypeId?: string | undefined;
        clinicId?: string | undefined;
      },
    ) {
      const where: Prisma.ProviderWhereInput = {
        ...(p.clinicId ? { clinicId: p.clinicId } : {}),
        ...(p.specialtyId ? { specialties: { some: { specialtyId: p.specialtyId } } } : {}),
        ...(p.examTypeId ? { exams: { some: { examTypeId: p.examTypeId } } } : {}),
      };
      const rows = await prisma.provider.findMany({
        where,
        include: providerInclude,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        ...pageArgs(p),
      });
      return toPage(rows, p.limit, ({ specialties, exams, ...r }) => ({
        ...r,
        specialtyIds: specialties.map((s) => s.specialtyId),
        examTypeIds: exams.map((e) => e.examTypeId),
      }));
    },

    /** Only OPEN slots in the future, within at most 31 days. */
    async slots(q: SlotsQuery) {
      const now = new Date();
      const from = q.from && q.from > now ? q.from : now;
      const to = q.to ?? new Date((q.from ?? now).getTime() + MAX_SLOT_RANGE_MS);
      if (to.getTime() - from.getTime() > MAX_SLOT_RANGE_MS) {
        throw new AppError("DATE_RANGE_TOO_LARGE", 400);
      }
      const where: Prisma.SlotWhereInput = {
        status: "OPEN",
        startsAt: { gt: now, gte: from, lt: to },
        ...(q.serviceType ? { serviceType: q.serviceType } : {}),
        ...(q.specialtyId ? { specialtyId: q.specialtyId } : {}),
        ...(q.examTypeId ? { examTypeId: q.examTypeId } : {}),
        ...(q.providerId ? { providerId: q.providerId } : {}),
        ...(q.clinicId ? { provider: { clinicId: q.clinicId } } : {}),
      };
      const rows = await prisma.slot.findMany({
        where,
        include: {
          provider: {
            select: {
              id: true,
              name: true,
              kind: true,
              clinic: { select: { id: true, name: true, city: true, timezone: true } },
            },
          },
        },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        ...pageArgs(q),
      });
      return toPage(rows, q.limit, ({ provider, ...s }) => ({
        ...s,
        provider: { id: provider.id, name: provider.name, kind: provider.kind },
        clinic: provider.clinic,
      }));
    },
  };
}
