import { describe, expect, it } from "vitest";
import { ApiErrorSchema, HealthResponseSchema } from "../src/index.js";

describe("HealthResponseSchema", () => {
  it("accepts an ok status with an ISO timestamp", () => {
    const parsed = HealthResponseSchema.parse({
      status: "ok",
      timestamp: "2026-11-16T12:00:00.000Z",
    });
    expect(parsed.status).toBe("ok");
  });

  it("rejects other statuses and malformed timestamps", () => {
    expect(() => HealthResponseSchema.parse({ status: "down", timestamp: "2026-11-16T12:00:00Z" })).toThrow();
    expect(() => HealthResponseSchema.parse({ status: "ok", timestamp: "yesterday" })).toThrow();
  });
});

describe("ApiErrorSchema", () => {
  it("accepts a coded error and rejects unknown codes", () => {
    expect(ApiErrorSchema.parse({ error: { code: "NOT_FOUND" } }).error.code).toBe("NOT_FOUND");
    expect(() => ApiErrorSchema.parse({ error: { code: "Something went wrong" } })).toThrow();
  });
});
