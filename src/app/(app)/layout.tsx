import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withTenantTx } from "@/lib/services";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let tenantName: string | null = null;
  let isDemo = false;
  if (user.tenantId) {
    const tenantId = user.tenantId;
    const tenant = await withTenantTx({ tenantId }, async (tx) => {
      const [t] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      return t ?? null;
    });
    if (!tenant || tenant.status !== "active") redirect("/login?error=suspended");
    tenantName = tenant.name;
    isDemo = tenant.isDemo;
  }

  return (
    <Shell
      user={{ id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenantId }}
      tenantName={tenantName}
      isDemo={isDemo}
      permissions={ROLE_PERMISSIONS[user.role] ?? []}
    >
      {children}
    </Shell>
  );
}
