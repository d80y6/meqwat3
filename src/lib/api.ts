import { businessDateBoundary } from "./business-date";
import { NextResponse } from "next/server";
import { getCurrentUser, type AuthUser } from "./auth";
import { hasPermission, type Permission } from "./permissions";
import { withTenantTx } from "./tx";
import { databaseScope } from "@/db/context";
import { auditLogs } from "@/db/schema";

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}
export function fail(message: string, status = 400, code?: string, extraHeaders?: Record<string, string>) {
  return NextResponse.json({ ok: false, error: message, code }, { status, headers: extraHeaders });
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
      const user = await getCurrentUser();
      return await databaseScope.run({ tenantId: user?.tenantId ?? null, isAdmin: user?.role === "platform_admin" }, async () => {
        const request = args[0] instanceof Request ? args[0] : null;
        if (user?.mustChangePassword && request && !new URL(request.url).pathname.startsWith("/api/auth/")) {
          throw new ApiError("غيّر كلمة المرور المؤقتة أولاً", 403, "PASSWORD_CHANGE_REQUIRED");
        }
        if (request && user?.tenantId && !["GET", "HEAD", "OPTIONS"].includes(request.method)
          && !new URL(request.url).pathname.startsWith("/api/auth/")
          && new URL(request.url).pathname !== "/api/subscription-requests") {
          const { assertTenantWritable } = await import("./services");
          await assertTenantWritable(user.tenantId);
        }
        return fn(...args);
      });
    } catch (err) {
      if (err instanceof ApiError) {
        const headers: Record<string, string> = {};
        if (err.code === "RATE_LIMITED") headers["Retry-After"] = "60";
        return fail(err.message, err.status, err.code, headers);
      }
      if (err instanceof SyntaxError || err instanceof RangeError) return fail("بيانات الطلب غير صالحة", 400, "INVALID_INPUT");
      const code = (err as { cause?: { code?: string }; code?: string })?.cause?.code ?? (err as { code?: string })?.code;
      if (["22P02", "22003", "22007", "23514"].includes(code ?? "")) return fail("بيانات الطلب غير صالحة", 400, "INVALID_INPUT");
      if (code === "23505") return fail("تعذر استخدام هذه البيانات", 409, "CONFLICT");
      // Do not log database query parameters, passwords or submitted payloads.
      console.error("[api] request failed", { type: err instanceof Error ? err.name : "Unknown" });
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
  ip?: string | null,
): Promise<void> {
  try {
    await withTenantTx({ tenantId: user?.tenantId ?? null }, tx => tx.insert(auditLogs).values({
      tenantId: user?.tenantId ?? null,
      userId: user?.id ?? null,
      action,
      entityType,
      entityId,
      metadata: metadata ?? null,
      ip: ip ?? null,
    }));
  } catch (e) {
    console.error("[audit] write failed", { type: e instanceof Error ? e.name : "Unknown" });
  }
}

/** Escape `%` and `_` in user-supplied search terms for ILIKE. */
export function escapeIlike(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}

export function parsePagination(req: Request): { limit: number; offset: number; search: string } {
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const search = (url.searchParams.get("search") ?? "").trim();
  return { limit, offset, search };
}

/** Parse an ISO date query param with validation. Returns null if absent. Throws ApiError if invalid. */
export function parseDateParam(value: string | null, label: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ApiError(`صيغة التاريخ غير صالحة: ${label}`);
  return d;
}

export function parseDateRange(req: Request): { from: Date; to: Date } {
  const url = new URL(req.url);
  const now = new Date();
  const fromInput = url.searchParams.get("from");
  const toInput = url.searchParams.get("to");
  const from = (fromInput ? businessDateBoundary(fromInput) : null) ?? parseDateParam(fromInput, "from") ?? new Date(now.getTime() - 30 * 86400_000);
  const to = (toInput ? businessDateBoundary(toInput, true) : null) ?? parseDateParam(toInput, "to") ?? now;
  if (from > to) throw new ApiError("تاريخ البداية يجب أن يسبق تاريخ النهاية");
  return { from, to };
}

/** HTTP financial mutations require a stable key; callers retain it on retries. */
export function requireMutationId(body: unknown): string {
  const key = (body as { clientMutationId?: unknown } | null)?.clientMutationId;
  if (typeof key !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(key)) {
    throw new ApiError("معرّف العملية مطلوب لإعادة المحاولة بأمان", 400, "MUTATION_ID_REQUIRED");
  }
  return key;
}
