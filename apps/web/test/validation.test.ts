import { describe, expect, it } from "vitest";
import { LoginSchema, ResetPasswordSchema } from "@medagenda/shared";
import ptBR from "@medagenda/shared/i18n/pt-BR.json";
import { validateForm } from "@/lib/validation";
import {
  buildRegisterInput,
  EMPTY_REGISTER_VALUES,
  validateRegisterStep,
  type RegisterValues,
} from "@/lib/register-steps";

const valid: RegisterValues = {
  email: "Ana@Example.com ",
  password: "correct horse battery",
  confirmPassword: "correct horse battery",
  fullName: "Ana Souza",
  cpf: "529.982.247-25",
  birthDate: "1990-05-20",
  phone: "+55 11 99999-0000",
  consent: true,
};

function resolve(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], ptBR);
}

describe("validateForm", () => {
  it("returns i18n keys per field, all present in the catalog", () => {
    const { errors } = validateForm(LoginSchema, { email: "nope", password: "" });
    expect(errors.email).toBe("auth.validation.email");
    expect(errors.password).toBe("auth.validation.required");
    expect(resolve(errors.email!)).toBeTypeOf("string");
  });

  it("maps API-code messages to errors.<CODE>", () => {
    const { errors } = validateForm(ResetPasswordSchema, {
      token: "x".repeat(30),
      password: "short",
    });
    expect(errors.password).toBe("errors.WEAK_PASSWORD");
  });
});

describe("register steps", () => {
  it("flags empty account step", () => {
    const errors = validateRegisterStep("account", EMPTY_REGISTER_VALUES);
    expect(Object.keys(errors).sort()).toEqual(["email", "password"]);
  });

  it("detects password mismatch", () => {
    expect(validateRegisterStep("account", { ...valid, confirmPassword: "other" })).toEqual({
      confirmPassword: "auth.validation.passwordMismatch",
    });
  });

  it("validates personal data, with CPF optional but checked when given", () => {
    expect(validateRegisterStep("personal", { ...valid, cpf: "" })).toEqual({});
    expect(validateRegisterStep("personal", { ...valid, cpf: "111.111.111-11" })).toEqual({
      cpf: "errors.INVALID_CPF",
    });
    expect(validateRegisterStep("personal", { ...valid, fullName: "", phone: "" })).toMatchObject({
      fullName: "auth.validation.required",
      phone: "auth.validation.required",
    });
  });

  it("requires LGPD consent", () => {
    expect(validateRegisterStep("consent", { ...valid, consent: false })).toEqual({
      consentLgpd: "errors.CONSENT_REQUIRED",
    });
    expect(validateRegisterStep("consent", valid)).toEqual({});
  });

  it("builds a normalised API payload", () => {
    const input = buildRegisterInput(valid, "en");
    expect(input).toMatchObject({
      email: "ana@example.com",
      cpf: "52998224725",
      locale: "en",
      consentLgpd: true,
    });
  });
});
