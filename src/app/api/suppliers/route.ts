import { db } from "@/db";
import { suppliers } from "@/db/schema";
import { and, eq, ilike, desc, count, gt } from "drizzle-orm";
import { ok, handler, requireTenantUser, parsePagination, audit, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const user = await requireTenantUser();
  const { limit, offset, search } = parsePagination(req);
  const url = new URL(req.url);
  const withLiability = url.searchParams.get("debt") === "1";
  const conds = [eq(suppliers.tenantId, user.tenantId), eq(suppliers.isActive, true)];
  if (search) conds.push(ilike(suppliers.name, `%${search}%`));
  if (withLiability) conds.push(gt(suppliers.balance, "0"));
  const where = and(...conds);
  const [rows, total] = await Promise.all([
    db.select().from(suppliers).where(where).orderBy(desc(suppliers.balance)).limit(limit).offset(offset),
    db.select({ c: count() }).from(suppliers).where(where),
  ]);
  return ok({ items: rows, total: total[0]?.c ?? 0 });
});

export const POST = handler(async (req: Request) => {
  const user = await requireTenantUser("suppliers:manage");
  const body = await req.json();
  const name = String(body?.name ?? "").trim();
  if (!name) throw new ApiError("اسم المورّد مطلوب");
  const [created] = await db
    .insert(suppliers)
    .values({
      tenantId: user.tenantId,
      name,
      phone: body?.phone ? String(body.phone) : null,
      address: body?.address ? String(body.address) : null,
      notes: body?.notes ? String(body.notes) : null,
    })
    .returning();
  await audit(user, "supplier.create", "supplier", created.id, { name });
  return ok(created, 201);
});
