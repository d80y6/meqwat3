import { customers } from "@/db/schema";
import { and, eq, ilike, desc, count, gt } from "drizzle-orm";
import { ok, handler, requireTenantUser, parsePagination, audit, ApiError } from "@/lib/api";
import { withTenantTx } from "@/lib/services";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const user = await requireTenantUser();
  const { limit, offset, search } = parsePagination(req);
  const url = new URL(req.url);
  const withDebt = url.searchParams.get("debt") === "1";
  const conds = [eq(customers.tenantId, user.tenantId), eq(customers.isActive, true)];
  if (search) conds.push(ilike(customers.name, `%${search}%`));
  if (withDebt) conds.push(gt(customers.balance, "0"));
  const where = and(...conds);
  const { rows, total } = await withTenantTx(user, async (tx) => {
    const rows = await tx.select().from(customers).where(where).orderBy(desc(customers.balance)).limit(limit).offset(offset);
    const total = await tx.select({ c: count() }).from(customers).where(where);
    return { rows, total };
  });
  return ok({ items: rows, total: total[0]?.c ?? 0 });
});

export const POST = handler(async (req: Request) => {
  const user = await requireTenantUser("customers:manage");
  const body = await req.json();
  const name = String(body?.name ?? "").trim();
  if (!name) throw new ApiError("اسم العميل مطلوب");
  const created = await withTenantTx(user, async (tx) => {
    const [row] = await tx
      .insert(customers)
      .values({
        tenantId: user.tenantId,
        name,
        phone: body?.phone ? String(body.phone) : null,
        address: body?.address ? String(body.address) : null,
        creditLimit: String(body?.creditLimit ?? "0"),
        notes: body?.notes ? String(body.notes) : null,
      })
      .returning();
    return row;
  });
  await audit(user, "customer.create", "customer", created.id, { name });
  return ok(created, 201);
});
