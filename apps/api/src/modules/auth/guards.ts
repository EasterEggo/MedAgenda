import type { FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import type { Role } from "@prisma/client";
import { forbidden, unauthenticated } from "../../lib/errors.js";
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

/** Requires a valid session. */
export function requireAuth(): preHandlerAsyncHookHandler {
  return async (request) => {
    const auth = await resolveAuth(request);
    if (!auth) throw unauthenticated();
  };
}

export function requireRole(role: Role): preHandlerAsyncHookHandler {
  return async (request) => {
    const auth = request.auth;
    if (!auth) throw unauthenticated();
    if (auth.user.role !== role) throw forbidden();
  };
}
