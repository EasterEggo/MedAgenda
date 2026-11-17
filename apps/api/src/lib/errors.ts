import type { ErrorCode } from "@medagenda/shared";

/** Thrown by services and guards; the error handler renders it as `{ error: { code } }`. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly statusCode: number,
  ) {
    super(code);
    this.name = "AppError";
  }
}

export const unauthenticated = () => new AppError("UNAUTHENTICATED", 401);
export const forbidden = () => new AppError("FORBIDDEN", 403);
export const notFound = () => new AppError("NOT_FOUND", 404);
