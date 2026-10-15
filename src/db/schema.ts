import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Meqwat SaaS — Multi-tenant Qat Trading & Shop Management schema.
 *
 * Money is ALWAYS stored as numeric(14,2) (Yemeni Rial) and manipulated in
 * TypeScript as integer minor units (1/100) — see src/lib/money.ts.
 * Quantities are numeric(12,3) to allow fractional bundles.
 * Every tenant-owned row carries tenant_id; isolation is enforced in the
 * service layer, by (tenant_id, ...) unique constraints, and by the RLS
 * migration in db/rls.sql for deployments using a non-superuser role.
 */

export const userRoleEnum = pgEnum("user_role", [
  "platform_admin",
  "tenant_owner",
  "manager",
  "cashier",
]);
export const tenantStatusEnum = pgEnum("tenant_status", ["active", "suspended"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trial",
  "active",
  "past_due",
  "cancelled",
  "expired",
]);
export const requestStatusEnum = pgEnum("request_status", [
  "pending",
  "approved",
  "rejected",
]);
export const saleStatusEnum = pgEnum("sale_status", [
  "completed",
  "partially_returned",
  "returned",
  "reversed",
]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "credit",
  "mixed",
  "transfer",
]);
export const movementTypeEnum = pgEnum("movement_type", [
  "opening",
  "purchase",
  "sale",
  "sale_return",
  "purchase_return",
  "spoilage",
  "adjustment",
]);
export const ledgerTypeEnum = pgEnum("ledger_type", [
  "sale_cash",
  "sale_refund",
  "customer_payment",
  "supplier_payment",
  "purchase_cash",
  "expense",
  "shift_opening",
  "adjustment",
]);
export const shiftStatusEnum = pgEnum("shift_status", ["open", "closed"]);

const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
const qty = (name: string) => numeric(name, { precision: 12, scale: 3 });
const ts = (name: string) => timestamp(name, { withTimezone: true });

/* ---------------------------------- Plans --------------------------------- */
export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 80 }).notNull(),
  nameEn: varchar("name_en", { length: 80 }),
  priceMonthly: money("price_monthly").notNull().default("0"),
  maxUsers: integer("max_users").notNull().default(3),
  maxProducts: integer("max_products").notNull().default(100),
  maxBranches: integer("max_branches").notNull().default(1),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/* --------------------------------- Tenants -------------------------------- */
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    ownerName: varchar("owner_name", { length: 120 }),
    phone: varchar("phone", { length: 40 }),
    city: varchar("city", { length: 80 }),
    currency: varchar("currency", { length: 8 }).notNull().default("YER"),
    status: tenantStatusEnum("status").notNull().default("active"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tenants_slug_uq").on(t.slug)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatusEnum("status").notNull().default("trial"),
    startsAt: ts("starts_at").notNull().defaultNow(),
    endsAt: ts("ends_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("subscriptions_tenant_idx").on(t.tenantId)],
);

export const subscriptionRequests = pgTable(
  "subscription_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessName: varchar("business_name", { length: 160 }).notNull(),
    ownerName: varchar("owner_name", { length: 120 }).notNull(),
    email: varchar("email", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 40 }).notNull(),
    city: varchar("city", { length: 80 }),
    planId: uuid("plan_id").references(() => plans.id),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    status: requestStatusEnum("status").notNull().default("pending"),
    notes: text("notes"),
    reviewedBy: uuid("reviewed_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    reviewedAt: ts("reviewed_at"),
  },
  (t) => [index("sub_requests_status_idx").on(t.status)],
);

/* ------------------------------- Users/Auth ------------------------------- */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    passwordHash: text("password_hash").notNull(),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    role: userRoleEnum("role").notNull().default("cashier"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: ts("last_login_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(t.email),
    index("users_tenant_idx").on(t.tenantId),
  ],
);

/** Refresh-token sessions. Only SHA-256 hashes of tokens are stored. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    userAgent: text("user_agent"),
    ip: varchar("ip", { length: 64 }),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_refresh_hash_uq").on(t.refreshTokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

/* --------------------------------- Catalog -------------------------------- */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    sku: varchar("sku", { length: 60 }),
    category: varchar("category", { length: 80 }).notNull().default("قات"),
    unit: varchar("unit", { length: 40 }).notNull().default("حزمة"),
    costPrice: money("cost_price").notNull().default("0"),
    salePrice: money("sale_price").notNull().default("0"),
    stockQty: qty("stock_qty").notNull().default("0"),
    lowStockThreshold: qty("low_stock_threshold").notNull().default("5"),
    trackStock: boolean("track_stock").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("products_tenant_idx").on(t.tenantId),
    uniqueIndex("products_tenant_sku_uq").on(t.tenantId, t.sku),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 140 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    address: text("address"),
    creditLimit: money("credit_limit").notNull().default("0"),
    /** Amount the customer owes us (receivable). Maintained transactionally. */
    balance: money("balance").notNull().default("0"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("customers_tenant_idx").on(t.tenantId)],
);

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 140 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    address: text("address"),
    /** Amount we owe the supplier (payable / consignment liability). */
    balance: money("balance").notNull().default("0"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("suppliers_tenant_idx").on(t.tenantId)],
);

/* --------------------------- Cash registers/Shifts ------------------------- */
export const cashRegisters = pgTable(
  "cash_registers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("registers_tenant_idx").on(t.tenantId)],
);

export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    registerId: uuid("register_id")
      .notNull()
      .references(() => cashRegisters.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    status: shiftStatusEnum("status").notNull().default("open"),
    openingCash: money("opening_cash").notNull().default("0"),
    countedCash: money("counted_cash"),
    expectedCash: money("expected_cash"),
    difference: money("difference"),
    notes: text("notes"),
    openedAt: ts("opened_at").notNull().defaultNow(),
    closedAt: ts("closed_at"),
  },
  (t) => [
    index("shifts_tenant_idx").on(t.tenantId),
    index("shifts_register_status_idx").on(t.registerId, t.status),
  ],
);

/* -------------------------------- Purchases ------------------------------- */
export const purchases = pgTable(
  "purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    shiftId: uuid("shift_id").references(() => shifts.id),
    totalAmount: money("total_amount").notNull(),
    paidAmount: money("paid_amount").notNull().default("0"),
    /** total - paid; added to supplier liability. */
    notes: text("notes"),
    source: varchar("source", { length: 20 }).notNull().default("web"),
    clientMutationId: varchar("client_mutation_id", { length: 80 }),
    purchaseDate: ts("purchase_date").notNull().defaultNow(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("purchases_tenant_idx").on(t.tenantId),
    uniqueIndex("purchases_tenant_mutation_uq").on(t.tenantId, t.clientMutationId),
  ],
);

export const purchaseItems = pgTable(
  "purchase_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    qty: qty("qty").notNull(),
    returnedQty: qty("returned_qty").notNull().default("0"),
    unitCost: money("unit_cost").notNull(),
    total: money("total").notNull(),
  },
  (t) => [index("purchase_items_purchase_idx").on(t.purchaseId)],
);

/* ---------------------------------- Sales --------------------------------- */
export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    invoiceNo: integer("invoice_no").notNull(),
    customerId: uuid("customer_id").references(() => customers.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    shiftId: uuid("shift_id").references(() => shifts.id),
    registerId: uuid("register_id").references(() => cashRegisters.id),
    totalAmount: money("total_amount").notNull(),
    discount: money("discount").notNull().default("0"),
    paidAmount: money("paid_amount").notNull().default("0"),
    creditAmount: money("credit_amount").notNull().default("0"),
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("cash"),
    status: saleStatusEnum("status").notNull().default("completed"),
    notes: text("notes"),
    source: varchar("source", { length: 20 }).notNull().default("web"),
    clientMutationId: varchar("client_mutation_id", { length: 80 }),
    returnedAmount: money("returned_amount").notNull().default("0"),
    saleDate: ts("sale_date").notNull().defaultNow(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("sales_tenant_idx").on(t.tenantId),
    index("sales_tenant_date_idx").on(t.tenantId, t.saleDate),
    uniqueIndex("sales_tenant_mutation_uq").on(t.tenantId, t.clientMutationId),
    uniqueIndex("sales_tenant_invoice_uq").on(t.tenantId, t.invoiceNo),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    qty: qty("qty").notNull(),
    returnedQty: qty("returned_qty").notNull().default("0"),
    unitPrice: money("unit_price").notNull(),
    costPrice: money("cost_price").notNull().default("0"),
    total: money("total").notNull(),
  },
  (t) => [index("sale_items_sale_idx").on(t.saleId)],
);

/* --------------------------------- Payments ------------------------------- */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** customer_payment = cash in (debt collection); supplier_payment = cash out. */
    kind: varchar("kind", { length: 30 }).notNull(),
    customerId: uuid("customer_id").references(() => customers.id),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    saleId: uuid("sale_id").references(() => sales.id),
    purchaseId: uuid("purchase_id").references(() => purchases.id),
    shiftId: uuid("shift_id").references(() => shifts.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    amount: money("amount").notNull(),
    method: varchar("method", { length: 20 }).notNull().default("cash"),
    notes: text("notes"),
    source: varchar("source", { length: 20 }).notNull().default("web"),
    clientMutationId: varchar("client_mutation_id", { length: 80 }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("payments_tenant_idx").on(t.tenantId),
    uniqueIndex("payments_tenant_mutation_uq").on(t.tenantId, t.clientMutationId),
  ],
);

/* --------------------------- Inventory movements --------------------------- */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    type: movementTypeEnum("type").notNull(),
    /** Signed: + stock in, - stock out. */
    qty: qty("qty").notNull(),
    balanceAfter: qty("balance_after").notNull(),
    unitCost: money("unit_cost"),
    refType: varchar("ref_type", { length: 30 }),
    refId: uuid("ref_id"),
    userId: uuid("user_id").references(() => users.id),
    notes: text("notes"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("movements_tenant_idx").on(t.tenantId),
    index("movements_product_idx").on(t.productId, t.createdAt),
  ],
);

/* ------------------------------ Financial ledger --------------------------- */
export const financialTransactions = pgTable(
  "financial_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    type: ledgerTypeEnum("type").notNull(),
    /** Signed cash effect: + into drawer, - out of drawer. */
    amount: money("amount").notNull(),
    refType: varchar("ref_type", { length: 30 }),
    refId: uuid("ref_id"),
    shiftId: uuid("shift_id").references(() => shifts.id),
    userId: uuid("user_id").references(() => users.id),
    description: text("description"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ledger_tenant_idx").on(t.tenantId),
    index("ledger_shift_idx").on(t.shiftId),
  ],
);

/* --------------------------------- Audit log ------------------------------- */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id"),
    userId: uuid("user_id"),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entity_type", { length: 60 }),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ip: varchar("ip", { length: 64 }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_tenant_idx").on(t.tenantId, t.createdAt)],
);

/**
 * Idempotency registry for offline sync: stores the server result of every
 * processed client mutation so retries replay the original response instead
 * of creating duplicates.
 */
export const processedMutations = pgTable(
  "processed_mutations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    clientMutationId: varchar("client_mutation_id", { length: 80 }).notNull(),
    entityType: varchar("entity_type", { length: 30 }).notNull(),
    entityId: uuid("entity_id"),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("processed_mutations_uq").on(t.tenantId, t.clientMutationId),
  ],
);

/** Per-tenant sequential invoice counter (updated transactionally). */
export const tenantCounters = pgTable("tenant_counters", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  lastInvoiceNo: integer("last_invoice_no").notNull().default(0),
});

export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type Plan = typeof plans.$inferSelect;

/** Single-use password reset tokens; never store the plaintext link token. */
export const passwordResets = pgTable("password_resets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
});

export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetsAt: ts("resets_at").notNull(),
});
