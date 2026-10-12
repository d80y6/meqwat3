import { ok, handler, requireTenantUser, audit } from "@/lib/api";
import { closeShift } from "@/lib/services";

export const dynamic = "force-dynamic";

export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireTenantUser("cash:manage");
  const { id } = await params;
  const body = await req.json();
  const closed = await closeShift(
    { tenantId: user.tenantId, userId: user.id, role: user.role },
    id,
    { countedCash: body?.countedCash ?? "0", notes: body?.notes },
  );
  await audit(user, "shift.close", "shift", id, {
    expected: closed.expectedCash, counted: closed.countedCash, difference: closed.difference,
  });
  return ok(closed);
});
