import { afterAll, describe, expect, it } from "vitest";
import { ApiErrorSchema, HealthResponseSchema } from "@medagenda/shared";
import { buildApp } from "../src/app.js";

const app = buildApp({ logger: false });

afterAll(async () => {
  await app.close();
});

describe("GET /health", () => {
  it("returns 200 with an ok status", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(HealthResponseSchema.parse(res.json()).status).toBe("ok");
  });
});

describe("unknown routes", () => {
  it("return a coded NOT_FOUND error", async () => {
    const res = await app.inject({ method: "GET", url: "/does-not-exist" });
    expect(res.statusCode).toBe(404);
    expect(ApiErrorSchema.parse(res.json()).error.code).toBe("NOT_FOUND");
  });
});
