import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { cookies, headers } from "next/headers";
import { authDb as db } from "@/db";
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
    if (s.length < 32) {
      throw new Error("[auth] AUTH_SECRET must be at least 32 characters — generate with: openssl rand -hex 32");
    }
    cachedSecret = new TextEncoder().encode(s);
    return cachedSecret;
  }
  // During `next build` the env may not be populated yet — allow a derived stub then.
  if (process.env.NEXT_PHASE?.includes("phase-production-build")) {
    console.warn("[auth] AUTH_SECRET not set during build — using derived stub for static generation only.");
    const derived = createHash("sha256")
      .update(`meqwat::build-stub`)
      .digest("hex");
    cachedSecret = new TextEncoder().encode(derived);
    return cachedSecret;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[auth] AUTH_SECRET is required in production — set a 32+ char random value (openssl rand -hex 32). Refusing to start with derived secret."
    );
  }
  // Ephemeral development secret: never derive a forgeable default from a known URL.
  console.warn("[auth] Using ephemeral development signing key; set AUTH_SECRET for stable sessions.");
  cachedSecret = randomBytes(32);
  return cachedSecret;
}

export async function hashPassword(password: string): Promise<string> {
  if (Buffer.byteLength(password, "utf8") > 72 || password.length < 8) throw new RangeError("Password must be 8+ characters and at most 72 UTF-8 bytes");
  return bcrypt.hash(password, 12);
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export interface AuthUser {
  id: string;
  sessionId?: string;
  mustChangePassword?: boolean;
  tenantId: string | null;
  email: string;
  name: string;
  role: Role;
}

async function signAccess(user: AuthUser, sessionId: string): Promise<string> {
  return new SignJWT({ sid: sessionId, tid: user.tenantId, role: user.role, name: user.name, email: user.email })
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
      sessionId: typeof payload.sid === "string" ? payload.sid : undefined,
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
  const [session] = await db.insert(sessions).values({
    userId: user.id,
    refreshTokenHash: sha256(refresh),
    userAgent: hdrs.get("user-agent")?.slice(0, 300),
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000),
  }).returning();
  await setCookies(await signAccess(user, session.id), refresh);
}

/** Rotate refresh token; returns fresh AuthUser or null (revoked/expired/reuse). */
export async function rotateRefreshSession(): Promise<AuthUser | null> {
  const store = await cookies();
  const refresh = store.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;
  const hash = sha256(refresh);
  const nextRefresh = randomBytes(48).toString("base64url");
  const result = await db.transaction(async (tx) => {
    // Conditional UPDATE consumes the old token once, even for concurrent requests.
    const [session] = await tx.update(sessions).set({ revokedAt: new Date() })
      .where(and(eq(sessions.refreshTokenHash, hash), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .returning();
    if (!session) return null;
    const [user] = await tx.select().from(users).where(eq(users.id, session.userId)).limit(1);
    if (!user || !user.isActive) return null;
    if (user.tenantId) {
      const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1);
      if (!tenant || tenant.status !== "active") return null;
    }
    const [next] = await tx.insert(sessions).values({
      userId: user.id, refreshTokenHash: sha256(nextRefresh),
      expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000),
    }).returning();
    const authUser: AuthUser = { id: user.id, tenantId: user.tenantId, email: user.email, name: user.name, role: user.role as Role };
    return { authUser, access: await signAccess(authUser, next.id) };
  });
  if (!result) return null;
  await setCookies(result.access, nextRefresh);
  return result.authUser;
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
  const claims = await verifyAccessToken(token);
  if (!claims?.sessionId) return null;
  const [row] = await db.select({ user: users, tenantStatus: tenants.status }).from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(tenants, eq(tenants.id, users.tenantId))
    .where(and(eq(sessions.id, claims.sessionId), eq(sessions.userId, claims.id),
      isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date()))).limit(1);
  if (!row?.user.isActive || (row.user.tenantId && row.tenantStatus !== "active")) return null;
  return { id: row.user.id, tenantId: row.user.tenantId, role: row.user.role,
    email: row.user.email, name: row.user.name, mustChangePassword: row.user.mustChangePassword };
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
