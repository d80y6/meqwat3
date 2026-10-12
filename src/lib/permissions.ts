export type Role = "platform_admin" | "tenant_owner" | "manager" | "cashier";

export type Permission =
  | "dashboard:view"
  | "pos:use"
  | "sales:view"
  | "sales:return"
  | "products:manage"
  | "customers:manage"
  | "suppliers:manage"
  | "purchases:manage"
  | "payments:manage"
  | "inventory:manage"
  | "cash:manage"
  | "reports:view"
  | "users:manage"
  | "subscription:manage"
  | "admin:tenants"
  | "admin:subscriptions"
  | "audit:view";

const ALL_TENANT: Permission[] = [
  "dashboard:view",
  "pos:use",
  "sales:view",
  "sales:return",
  "products:manage",
  "customers:manage",
  "suppliers:manage",
  "purchases:manage",
  "payments:manage",
  "inventory:manage",
  "cash:manage",
  "reports:view",
  "users:manage",
  "subscription:manage",
  "audit:view",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  platform_admin: [...ALL_TENANT, "admin:tenants", "admin:subscriptions"],
  tenant_owner: ALL_TENANT,
  manager: ALL_TENANT.filter((p) => p !== "users:manage" && p !== "subscription:manage"),
  cashier: [
    "dashboard:view",
    "pos:use",
    "sales:view",
    "customers:manage",
    "cash:manage",
  ],
};

export function hasPermission(role: Role | string | undefined, perm: Permission): boolean {
  if (!role) return false;
  return (ROLE_PERMISSIONS[role as Role] ?? []).includes(perm);
}

export const ROLE_LABELS: Record<Role, string> = {
  platform_admin: "مدير المنصة",
  tenant_owner: "مالك المتجر",
  manager: "مدير",
  cashier: "كاشير",
};
