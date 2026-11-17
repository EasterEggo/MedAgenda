import { ErrorCodes, type ErrorCode } from "@medagenda/shared";
import type { z } from "zod";
import { AppError } from "./errors.js";

const KNOWN = new Set<string>(ErrorCodes);

/** Parses input with a shared Zod schema. A refinement message that is an ErrorCode becomes the API code. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const specific = result.error.issues.find((i) => KNOWN.has(i.message));
  const code: ErrorCode = specific ? (specific.message as ErrorCode) : "VALIDATION_ERROR";
  throw new AppError(code, 400);
}
