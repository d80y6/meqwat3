import { db } from "@/db";
import { plans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, handler, requireUser, requireRole, audit, ApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireUser();
  requireRole(user, "admin:subscriptions");
  const rows = await db.select().from(plans).orderBy(plans.priceMonthly);
  return ok({ items: rows });
});

export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  requireRole(user, "admin:subscriptions");
  const body = await req.json();
  const name = String(body?.name ?? "").trim();
  if (!name) throw new ApiError("اسم الباقة مطلوب");
  const [created] = await db
    .insert(plans)
    .values({
      name,
      nameEn: body?.nameEn ?? null,
      priceMonthly: String(body?.priceMonthly ?? "0"),
      maxUsers: Number(body?.maxUsers ?? 3),
      maxProducts: Number(body?.maxProducts ?? 100),
      maxBranches: Number(body?.maxBranches ?? 1),
      features: Array.isArray(body?.features) ? body.features : [],
    })
    .returning();
  await audit(user, "admin.plan.create", "plan", created.id, { name });
  return ok(created, 201);
});

export const PATCH = handler(async (req: Request) => {
  const user = await requireUser();
  requireRole(user, "admin:subscriptions");
  const body = await req.json();
  const id = String(body?.id ?? "");
  const [plan] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
  if (!plan) throw new ApiError("الباقة غير موجودة", 404);
  const patch: Record<string, unknown> = {};
  for (const key of ["name", "nameEn"] as const) if (body[key] !== undefined) patch[key] = body[key];
  if (body.priceMonthly !== undefined) patch.priceMonthly = String(body.priceMonthly);
  for (const key of ["maxUsers", "maxProducts", "maxBranches"] as const) if (body[key] !== undefined) patch[key] = Number(body[key]);
  if (body.features !== undefined) patch.features = body.features;
  if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
  const [updated] = await db.update(plans).set(patch).where(eq(plans.id, id)).returning();
  await audit(user, "admin.plan.update", "plan", id);
  return ok(updated);
});
