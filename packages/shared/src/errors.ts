import { z } from "zod";

// Stable machine-readable error codes. The API returns codes only; clients translate them.
export const ErrorCodes = [
  "BAD_REQUEST",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "PAYLOAD_TOO_LARGE",
  "INTERNAL_ERROR",
  "RATE_LIMITED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "CSRF_INVALID",
  "INVALID_CREDENTIALS",
  "EMAIL_NOT_VERIFIED",
  "INVALID_TOKEN",
  "WEAK_PASSWORD",
  "INVALID_CPF",
  "CONSENT_REQUIRED",
  "MFA_REQUIRED",
  "MFA_INVALID_CODE",
  "MFA_ALREADY_ENABLED",
  "MFA_NOT_SETUP",
] as const;

export const ErrorCodeSchema = z.enum(ErrorCodes);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
