import { ok, handler, requireTenantUser, audit, ApiError, requireRole } from "@/lib/api";
import { assertTenantWritable, createSale, createPurchase, recordPayment, recordStockAction } from "@/lib/services";

export const dynamic = "force-dynamic";

interface SyncOp {
  clientMutationId: string;
  type: "sale" | "purchase" | "payment" | "stock";
  payload: Record<string, unknown>;
  clientCreatedAt?: string;
}

/**
 * Offline-first sync: mobile/web clients queue operations locally with a
 * stable clientMutationId and push them here when connectivity returns.
 * Each op is processed in its own transaction via the idempotent services:
 *  - applied:   committed now
 *  - duplicate: same mutation already committed earlier (safe retry)
 *  - conflict:  business rule now rejects it (e.g. stock sold meanwhile)
 *  - error:     unexpected failure, client should keep it queued
 */
export const POST = handler(async (req: Request) => {
  const user = await requireTenantUser("pos:use");
  await assertTenantWritable(user.tenantId);
  const body = await req.json();
  if (body.tenantId !== user.tenantId || body.userId !== user.id) throw new ApiError("المزامنة تخص جلسة أخرى", 403, "QUEUE_OWNER_MISMATCH");
  const ops = (body?.operations ?? []) as SyncOp[];
  if (!Array.isArray(ops) || ops.length === 0) throw new ApiError("لا توجد عمليات للمزامنة");
  if (ops.length > 100) throw new ApiError("حجم دفعة المزامنة أكبر من المسموح (١٠٠)");

  const ctx = { tenantId: user.tenantId, userId: user.id, role: user.role };
  const results: { clientMutationId: string; status: string; result?: unknown; error?: string }[] = [];

  for (const op of ops) {
    if (!op || !op.clientMutationId || !op.payload || !["sale", "purchase", "payment", "stock"].includes(op.type)) {
      results.push({ clientMutationId: op?.clientMutationId ?? "?", status: "error", error: "عملية غير صالحة" });
      continue;
    }
    try {
      requireRole(user, op.type === "sale" ? "pos:use" : op.type === "purchase" ? "purchases:manage" : op.type === "stock" ? "inventory:manage" : "payments:manage");
      let result: unknown;
      if (op.type === "sale") {
        result = await createSale(ctx, { ...(op.payload as object), source: String(op.payload?.source ?? "offline"), clientMutationId: op.clientMutationId } as Parameters<typeof createSale>[1]);
      } else if (op.type === "purchase") {
        result = await createPurchase(ctx, { ...(op.payload as object), source: String(op.payload?.source ?? "offline"), clientMutationId: op.clientMutationId } as Parameters<typeof createPurchase>[1]);
      } else if (op.type === "stock") {
        result = await recordStockAction(ctx, { ...op.payload, clientMutationId: op.clientMutationId } as Parameters<typeof recordStockAction>[1]);
      } else {
        result = await recordPayment(ctx, { ...(op.payload as object), source: String(op.payload?.source ?? "offline"), clientMutationId: op.clientMutationId } as Parameters<typeof recordPayment>[1]);
      }
      const duplicated = Boolean((result as { duplicated?: boolean }).duplicated);
      results.push({ clientMutationId: op.clientMutationId, status: duplicated ? "duplicate" : "applied", result });
    } catch (err) {
      const isConflict = err instanceof RangeError || (err instanceof ApiError && err.status >= 400 && err.status < 500);
      results.push({
        clientMutationId: op.clientMutationId,
        status: isConflict ? "conflict" : "error",
        error: err instanceof ApiError ? err.message : isConflict ? "بيانات العملية غير صالحة" : "تعذر إتمام العملية",
      });
    }
  }

  const applied = results.filter((r) => r.status === "applied").length;
  if (applied > 0) await audit(user, "sync.push", "sync", undefined, { applied, total: ops.length });
  return ok({ results });
});
