import type { Locale, RegisterInput } from "@medagenda/shared";
import { CONSENT_VERSION } from "@medagenda/shared";
import type { PatientProfile, Prisma, User } from "@prisma/client";
import { blindIndex, decrypt, encrypt } from "../../lib/crypto.js";

// Explicit field-level mappers: all encryption/decryption of User and PatientProfile columns
// happens here (no Prisma middleware), so the crypto stays visible and testable.

export const AAD = {
  userEmail: "User.emailEnc",
  profileFullName: "PatientProfile.fullNameEnc",
  profileCpf: "PatientProfile.cpfEnc",
  profileBirthDate: "PatientProfile.birthDateEnc",
  profilePhone: "PatientProfile.phoneEnc",
  profileHealthInsurance: "PatientProfile.healthInsuranceEnc",
  appointmentNotes: "Appointment.notesEnc",
} as const;

export interface DomainUser {
  id: string;
  email: string;
  locale: Locale;
  role: User["role"];
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

export function toDbUser(input: {
  email: string;
  passwordHash: string;
  locale: Locale;
}): Prisma.UserCreateInput {
  return {
    emailEnc: encrypt(input.email, AAD.userEmail),
    emailHash: blindIndex(input.email, "email"),
    passwordHash: input.passwordHash,
    locale: input.locale,
  };
}

export function fromDbUser(row: User): DomainUser {
  return {
    id: row.id,
    email: decrypt(Buffer.from(row.emailEnc), AAD.userEmail),
    locale: row.locale === "en" ? "en" : "pt-BR",
    role: row.role,
    emailVerifiedAt: row.emailVerifiedAt,
    createdAt: row.createdAt,
  };
}

export function toDbProfile(
  input: Pick<RegisterInput, "fullName" | "cpf" | "birthDate" | "phone">,
  now: Date,
): Prisma.PatientProfileCreateWithoutUserInput {
  return {
    fullNameEnc: encrypt(input.fullName, AAD.profileFullName),
    cpfEnc: input.cpf ? encrypt(input.cpf, AAD.profileCpf) : null,
    cpfHash: input.cpf ? blindIndex(input.cpf, "cpf") : null,
    birthDateEnc: encrypt(input.birthDate, AAD.profileBirthDate),
    phoneEnc: encrypt(input.phone, AAD.profilePhone),
    consentLgpdAt: now,
    consentVersion: CONSENT_VERSION,
  };
}

export interface DomainProfile {
  fullName: string;
  cpf: string | null;
  birthDate: string;
  phone: string;
  healthInsurance: string | null;
  consentLgpdAt: Date;
  consentVersion: string;
}

export function fromDbProfile(row: PatientProfile): DomainProfile {
  const dec = (b: Uint8Array | null, aad: string) =>
    b === null ? null : decrypt(Buffer.from(b), aad);
  return {
    fullName: decrypt(Buffer.from(row.fullNameEnc), AAD.profileFullName),
    cpf: dec(row.cpfEnc, AAD.profileCpf),
    birthDate: decrypt(Buffer.from(row.birthDateEnc), AAD.profileBirthDate),
    phone: decrypt(Buffer.from(row.phoneEnc), AAD.profilePhone),
    healthInsurance: dec(row.healthInsuranceEnc, AAD.profileHealthInsurance),
    consentLgpdAt: row.consentLgpdAt,
    consentVersion: row.consentVersion,
  };
}
