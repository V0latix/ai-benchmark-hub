import "server-only";

import { timingSafeEqual } from "node:crypto";

import { verifyAdminSession, type AdminSession } from "./auth";
import type { AdminEnvironment } from "./env";

const sessionCookieName = "benchmark_admin";

export class AdminRequestError extends Error {
  constructor() {
    super("Unauthorized admin request");
  }
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  let found: string | null = null;

  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const key = pair.slice(0, separator).trim();
    if (key !== name) continue;
    if (found !== null) return null;

    try {
      found = decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return found;
}

function constantTimeCsrfEqual(expected: string, supplied: string | null): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = supplied === null ? null : Buffer.from(supplied, "utf8");
  const comparable = Buffer.alloc(expectedBytes.byteLength);
  if (suppliedBytes) suppliedBytes.copy(comparable, 0, 0, expectedBytes.byteLength);
  return suppliedBytes?.byteLength === expectedBytes.byteLength && timingSafeEqual(expectedBytes, comparable);
}

export async function requireAdmin(request: Request, env: AdminEnvironment): Promise<AdminSession> {
  const token = readCookie(request.headers.get("cookie"), sessionCookieName);
  const session = token ? verifyAdminSession(token, env.sessionSecret) : null;
  if (!session) throw new AdminRequestError();
  return session;
}

export async function requireAdminMutation(request: Request, env: AdminEnvironment): Promise<AdminSession> {
  const session = await requireAdmin(request, env);
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin) throw new AdminRequestError();
  if (!constantTimeCsrfEqual(session.csrf, request.headers.get("x-csrf-token"))) throw new AdminRequestError();
  return session;
}
