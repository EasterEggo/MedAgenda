import { z } from "zod";
import { LocaleSchema } from "./auth.js";

export const UpdateProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(200),
    birthDate: z.iso.date(),
    phone: z.string().trim().min(8).max(30),
    healthInsurance: z.string().trim().min(1).max(200).nullable(),
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "VALIDATION_ERROR" });

export const UpdateLocaleSchema = z.object({ locale: LocaleSchema });
