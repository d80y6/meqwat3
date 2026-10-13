import { db } from "@/db";
import { payments, customers, suppliers } from "@/db/schema";
import { and, eq, desc, count } from "drizzle-orm";
import { ok, handler, requireTenantUser, parsePagination, audit, ApiError } from "@/lib/api";
import { assertTenantWritable, recordPayment } from "@/lib/services";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const user = await requireTenantUser();
  const { limit, offset } = parsePagination(req);
  const url = new URL(req.url);
  const conds = [eq(payments.tenantId, user.tenantId)];
  const kind = url.searchParams.get("kind");
  if (kind) conds.push(eq(payments.kind, kind));
  const where = and(...conds);
  const [rows, total] = await Promise.all([
    db
      .select({ payment: payments, customerName: customers.name, supplierName: suppliers.name })
      .from(payments)
      .leftJoin(customers, eq(payments.customerId, customers.id))
      .leftJoin(suppliers, eq(payments.supplierId, suppliers.id))
      .where(where)
      .orderBy(desc(payments.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ c: count() }).from(payments).where(where),
  ]);
  return ok({
    items: rows.map((r) => ({ ...r.payment, partyName: r.customerName ?? r.supplierName ?? null })),
    total: total[0]?.c ?? 0,
  });
});

export const POST = handler(async (req: Request) => {
  const user = await requireTenantUser("payments:manage");
  await assertTenantWritable(user.tenantId);
  const body = await req.json();
  if (body?.kind !== "customer_payment" && body?.kind !== "supplier_payment") {
    throw new ApiError("نوع السداد غير صالح");
  }
  const result = await recordPayment(
    { tenantId: user.tenantId, userId: user.id, role: user.role },
    {
      kind: body.kind,
      customerId: body.customerId,
      supplierId: body.supplierId,
      amount: body.amount,
      method: body.method ?? "cash",
      shiftId: body.shiftId ?? null,
      notes: body.notes,
      clientMutationId: body.clientMutationId ?? null,
      source: body.source ?? "web",
    },
  );
  if (!result.duplicated) await audit(user, "payment.create", "payment", String(result.id), { kind: body.kind, amount: body.amount });
  return ok(result, result.duplicated ? 200 : 201);
});
