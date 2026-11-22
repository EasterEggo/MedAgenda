import { z } from "zod";
import { isValidCpf } from "./cpf.js";

export const LocaleSchema = z.enum(["pt-BR", "en"]);
export type Locale = z.infer<typeof LocaleSchema>;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const CONSENT_VERSION = "2026-11";

// Issue messages that equal an ErrorCode become the API error code (see API error handler).
export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { message: "WEAK_PASSWORD" })
  .max(PASSWORD_MAX_LENGTH, { message: "WEAK_PASSWORD" });

export const EmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

const CpfSchema = z
  .string()
  .trim()
  .refine(isValidCpf, { message: "INVALID_CPF" })
  .transform((v) => v.replace(/\D/g, ""));

export const RegisterSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  fullName: z.string().trim().min(2).max(200),
  cpf: CpfSchema.optional(),
  birthDate: z.iso.date(),
  phone: z.string().trim().min(8).max(30),
  locale: LocaleSchema,
  consentLgpd: z.literal(true, { message: "CONSENT_REQUIRED" }),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

export const TokenSchema = z.object({ token: z.string().min(20).max(200) });
export const VerifyEmailSchema = TokenSchema;
export const EmailOnlySchema = z.object({ email: EmailSchema });
export const ForgotPasswordSchema = EmailOnlySchema;
export const ResendVerificationSchema = EmailOnlySchema;

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  // "mobile" clients receive the opaque token in the body and use Authorization: Bearer.
  client: z.enum(["web", "mobile"]).default("web"),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: PasswordSchema,
});

export const DeleteAccountSchema = z.object({
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const SessionIdParamSchema = z.object({ id: z.string().min(1).max(64) });

export const LoginResponseSchema = z.object({
  csrfToken: z.string().optional(),
  token: z.string().optional(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
