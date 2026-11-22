import type { Session, User } from "@prisma/client";
import { hashIp } from "../../lib/audit.js";
import { newOpaqueToken, sha256Hex } from "../../lib/password.js";
import type { PrismaClient } from "../../lib/prisma.js";

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
export const WEB_IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;

export async function createSession(
  prisma: PrismaClient,
  input: {
    userId: string;
    userAgent?: string | undefined;
    ip?: string | undefined;
  },
): Promise<{ token: string; session: Session }> {
  const token = newOpaqueToken();
  const session = await prisma.session.create({
    data: {
      userId: input.userId,
      tokenHash: sha256Hex(token),
      userAgent: input.userAgent?.slice(0, 255) ?? null,
      ipHash: hashIp(input.ip),
      expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
    },
  });
  return { token, session };
}

/** Resolves an opaque token to a live session + user, applying expiry, idle timeout and sliding renewal. */
export async function findLiveSession(
  prisma: PrismaClient,
  token: string,
  via: "cookie" | "bearer",
): Promise<{ session: Session; user: User } | null> {
  const row = await prisma.session.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: { user: true },
  });
  if (!row) return null;
  const { user, ...session } = row;
  const now = Date.now();
  if (session.revokedAt || session.expiresAt.getTime() <= now) return null;
  if (via === "cookie" && now - session.lastUsedAt.getTime() > WEB_IDLE_TIMEOUT_MS) return null;
  if (user.deletedAt) return null;
  if (now - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    const touched = await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date(now), expiresAt: new Date(now + SESSION_LIFETIME_MS) },
    });
    return { session: touched, user };
  }
  return { session, user };
}

export function revokeSession(prisma: PrismaClient, sessionId: string) {
  return prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function revokeAllSessions(prisma: PrismaClient, userId: string, exceptSessionId?: string) {
  return prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}
