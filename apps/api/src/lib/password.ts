import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";

// argon2id, memoryCost 19456 KiB, timeCost 2, parallelism 1 (INSTRUCTIONS.md section 1).
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashSecret(secret: string): Promise<string> {
  return argon2.hash(secret, OPTIONS);
}

export async function verifySecret(hash: string, secret: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, secret);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/** Burns the same CPU/memory as a real verification so unknown accounts are not distinguishable by timing. */
export async function dummyVerify(secret: string): Promise<void> {
  dummyHash ??= hashSecret(randomBytes(16).toString("hex"));
  await verifySecret(await dummyHash, secret);
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Opaque 32-byte random token, base64url encoded. Only its SHA-256 is ever stored. */
export function newOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}
