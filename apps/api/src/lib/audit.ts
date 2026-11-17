import type { FastifyBaseLogger } from "fastify";
import { blindIndex } from "./crypto.js";
import type { Prisma, PrismaClient } from "./prisma.js";

export type AuditAction =
  | "REGISTER"
  | "EMAIL_VERIFIED"
  | "LOGIN_OK"
  | "LOGIN_FAIL"
  | "LOGIN_LOCKED"
  | "LOGOUT"
  | "MFA_SETUP"
  | "MFA_ENABLED"
  | "MFA_DISABLED"
  | "MFA_OK"
  | "MFA_FAIL"
  | "RECOVERY_CODE_USED"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET"
  | "SESSION_REVOKED"
  | "PROFILE_READ"
  | "DATA_EXPORT"
  | "ACCOUNT_DELETED";

export interface AuditEntry {
  userId?: string | null;
  action: AuditAction;
  ip?: string | undefined;
  /** Never put PII, secrets or tokens in here. */
  meta?: Prisma.InputJsonObject;
}

export function hashIp(ip: string | undefined): string | null {
  return ip ? blindIndex(ip, "ip") : null;
}

export async function audit(
  prisma: PrismaClient,
  log: FastifyBaseLogger,
  entry: AuditEntry,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        ipHash: hashIp(entry.ip),
        meta: entry.meta ?? {},
      },
    });
  } catch {
    // Auditing must not break the request; log only the action name.
    log.error({ action: entry.action }, "audit log write failed");
  }
}
