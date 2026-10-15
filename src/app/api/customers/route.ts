import { db } from "@/db";
import { customers } from "@/db/schema";
import { and, eq, ilike, desc, count, gt } from "drizzle-orm";
import { ok, handler, requireTenantUser, parsePagination, escapeIlike, audit, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const user = await requireTenantUser();
  const { limit, offset, search } = parsePagination(req);
  const url = new URL(req.url);
  const withDebt = url.searchParams.get("debt") === "1";
  const conds = [eq(customers.tenantId, user.tenantId)];
  if (!withDebt) conds.push(eq(customers.isActive, true));
  if (search) conds.push(ilike(customers.name, `%${escapeIlike(search)}%`));
  if (withDebt) conds.push(gt(customers.balance, "0"));
  const where = and(...conds);
  const [rows, total] = await Promise.all([
    db.select().from(customers).where(where).orderBy(desc(customers.balance), customers.id).limit(limit).offset(offset),
    db.select({ c: count() }).from(customers).where(where),
  ]);
  return ok({ items: rows, total: total[0]?.c ?? 0 });
});

export const POST = handler(async (req: Request) => {
  const user = await requireTenantUser("customers:manage");
  const body = await req.json();
  const name = String(body?.name ?? "").trim();
  if (!name) throw new ApiError("اسم العميل مطلوب");
  const [created] = await db
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
  await audit(user, "customer.create", "customer", created.id, { name });
  return ok(created, 201);
});
