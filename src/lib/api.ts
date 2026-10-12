import { NextResponse } from "next/server";
import { getCurrentUser, type AuthUser } from "./auth";
import { hasPermission, type Permission } from "./permissions";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}
export function fail(message: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, error: message, code }, { status });
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError("انتهت الجلسة، سجّل الدخول مجدداً", 401, "UNAUTHENTICATED");
  return user;
}

/** Require an authenticated user belonging to a tenant (tenant-scoped APIs). */
export async function requireTenantUser(perm?: Permission): Promise<AuthUser & { tenantId: string }> {
  const user = await requireUser();
  if (!user.tenantId) throw new ApiError("هذا الحساب لا ينتمي إلى متجر", 403, "NO_TENANT");
  if (perm && !hasPermission(user.role, perm)) {
    throw new ApiError("ليست لديك صلاحية لتنفيذ هذا الإجراء", 403, "FORBIDDEN");
  }
  return user as AuthUser & { tenantId: string };
}

export function requireRole(user: AuthUser, perm: Permission) {
  if (!hasPermission(user.role, perm)) {
    throw new ApiError("ليست لديك صلاحية لتنفيذ هذا الإجراء", 403, "FORBIDDEN");
  }
}

/** Wrap a route handler converting ApiError into JSON responses. */
export function handler<T extends unknown[]>(
  fn: (...args: T) => Promise<NextResponse>,
): (...args: T) => Promise<NextResponse> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) return fail(err.message, err.status, err.code);
      console.error("[api] unhandled error:", err);
      return fail("حدث خطأ غير متوقع في الخادم", 500, "INTERNAL");
    }
  };
}

export async function audit(
  user: AuthUser | null,
  action: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      tenantId: user?.tenantId ?? null,
      userId: user?.id ?? null,
      action,
      entityType,
      entityId,
      metadata: metadata ?? null,
    });
  } catch (e) {
    console.error("[audit] failed:", e);
  }
}

export function parsePagination(req: Request): { limit: number; offset: number; search: string } {
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const search = (url.searchParams.get("search") ?? "").trim();
  return { limit, offset, search };
}
