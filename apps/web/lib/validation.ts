import type { z } from "zod";

/** Map of field name -> i18n key of the message to show. */
export type FieldErrors<K extends string = string> = Partial<Record<K, string>>;

type Issue = z.core.$ZodIssue;

const API_CODES = new Set<string>([
  "WEAK_PASSWORD",
  "INVALID_CPF",
  "CONSENT_REQUIRED",
  "VALIDATION_ERROR",
  "DATE_RANGE_TOO_LARGE",
]);

/** Translates one Zod issue into an i18n key. Issue messages that equal an API error code map to `errors.<CODE>`. */
export function issueMessageKey(issue: Issue): string {
  if (API_CODES.has(issue.message)) return `errors.${issue.message}`;
  if (issue.code === "invalid_format" && issue.format === "email") return "auth.validation.email";
  if (issue.code === "invalid_type" || (issue.code === "too_small" && issue.minimum === 1)) {
    return "auth.validation.required";
  }
  return "auth.validation.invalid";
}

export interface ValidationResult<T> {
  data?: T;
  errors: FieldErrors;
}

/** Validates form values with a shared Zod schema. Only the first issue per field is kept. */
export function validateForm<S extends z.ZodType>(
  schema: S,
  values: unknown,
): ValidationResult<z.output<S>> {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: {} };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "_form");
    const raw = (values as Record<string, unknown> | null)?.[field];
    // An empty string is "required" whatever the schema's minimum length is.
    errors[field] ??= raw === "" ? "auth.validation.required" : issueMessageKey(issue);
  }
  return { errors };
}
