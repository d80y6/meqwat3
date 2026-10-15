import { db } from "@/db";
import { financialTransactions } from "@/db/schema";
import { and, eq, desc, count, gte, lte } from "drizzle-orm";
import { requireMutationId, ok, handler, requireTenantUser, parsePagination, audit, ApiError } from "@/lib/api";
import { assertTenantWritable, createExpense } from "@/lib/services";

export const dynamic = "force-dynamic";

export const GET = handler(async (req: Request) => {
  const user = await requireTenantUser();
  const { limit, offset } = parsePagination(req);
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const shiftId = url.searchParams.get("shiftId");
  const conds = [eq(financialTransactions.tenantId, user.tenantId), eq(financialTransactions.type, "expense")];
  if (from) conds.push(gte(financialTransactions.createdAt, new Date(from)));
  if (to) conds.push(lte(financialTransactions.createdAt, new Date(to)));
  if (shiftId) conds.push(eq(financialTransactions.shiftId, shiftId));
  const where = and(...conds);
  const [rows, total] = await Promise.all([
    db.select().from(financialTransactions).where(where).orderBy(desc(financialTransactions.createdAt)).limit(limit).offset(offset),
    db.select({ c: count() }).from(financialTransactions).where(where),
  ]);
  return ok({ items: rows, total: total[0]?.c ?? 0 });
});

export const POST = handler(async (req: Request) => {
  const user = await requireTenantUser("cash:manage");
  await assertTenantWritable(user.tenantId);
  const body = await req.json();
  requireMutationId(body);
  if (!body?.amount || !body?.description) throw new ApiError("مبلغ ووصف المصروف مطلوبان");
  const result = await createExpense(
    { tenantId: user.tenantId, userId: user.id, role: user.role },
    {
      amount: body.amount,
      description: String(body.description),
      category: body.category ? String(body.category) : undefined,
      shiftId: body.shiftId ?? null,
      clientMutationId: body.clientMutationId ?? null,
    },
  );
  if (!(result as { duplicated?: boolean }).duplicated) {
    await audit(user, "expense.create", "expense", String(result.id), { amount: body.amount, description: body.description });
  }
  return ok(result, (result as { duplicated?: boolean }).duplicated ? 200 : 201);
});
