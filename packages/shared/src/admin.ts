import { z } from "zod";
import { IdSchema, ServiceTypeSchema } from "./catalog.js";

const Name = z.string().trim().min(1).max(200);
const Slug = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const SpecialtyInputSchema = z.object({ slug: Slug, namePt: Name, nameEn: Name });
export const SpecialtyPatchSchema = SpecialtyInputSchema.partial();

export const ExamInputSchema = z.object({
  slug: Slug,
  namePt: Name,
  nameEn: Name,
  preparationPt: z.string().trim().max(2000),
  preparationEn: z.string().trim().max(2000),
  durationMin: z.number().int().min(5).max(480),
});
export const ExamPatchSchema = ExamInputSchema.partial();

const ClinicBase = z.object({
  name: Name,
  address: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(2).max(50),
  phone: z.string().trim().min(5).max(30),
  timezone: z
    .string()
    .trim()
    .max(64)
    .refine(
      (tz) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: "VALIDATION_ERROR" },
    ),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});
export const ClinicInputSchema = ClinicBase.extend({
  timezone: ClinicBase.shape.timezone.default("America/Sao_Paulo"),
});
// Patch schemas must not carry defaults, or an omitted field would be reset.
export const ClinicPatchSchema = ClinicBase.partial();

export const ProviderKindSchema = z.enum(["DOCTOR", "EXAM_RESOURCE"]);
const ProviderBase = z.object({
  clinicId: IdSchema,
  name: Name,
  crm: z.string().trim().min(1).max(30).nullable().optional(),
  kind: ProviderKindSchema,
  bioPt: z.string().trim().max(2000),
  bioEn: z.string().trim().max(2000),
  specialtyIds: z.array(IdSchema).max(50),
  examTypeIds: z.array(IdSchema).max(50),
});
export const ProviderInputSchema = ProviderBase.extend({
  bioPt: ProviderBase.shape.bioPt.default(""),
  bioEn: ProviderBase.shape.bioEn.default(""),
  specialtyIds: ProviderBase.shape.specialtyIds.default([]),
  examTypeIds: ProviderBase.shape.examTypeIds.default([]),
});
export const ProviderPatchSchema = ProviderBase.partial();

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const MAX_GENERATE_DAYS = 92;

export const GenerateSlotsSchema = z
  .object({
    providerId: IdSchema,
    /** 0 = Sunday ... 6 = Saturday, evaluated in the clinic's timezone. */
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    startTime: TimeSchema,
    endTime: TimeSchema,
    durationMin: z.number().int().min(5).max(480),
    from: z.iso.date(),
    to: z.iso.date(),
    serviceType: ServiceTypeSchema,
    specialtyId: IdSchema.optional(),
    examTypeId: IdSchema.optional(),
  })
  .refine((v) => v.endTime > v.startTime, { message: "VALIDATION_ERROR" })
  .refine((v) => v.to >= v.from, { message: "VALIDATION_ERROR" })
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 + 1 <= MAX_GENERATE_DAYS, {
    message: "DATE_RANGE_TOO_LARGE",
  })
  .refine(
    (v) =>
      v.serviceType === "CONSULTATION"
        ? v.specialtyId !== undefined && v.examTypeId === undefined
        : v.examTypeId !== undefined && v.specialtyId === undefined,
    { message: "VALIDATION_ERROR" },
  );

export const SlotPatchSchema = z.object({ status: z.enum(["OPEN", "BLOCKED"]) });
