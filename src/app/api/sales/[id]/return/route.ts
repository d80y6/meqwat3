import { requireMutationId, ok, handler, requireTenantUser, audit, ApiError } from "@/lib/api";
import { assertTenantWritable, returnSaleItems } from "@/lib/services";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireTenantUser("sales:return");
  await assertTenantWritable(user.tenantId);
  const { id } = await params;
  const body = await req.json();
  requireMutationId(body);
  if (!Array.isArray(body?.items) || body.items.length === 0) throw new ApiError("اختر بنود الإرجاع");
  const result = await returnSaleItems(
    { tenantId: user.tenantId, userId: user.id, role: user.role },
    id,
    {
      clientMutationId: body.clientMutationId,
      items: body.items.map((i: { saleItemId: string; qty: string | number; restock?: boolean }) => ({
        saleItemId: i.saleItemId, qty: i.qty, restock: i.restock !== false,
      })),
      refundMethod: body.refundMethod === "debt" ? "debt" : "cash",
      shiftId: body.shiftId ?? null,
      notes: body.notes,
    },
  );
  await audit(user, "sale.return", "sale", id, { refund: result.refundAmount });
  return ok(result);
});
