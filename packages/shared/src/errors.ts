import { z } from "zod";

// Stable machine-readable error codes. The API returns codes only; clients translate them.
export const ErrorCodes = [
  "BAD_REQUEST",
  "NOT_FOUND",
  "PAYLOAD_TOO_LARGE",
  "INTERNAL_ERROR",
] as const;

export const ErrorCodeSchema = z.enum(ErrorCodes);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
