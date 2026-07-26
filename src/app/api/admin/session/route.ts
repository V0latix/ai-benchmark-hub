import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createAdminSession, createCsrfToken, verifyAdminPassword } from "../../../../lib/admin/auth";
import { readAdminEnvironment } from "../../../../lib/admin/env";
import { checkLoginAttempt } from "../../../../lib/admin/login-limiter";

const SESSION_COOKIE = "benchmark_admin";
const REFUSAL = { error: "Accès refusé" };

function sessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: 28_800,
    path: "/",
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production"
  };
}

function refused(status = 401, retryAfterSeconds?: number) {
  const response = NextResponse.json(REFUSAL, { status });
  if (retryAfterSeconds) response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
}

async function readPassword(request: Request): Promise<string | null> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("password" in body) || typeof body.password !== "string") return null;
    return body.password;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  let env;
  try {
    env = readAdminEnvironment();
  } catch {
    return refused();
  }

  const attempt = checkLoginAttempt(request);
  if (!attempt.allowed) return refused(429, attempt.retryAfterSeconds);

  const password = await readPassword(request);
  if (!password || !(await verifyAdminPassword(password, env.passwordHash))) return refused();

  const csrf = createCsrfToken();
  const token = createAdminSession(env.sessionSecret, { csrf });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions());
  return NextResponse.json({ csrf });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return new NextResponse(null, { status: 204 });
}
