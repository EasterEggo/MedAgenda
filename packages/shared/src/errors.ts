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
  "SLOT_ALREADY_BOOKED",
  "USER_TIME_CONFLICT",
  "CANCELLATION_WINDOW_CLOSED",
  "APPOINTMENT_NOT_SCHEDULED",
  "DATE_RANGE_TOO_LARGE",
  "CONFLICT",
  "IN_USE",
] as const;

export const ErrorCodeSchema = z.enum(ErrorCodes);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
