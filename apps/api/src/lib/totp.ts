import { generateSecret, generateURI, verifySync } from "otplib";

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_ISSUER = "MedAgenda";

export function newTotpSecret(): string {
  return generateSecret();
}

export function totpUri(secret: string, accountLabel: string): string {
  return generateURI({ issuer: TOTP_ISSUER, label: accountLabel, secret });
}

export type TotpCheck = { valid: false } | { valid: true; step: number };

/**
 * Verifies a 6-digit code with a +/-1 step window. Codes whose time-step is <= lastStep are
 * rejected, which is what blocks replay of an already used code.
 */
export function checkTotp(secret: string, token: string, lastStep: number | null): TotpCheck {
  const result = verifySync({
    secret,
    token,
    epochTolerance: TOTP_PERIOD_SECONDS,
    afterTimeStep: lastStep ?? 0,
  });
  if (result.valid && "timeStep" in result && typeof result.timeStep === "number") {
    return { valid: true, step: result.timeStep };
  }
  return { valid: false };
}
