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
    expect(() =>
      HealthResponseSchema.parse({ status: "down", timestamp: "2026-11-16T12:00:00Z" }),
    ).toThrow();
    expect(() => HealthResponseSchema.parse({ status: "ok", timestamp: "yesterday" })).toThrow();
  });
});

describe("ApiErrorSchema", () => {
  it("accepts a coded error and rejects unknown codes", () => {
    expect(ApiErrorSchema.parse({ error: { code: "NOT_FOUND" } }).error.code).toBe("NOT_FOUND");
    expect(() => ApiErrorSchema.parse({ error: { code: "Something went wrong" } })).toThrow();
  });
});

import { RegisterSchema, MfaVerifySchema, isValidCpf } from "../src/index.js";

describe("isValidCpf", () => {
  it("validates check digits and rejects repeated digits", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
    expect(isValidCpf("52998224726")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
  });
});

describe("RegisterSchema", () => {
  const base = {
    email: "  A@B.com ",
    password: "correct horse battery",
    fullName: "Ana Silva",
    birthDate: "1990-05-01",
    phone: "+55 11 99999-0000",
    locale: "pt-BR",
    consentLgpd: true,
  };
  it("normalizes email and cpf", () => {
    const r = RegisterSchema.parse({ ...base, cpf: "529.982.247-25" });
    expect(r.email).toBe("a@b.com");
    expect(r.cpf).toBe("52998224725");
  });
  it("rejects short passwords, bad cpf and missing consent", () => {
    expect(RegisterSchema.safeParse({ ...base, password: "short" }).success).toBe(false);
    expect(RegisterSchema.safeParse({ ...base, cpf: "123" }).success).toBe(false);
    expect(RegisterSchema.safeParse({ ...base, consentLgpd: false }).success).toBe(false);
  });
});

describe("MfaVerifySchema", () => {
  it("accepts exactly one of code or recoveryCode", () => {
    expect(MfaVerifySchema.safeParse({ code: "123456" }).success).toBe(true);
    expect(MfaVerifySchema.safeParse({ recoveryCode: "ABCDE-FGHIJ" }).success).toBe(true);
    expect(MfaVerifySchema.safeParse({ code: "123456", recoveryCode: "ABCDE-FGHIJ" }).success).toBe(
      false,
    );
    expect(MfaVerifySchema.safeParse({}).success).toBe(false);
  });
});
