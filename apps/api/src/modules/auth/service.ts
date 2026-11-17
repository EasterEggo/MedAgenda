import { randomInt } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Locale, LoginInput, RegisterInput } from "@medagenda/shared";
import type { EmailTokenPurpose, Session, User } from "@prisma/client";
import type { ApiConfig } from "../../config.js";
import { audit } from "../../lib/audit.js";
import { blindIndex } from "../../lib/crypto.js";
import { isCommonPassword } from "../../lib/common-passwords.js";
import { AppError, notFound } from "../../lib/errors.js";
import type { Mailer } from "../../lib/mailer.js";
import {
  dummyVerify,
  hashSecret,
  newOpaqueToken,
  sha256Hex,
  verifySecret,
} from "../../lib/password.js";
import type { PrismaClient } from "../../lib/prisma.js";
import { checkTotp, newTotpSecret, totpUri } from "../../lib/totp.js";
import { buildEmail } from "./emails.js";
import { fromDbTotpSecret, fromDbUser, toDbProfile, toDbTotpSecret, toDbUser } from "./mappers.js";
import { createSession, revokeAllSessions, revokeSession } from "./sessions.js";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MS = 15 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I/L

export interface RequestMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface AuthDeps {
  prisma: PrismaClient;
  mailer: Mailer;
  config: ApiConfig;
  log: FastifyBaseLogger;
}

function generateRecoveryCode(): string {
  const chars = Array.from(
    { length: 10 },
    () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)],
  );
  return `${chars.slice(0, 5).join("")}-${chars.slice(5).join("")}`;
}

function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function createAuthService(deps: AuthDeps) {
  const { prisma, mailer, config, log } = deps;
  const auditLog = (entry: Parameters<typeof audit>[2]) => audit(prisma, log, entry);

  /** Fire-and-forget so response time does not reveal whether an email was sent. */
  function sendMail(message: Parameters<Mailer["send"]>[0]): void {
    mailer.send(message).catch(() => {
      log.error("failed to send email"); // never log the message (it contains tokens)
    });
  }

  async function issueEmailToken(
    userId: string,
    purpose: EmailTokenPurpose,
    ttlMs: number,
  ): Promise<string> {
    const token = newOpaqueToken();
    await prisma.$transaction([
      prisma.emailToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.emailToken.create({
        data: {
          userId,
          purpose,
          tokenHash: sha256Hex(token),
          expiresAt: new Date(Date.now() + ttlMs),
        },
      }),
    ]);
    return token;
  }

  const link = (locale: Locale, path: string, token?: string) =>
    `${config.WEB_URL}/${locale}/${path}${token ? `?token=${encodeURIComponent(token)}` : ""}`;

  function assertStrongPassword(password: string): void {
    if (isCommonPassword(password)) throw new AppError("WEAK_PASSWORD", 400);
  }

  /** Counts a failed credential/MFA attempt and locks the account after MAX_FAILED_LOGINS. */
  async function recordFailure(user: User, meta: RequestMeta): Promise<boolean> {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (updated.failedLoginCount >= MAX_FAILED_LOGINS) {
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(Date.now() + LOCK_MS), failedLoginCount: 0 },
      });
      await auditLog({ userId: user.id, action: "LOGIN_LOCKED", ip: meta.ip });
      return true;
    }
    return false;
  }

  async function consumeTotp(user: User, code: string): Promise<boolean> {
    const secret = fromDbTotpSecret(user);
    if (!secret) return false;
    const check = checkTotp(secret, code, user.totpLastStep);
    if (!check.valid) return false;
    // Conditional update makes concurrent replays of the same code race-safe.
    const res = await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: check.step } }],
      },
      data: { totpLastStep: check.step },
    });
    return res.count === 1;
  }

  async function consumeRecoveryCode(userId: string, input: string): Promise<boolean> {
    const normalized = normalizeRecoveryCode(input);
    const codes = await prisma.recoveryCode.findMany({ where: { userId, usedAt: null } });
    for (const rc of codes) {
      if (await verifySecret(rc.codeHash, normalized)) {
        const res = await prisma.recoveryCode.updateMany({
          where: { id: rc.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        return res.count === 1;
      }
    }
    return false;
  }

  return {
    async register(input: RegisterInput, meta: RequestMeta): Promise<void> {
      assertStrongPassword(input.password);
      // Always hash first so existing/new emails cost the same.
      const passwordHash = await hashSecret(input.password);
      const emailHash = blindIndex(input.email, "email");
      const existing = await prisma.user.findUnique({ where: { emailHash } });
      if (existing) {
        if (!existing.deletedAt) {
          const u = fromDbUser(existing);
          sendMail(buildEmail("alreadyRegistered", u.locale, u.email, link(u.locale, "login")));
        }
        return;
      }
      if (input.cpf) {
        const taken = await prisma.patientProfile.findUnique({
          where: { cpfHash: blindIndex(input.cpf, "cpf") },
        });
        if (taken) return; // indistinguishable from success
      }
      let userId: string;
      try {
        const user = await prisma.user.create({
          data: {
            ...toDbUser({ email: input.email, passwordHash, locale: input.locale }),
            profile: { create: toDbProfile(input, new Date()) },
          },
        });
        userId = user.id;
      } catch (err) {
        if ((err as { code?: string }).code === "P2002") return; // lost a race with a concurrent register
        throw err;
      }
      const token = await issueEmailToken(userId, "VERIFY", VERIFY_TTL_MS);
      sendMail(
        buildEmail("verify", input.locale, input.email, link(input.locale, "verify-email", token)),
      );
      await auditLog({ userId, action: "REGISTER", ip: meta.ip });
    },

    async verifyEmail(token: string, meta: RequestMeta): Promise<void> {
      const row = await prisma.emailToken.findUnique({ where: { tokenHash: sha256Hex(token) } });
      if (!row || row.purpose !== "VERIFY") throw new AppError("INVALID_TOKEN", 400);
      const now = new Date();
      const ok = await prisma.$transaction(async (tx) => {
        const used = await tx.emailToken.updateMany({
          where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (used.count !== 1) return false;
        await tx.user.updateMany({
          where: { id: row.userId, deletedAt: null, emailVerifiedAt: null },
          data: { emailVerifiedAt: now },
        });
        return true;
      });
      if (!ok) throw new AppError("INVALID_TOKEN", 400);
      await auditLog({ userId: row.userId, action: "EMAIL_VERIFIED", ip: meta.ip });
    },

    async resendVerification(email: string): Promise<void> {
      const user = await prisma.user.findFirst({
        where: { emailHash: blindIndex(email, "email"), deletedAt: null, emailVerifiedAt: null },
      });
      if (!user) return;
      const u = fromDbUser(user);
      const token = await issueEmailToken(user.id, "VERIFY", VERIFY_TTL_MS);
      sendMail(buildEmail("verify", u.locale, u.email, link(u.locale, "verify-email", token)));
    },

    async login(
      input: LoginInput,
      meta: RequestMeta,
    ): Promise<{ token: string; mfaRequired: boolean; session: Session }> {
      const user = await prisma.user.findFirst({
        where: { emailHash: blindIndex(input.email, "email"), deletedAt: null },
      });
      if (!user) {
        await dummyVerify(input.password);
        await auditLog({ action: "LOGIN_FAIL", ip: meta.ip });
        throw new AppError("INVALID_CREDENTIALS", 401);
      }
      // Verify even when locked (same cost); a locked account answers exactly like a wrong password.
      const passwordOk = await verifySecret(user.passwordHash, input.password);
      const locked = user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now();
      if (locked) {
        await auditLog({
          userId: user.id,
          action: "LOGIN_FAIL",
          ip: meta.ip,
          meta: { locked: true },
        });
        throw new AppError("INVALID_CREDENTIALS", 401);
      }
      if (!passwordOk) {
        await recordFailure(user, meta);
        await auditLog({ userId: user.id, action: "LOGIN_FAIL", ip: meta.ip });
        throw new AppError("INVALID_CREDENTIALS", 401);
      }
      if (!user.emailVerifiedAt) throw new AppError("EMAIL_NOT_VERIFIED", 403);

      const mfaRequired = user.totpEnabledAt !== null;
      await prisma.user.update({
        where: { id: user.id },
        data: mfaRequired ? { lockedUntil: null } : { failedLoginCount: 0, lockedUntil: null }, // with MFA the counter resets after the second step
      });
      const { token, session } = await createSession(prisma, {
        userId: user.id,
        mfaPassed: !mfaRequired,
        userAgent: meta.userAgent,
        ip: meta.ip,
      });
      await auditLog({ userId: user.id, action: "LOGIN_OK", ip: meta.ip, meta: { mfaRequired } });
      return { token, mfaRequired, session };
    },

    async logout(session: Session, meta: RequestMeta): Promise<void> {
      await revokeSession(prisma, session.id);
      await auditLog({ userId: session.userId, action: "LOGOUT", ip: meta.ip });
    },

    async verifyMfa(
      user: User,
      session: Session,
      body: { code: string } | { recoveryCode: string },
      meta: RequestMeta,
    ): Promise<void> {
      if (!user.totpEnabledAt) throw new AppError("MFA_NOT_SETUP", 400);
      if (session.mfaPassed) return;
      if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
        await revokeSession(prisma, session.id);
        throw new AppError("UNAUTHENTICATED", 401);
      }
      const usingRecovery = "recoveryCode" in body;
      const ok = usingRecovery
        ? await consumeRecoveryCode(user.id, body.recoveryCode)
        : await consumeTotp(user, body.code);
      if (!ok) {
        const locked = await recordFailure(user, meta);
        await auditLog({ userId: user.id, action: "MFA_FAIL", ip: meta.ip });
        if (locked) await revokeSession(prisma, session.id);
        throw new AppError("MFA_INVALID_CODE", 401);
      }
      await prisma.$transaction([
        prisma.session.update({ where: { id: session.id }, data: { mfaPassed: true } }),
        prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null },
        }),
      ]);
      await auditLog({
        userId: user.id,
        action: usingRecovery ? "RECOVERY_CODE_USED" : "MFA_OK",
        ip: meta.ip,
      });
    },

    async mfaSetup(
      user: User,
      meta: RequestMeta,
    ): Promise<{ otpauthUri: string; qrDataUrl: string }> {
      if (user.totpEnabledAt) throw new AppError("MFA_ALREADY_ENABLED", 409);
      const secret = newTotpSecret();
      await prisma.user.update({
        where: { id: user.id },
        data: { totpSecretEnc: toDbTotpSecret(secret), totpLastStep: null },
      });
      const { default: QRCode } = await import("qrcode");
      const otpauthUri = totpUri(secret, fromDbUser(user).email);
      const qrDataUrl = await QRCode.toDataURL(otpauthUri);
      await auditLog({ userId: user.id, action: "MFA_SETUP", ip: meta.ip });
      return { otpauthUri, qrDataUrl };
    },

    async mfaEnable(
      user: User,
      session: Session,
      code: string,
      meta: RequestMeta,
    ): Promise<string[]> {
      if (user.totpEnabledAt) throw new AppError("MFA_ALREADY_ENABLED", 409);
      if (!user.totpSecretEnc) throw new AppError("MFA_NOT_SETUP", 400);
      if (!(await consumeTotp(user, code))) throw new AppError("MFA_INVALID_CODE", 401);
      const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
      const hashes = await Promise.all(codes.map((c) => hashSecret(normalizeRecoveryCode(c))));
      await prisma.$transaction([
        prisma.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date() } }),
        prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
        prisma.recoveryCode.createMany({
          data: hashes.map((codeHash) => ({ userId: user.id, codeHash })),
        }),
      ]);
      // Sessions created before 2FA existed never proved a second factor.
      await revokeAllSessions(prisma, user.id, session.id);
      await auditLog({ userId: user.id, action: "MFA_ENABLED", ip: meta.ip });
      return codes;
    },

    async mfaDisable(
      user: User,
      session: Session,
      input: { password: string; code: string },
      meta: RequestMeta,
    ): Promise<void> {
      if (!user.totpEnabledAt) throw new AppError("MFA_NOT_SETUP", 400);
      if (!(await verifySecret(user.passwordHash, input.password))) {
        await recordFailure(user, meta);
        throw new AppError("INVALID_CREDENTIALS", 401);
      }
      if (!(await consumeTotp(user, input.code))) {
        await recordFailure(user, meta);
        throw new AppError("MFA_INVALID_CODE", 401);
      }
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null },
        }),
        prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
      ]);
      await revokeAllSessions(prisma, user.id, session.id);
      await auditLog({ userId: user.id, action: "MFA_DISABLED", ip: meta.ip });
    },

    async listSessions(userId: string, currentId: string) {
      const rows = await prisma.session.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastUsedAt: "desc" },
      });
      return rows.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        expiresAt: s.expiresAt,
        userAgent: s.userAgent,
        mfaPassed: s.mfaPassed,
        current: s.id === currentId,
      }));
    },

    async revokeSessionById(userId: string, id: string, meta: RequestMeta): Promise<void> {
      // Scoped by userId: another user's session id is indistinguishable from a missing one.
      const res = await prisma.session.updateMany({
        where: { id, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (res.count !== 1) throw notFound();
      await auditLog({ userId, action: "SESSION_REVOKED", ip: meta.ip });
    },

    async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
      const user = await prisma.user.findFirst({
        where: { emailHash: blindIndex(email, "email"), deletedAt: null },
      });
      if (!user) return;
      const u = fromDbUser(user);
      const token = await issueEmailToken(user.id, "RESET", RESET_TTL_MS);
      sendMail(buildEmail("reset", u.locale, u.email, link(u.locale, "reset", token)));
      await auditLog({ userId: user.id, action: "PASSWORD_RESET_REQUESTED", ip: meta.ip });
    },

    async resetPassword(token: string, password: string, meta: RequestMeta): Promise<void> {
      assertStrongPassword(password);
      const row = await prisma.emailToken.findUnique({ where: { tokenHash: sha256Hex(token) } });
      if (!row || row.purpose !== "RESET") throw new AppError("INVALID_TOKEN", 400);
      const passwordHash = await hashSecret(password);
      const now = new Date();
      const ok = await prisma.$transaction(async (tx) => {
        const used = await tx.emailToken.updateMany({
          where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (used.count !== 1) return false;
        const upd = await tx.user.updateMany({
          where: { id: row.userId, deletedAt: null },
          data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
        });
        if (upd.count !== 1) return false;
        await tx.session.updateMany({
          where: { userId: row.userId, revokedAt: null },
          data: { revokedAt: now },
        });
        return true;
      });
      if (!ok) throw new AppError("INVALID_TOKEN", 400);
      await auditLog({ userId: row.userId, action: "PASSWORD_RESET", ip: meta.ip });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
