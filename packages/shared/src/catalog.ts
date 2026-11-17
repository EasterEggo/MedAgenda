import { z } from "zod";

export const MAX_SLOT_RANGE_DAYS = 31;
export const MAX_SLOT_RANGE_MS = MAX_SLOT_RANGE_DAYS * 24 * 60 * 60 * 1000;

export const IdSchema = z.string().min(1).max(64);
export const IdParamSchema = z.object({ id: IdSchema });

export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).max(64).optional(),
});

export const ServiceTypeSchema = z.enum(["CONSULTATION", "EXAM"]);
export type ServiceType = z.infer<typeof ServiceTypeSchema>;

const IsoDateTime = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

export const ClinicsQuerySchema = PaginationSchema.extend({
  city: z.string().trim().min(1).max(100).optional(),
});

export const ProvidersQuerySchema = PaginationSchema.extend({
  specialtyId: IdSchema.optional(),
  examTypeId: IdSchema.optional(),
  clinicId: IdSchema.optional(),
});

/** `from` defaults to now and `to` to from + 31 days; an explicit range may not exceed 31 days. */
export const SlotsQuerySchema = PaginationSchema.extend({
  serviceType: ServiceTypeSchema.optional(),
  specialtyId: IdSchema.optional(),
  examTypeId: IdSchema.optional(),
  clinicId: IdSchema.optional(),
  providerId: IdSchema.optional(),
  from: IsoDateTime.optional(),
  to: IsoDateTime.optional(),
})
  .refine((q) => !q.from || !q.to || q.to > q.from, { message: "VALIDATION_ERROR" })
  .refine((q) => !q.from || !q.to || q.to.getTime() - q.from.getTime() <= MAX_SLOT_RANGE_MS, {
    message: "DATE_RANGE_TOO_LARGE",
  });
export type SlotsQuery = z.infer<typeof SlotsQuerySchema>;
