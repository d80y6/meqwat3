import { ok, handler, requireTenantUser, audit, ApiError } from "@/lib/api";
import { assertTenantWritable, returnPurchaseItems } from "@/lib/services";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireTenantUser("purchases:manage");
  await assertTenantWritable(user.tenantId);
  const { id } = await params;
  const body = await req.json();
  if (!Array.isArray(body?.items) || body.items.length === 0) throw new ApiError("اختر بنود الإرجاع");
  const result = await returnPurchaseItems(
    { tenantId: user.tenantId, userId: user.id, role: user.role },
    id,
    {
      items: body.items.map((i: { purchaseItemId: string; qty: string | number }) => ({
        purchaseItemId: i.purchaseItemId,
        qty: i.qty,
      })),
      refundMethod: body.refundMethod === "cash" ? "cash" : "debt",
      shiftId: body.shiftId ?? null,
      notes: body.notes,
    },
  );
  await audit(user, "purchase.return", "purchase", id, { refund: result.refundAmount });
  return ok(result);
});
