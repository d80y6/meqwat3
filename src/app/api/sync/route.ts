import { ok, handler, requireTenantUser, audit, ApiError } from "@/lib/api";
import { assertTenantWritable, createSale, createPurchase, recordPayment } from "@/lib/services";

export const dynamic = "force-dynamic";

interface SyncOp {
  clientMutationId: string;
  type: "sale" | "purchase" | "payment";
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
  const ops = (body?.operations ?? []) as SyncOp[];
  if (!Array.isArray(ops) || ops.length === 0) throw new ApiError("لا توجد عمليات للمزامنة");
  if (ops.length > 100) throw new ApiError("حجم دفعة المزامنة أكبر من المسموح (١٠٠)");

  const ctx = { tenantId: user.tenantId, userId: user.id, role: user.role };
  const results: { clientMutationId: string; status: string; result?: unknown; error?: string }[] = [];

  for (const op of ops) {
    if (!op.clientMutationId || !["sale", "purchase", "payment"].includes(op.type)) {
      results.push({ clientMutationId: op?.clientMutationId ?? "?", status: "error", error: "عملية غير صالحة" });
      continue;
    }
    try {
      let result: unknown;
      if (op.type === "sale") {
        result = await createSale(ctx, { ...(op.payload as object), source: String(op.payload?.source ?? "offline"), clientMutationId: op.clientMutationId } as Parameters<typeof createSale>[1]);
      } else if (op.type === "purchase") {
        result = await createPurchase(ctx, { ...(op.payload as object), source: String(op.payload?.source ?? "offline"), clientMutationId: op.clientMutationId } as Parameters<typeof createPurchase>[1]);
      } else {
        result = await recordPayment(ctx, { ...(op.payload as object), source: String(op.payload?.source ?? "offline"), clientMutationId: op.clientMutationId } as Parameters<typeof recordPayment>[1]);
      }
      const duplicated = Boolean((result as { duplicated?: boolean }).duplicated);
      results.push({ clientMutationId: op.clientMutationId, status: duplicated ? "duplicate" : "applied", result });
    } catch (err) {
      const isConflict = err instanceof ApiError && err.status >= 400 && err.status < 500;
      results.push({
        clientMutationId: op.clientMutationId,
        status: isConflict ? "conflict" : "error",
        error: err instanceof Error ? err.message : "خطأ غير معروف",
      });
    }
  }

  const applied = results.filter((r) => r.status === "applied").length;
  if (applied > 0) await audit(user, "sync.push", "sync", undefined, { applied, total: ops.length });
  return ok({ results });
});
