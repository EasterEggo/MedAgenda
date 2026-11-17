import type { FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import type { Role } from "@prisma/client";
import { AppError, forbidden, unauthenticated } from "../../lib/errors.js";
import type { AuthContext } from "../../types.js";
import { findLiveSession } from "./sessions.js";

export const SESSION_COOKIE = "sid";

export function extractToken(
  request: FastifyRequest,
): { token: string; via: "cookie" | "bearer" } | null {
  const header = request.headers.authorization;
  if (header !== undefined) {
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    return match?.[1] ? { token: match[1], via: "bearer" } : null;
  }
  const cookie = request.cookies[SESSION_COOKIE];
  return cookie ? { token: cookie, via: "cookie" } : null;
}

export async function resolveAuth(request: FastifyRequest): Promise<AuthContext | null> {
  if (request.auth) return request.auth;
  const found = extractToken(request);
  if (!found) return null;
  const live = await findLiveSession(request.server.prisma, found.token, found.via);
  if (!live) return null;
  request.auth = { ...live, via: found.via };
  return request.auth;
}

/** Requires a valid session. With `mfa: true`, the session must also have passed the TOTP step. */
export function requireAuth(opts: { mfa: boolean } = { mfa: true }): preHandlerAsyncHookHandler {
  return async (request) => {
    const auth = await resolveAuth(request);
    if (!auth) throw unauthenticated();
    if (opts.mfa && !auth.session.mfaPassed) throw new AppError("MFA_REQUIRED", 403);
  };
}

/** Use after requireAuth. Admins must additionally have TOTP enabled (and passed in this session). */
export function requireRole(role: Role): preHandlerAsyncHookHandler {
  return async (request) => {
    const auth = request.auth;
    if (!auth) throw unauthenticated();
    if (auth.user.role !== role) throw forbidden();
    if (role === "ADMIN" && (!auth.user.totpEnabledAt || !auth.session.mfaPassed)) {
      throw new AppError("MFA_REQUIRED", 403);
    }
  };
}
