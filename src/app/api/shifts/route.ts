import { shifts, cashRegisters, users } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { ok, handler, requireTenantUser, parsePagination, audit, ApiError } from "@/lib/api";
import { assertTenantWritable, openShift, computeShiftExpected, withTenantTx } from "@/lib/services";
import { fromCents } from "@/lib/money";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const user = await requireTenantUser();
  const { limit, offset } = parsePagination(req);
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const conds = [eq(shifts.tenantId, user.tenantId)];
  if (status === "open" || status === "closed") conds.push(eq(shifts.status, status));

  const enriched = await withTenantTx(user, async (tx) => {
    const rows = await tx
      .select({ shift: shifts, registerName: cashRegisters.name, userName: users.name })
      .from(shifts)
      .innerJoin(cashRegisters, eq(shifts.registerId, cashRegisters.id))
      .innerJoin(users, eq(shifts.userId, users.id))
      .where(and(...conds))
      .orderBy(desc(shifts.openedAt))
      .limit(limit)
      .offset(offset);
    // Live expected cash for open shifts (same tx → RLS session vars apply).
    return Promise.all(
      rows.map(async (r) => {
        const expectedNow = r.shift.status === "open" ? fromCents(await computeShiftExpected(tx, r.shift)) : null;
        return { ...r.shift, registerName: r.registerName, userName: r.userName, expectedNow };
      }),
    );
  });
  return ok({ items: enriched });
});

export const POST = handler(async (req: Request) => {
  const user = await requireTenantUser("cash:manage");
  await assertTenantWritable(user.tenantId);
  const body = await req.json();
  if (!body?.registerId) throw new ApiError("اختر الصندوق");
  const shift = await openShift(
    { tenantId: user.tenantId, userId: user.id, role: user.role },
    { registerId: body.registerId, openingCash: body.openingCash ?? "0" },
  );
  await audit(user, "shift.open", "shift", shift.id, { registerId: body.registerId });
  return ok(shift, 201);
});
