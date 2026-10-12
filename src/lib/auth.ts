import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { sessions, users, tenants } from "@/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Role } from "./permissions";

const ACCESS_COOKIE = "meqwat_at";
const REFRESH_COOKIE = "meqwat_rt";
const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_DAYS = 7;

let cachedSecret: Uint8Array | null = null;
function secret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const s = process.env.AUTH_SECRET || process.env.JWT_SECRET;
  if (s) {
    cachedSecret = new TextEncoder().encode(s);
    return cachedSecret;
  }
  // Fallback: derive a per-deployment secret from the server-only database
  // credentials so tokens stay unforgeable without DB access. Production
  // deployments SHOULD set AUTH_SECRET explicitly (see docs/DECISIONS.md).
  console.warn("[auth] AUTH_SECRET not set — deriving signing secret from DATABASE_URL. Set AUTH_SECRET in production.");
  const derived = createHash("sha256")
    .update(`meqwat::${process.env.DATABASE_URL ?? "meqwat-dev"}`)
    .digest("hex");
  cachedSecret = new TextEncoder().encode(derived);
  return cachedSecret;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export interface AuthUser {
  id: string;
  tenantId: string | null;
  email: string;
  name: string;
  role: Role;
}

async function signAccess(user: AuthUser): Promise<string> {
  return new SignJWT({ tid: user.tenantId, role: user.role, name: user.name, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(secret());
}

export async function verifyAccessToken(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: String(payload.sub),
      tenantId: (payload.tid as string | null) ?? null,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

async function setCookies(access: string, refresh: string) {
  const store = await cookies();
  const secure = process.env.NODE_ENV === "production";
  store.set(ACCESS_COOKIE, access, {
    httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: ACCESS_TTL_SEC,
  });
  store.set(REFRESH_COOKIE, refresh, {
    httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: REFRESH_TTL_DAYS * 86400,
  });
}

export async function createSession(user: AuthUser): Promise<void> {
  const refresh = randomBytes(48).toString("base64url");
  const hdrs = await headers();
  await db.insert(sessions).values({
    userId: user.id,
    refreshTokenHash: sha256(refresh),
    userAgent: hdrs.get("user-agent")?.slice(0, 300),
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000),
  });
  await setCookies(await signAccess(user), refresh);
}

/** Rotate refresh token; returns fresh AuthUser or null (revoked/expired/reuse). */
export async function rotateRefreshSession(): Promise<AuthUser | null> {
  const store = await cookies();
  const refresh = store.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;
  const hash = sha256(refresh);
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.refreshTokenHash, hash), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!session) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || !user.isActive) return null;
  if (user.tenantId) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1);
    if (!tenant || tenant.status !== "active") return null;
  }
  // Revoke old session (rotation) and issue a new one.
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, session.id));
  const authUser: AuthUser = {
    id: user.id, tenantId: user.tenantId, email: user.email, name: user.name, role: user.role as Role,
  };
  await createSession(authUser);
  return authUser;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const refresh = store.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.refreshTokenHash, sha256(refresh)));
  }
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

/** Read current user from the access-token cookie (server components & APIs). */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  const token = store.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
