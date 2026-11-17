import {
  ClinicInputSchema,
  ExamInputSchema,
  ProviderInputSchema,
  SpecialtyInputSchema,
} from "@medagenda/shared";
import type { z } from "zod";
import type { AdminEntity } from "@/lib/api/endpoints";

export type FormValues = Record<string, string | string[]>;

export type FieldType = "text" | "textarea" | "number" | "select" | "multi";

export interface FieldDef {
  /** Field name, also the i18n key suffix under `admin.fields`. */
  name: string;
  type: FieldType;
  /** Name of the option list (supplied by the page) for select and multi fields. */
  options?: "clinics" | "specialties" | "exams" | "providerKinds";
  /** Optional free-text fields send null / omit when left empty. */
  optional?: boolean;
  /** Primary-key-like fields (slug) are free text with a hint. */
  hint?: string;
}

export interface EntityConfig {
  entity: AdminEntity;
  schema: z.ZodType;
  fields: FieldDef[];
  /** Columns shown in the table (field names). */
  columns: string[];
}

export const ENTITIES: Record<AdminEntity, EntityConfig> = {
  specialties: {
    entity: "specialties",
    schema: SpecialtyInputSchema,
    fields: [
      { name: "slug", type: "text", hint: "slug" },
      { name: "namePt", type: "text" },
      { name: "nameEn", type: "text" },
    ],
    columns: ["slug", "namePt", "nameEn"],
  },
  exams: {
    entity: "exams",
    schema: ExamInputSchema,
    fields: [
      { name: "slug", type: "text", hint: "slug" },
      { name: "namePt", type: "text" },
      { name: "nameEn", type: "text" },
      { name: "preparationPt", type: "textarea" },
      { name: "preparationEn", type: "textarea" },
      { name: "durationMin", type: "number" },
    ],
    columns: ["slug", "namePt", "nameEn", "durationMin"],
  },
  clinics: {
    entity: "clinics",
    schema: ClinicInputSchema,
    fields: [
      { name: "name", type: "text" },
      { name: "address", type: "text" },
      { name: "city", type: "text" },
      { name: "state", type: "text" },
      { name: "phone", type: "text" },
      { name: "timezone", type: "text" },
    ],
    columns: ["name", "city", "state", "phone"],
  },
  providers: {
    entity: "providers",
    schema: ProviderInputSchema,
    fields: [
      { name: "clinicId", type: "select", options: "clinics" },
      { name: "name", type: "text" },
      { name: "crm", type: "text", optional: true },
      { name: "kind", type: "select", options: "providerKinds" },
      { name: "bioPt", type: "textarea", optional: true },
      { name: "bioEn", type: "textarea", optional: true },
      { name: "specialtyIds", type: "multi", options: "specialties" },
      { name: "examTypeIds", type: "multi", options: "exams" },
    ],
    columns: ["name", "kind", "crm", "clinicId"],
  },
};

export function emptyValues(config: EntityConfig): FormValues {
  const values: FormValues = {};
  for (const f of config.fields) {
    values[f.name] = f.type === "multi" ? [] : f.name === "timezone" ? "America/Sao_Paulo" : "";
  }
  if (config.entity === "providers") values.kind = "DOCTOR";
  return values;
}

/** Converts an API row into form values. */
export function toFormValues(config: EntityConfig, row: Record<string, unknown>): FormValues {
  const values: FormValues = {};
  for (const f of config.fields) {
    const raw = row[f.name];
    values[f.name] = f.type === "multi" ? ((raw as string[] | undefined) ?? []) : String(raw ?? "");
  }
  return values;
}

/** Converts form values into an API payload (numbers parsed, empty optional text as null). */
export function toPayload(config: EntityConfig, values: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of config.fields) {
    const v = values[f.name];
    if (f.type === "number")
      out[f.name] = typeof v === "string" && v.trim() !== "" ? Number(v) : "";
    else if (f.type === "multi") out[f.name] = v ?? [];
    else if (f.optional && typeof v === "string" && v.trim() === "") {
      if (f.name === "crm") out[f.name] = null;
      else out[f.name] = "";
    } else out[f.name] = v ?? "";
  }
  return out;
}
