import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * MONEY HANDLING (see NON_FUNCTIONAL_REQUIREMENTS.md / spec #66)
 * All monetary columns are stored as INTEGER MINOR UNITS (e.g. paisa for BDT,
 * cents for USD) — never floating point. Convert using DECIMAL_PLACES from
 * config when formatting for display. This also keeps the schema portable to
 * Postgres (BIGINT) without precision surprises.
 */

const now = sql`(strftime('%s','now'))`;

// ---------------------------------------------------------------------
// IDENTITY / RESTAURANT
// ---------------------------------------------------------------------

export const restaurants = sqliteTable("restaurants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  logoPath: text("logo_path"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  createdAt: integer("created_at").notNull().default(now),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const branches = sqliteTable("branches", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id").notNull().references(() => restaurants.id),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull().default(now),
});

export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(), // OWNER, MANAGER, WAITER, KITCHEN, CASHIER, TAKEOUT
  description: text("description"),
});

export const permissions = sqliteTable("permissions", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(), // e.g. "order.create"
  description: text("description"),
});

export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    roleId: text("role_id").notNull().references(() => roles.id),
    permissionId: text("permission_id").notNull().references(() => permissions.id),
  },
  (t) => ({ pk: primaryKey({ columns: [t.roleId, t.permissionId] }) })
);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id").notNull().references(() => branches.id),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    employeeCode: text("employee_code"),
    roleId: text("role_id").notNull().references(() => roles.id),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastLoginAt: integer("last_login_at"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({ branchIdx: index("users_branch_idx").on(t.branchId) })
);

export const loginEvents = sqliteTable("login_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  usernameAttempted: text("username_attempted").notNull(),
  success: integer("success", { mode: "boolean" }).notNull(),
  reason: text("reason"), // inactive_user | bad_password | not_found | ok
  ipAddress: text("ip_address"),
  createdAt: integer("created_at").notNull().default(now),
});

// ---------------------------------------------------------------------
// TABLES
// ---------------------------------------------------------------------

export const restaurantTables = sqliteTable(
  "restaurant_tables",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id").notNull().references(() => branches.id),
    tableNumber: text("table_number").notNull(),
    capacity: integer("capacity").notNull(),
    status: text("status", {
      enum: ["AVAILABLE", "OCCUPIED", "RESERVED", "BILL_REQUESTED", "OUT_OF_SERVICE"],
    })
      .notNull()
      .default("AVAILABLE"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => ({ uniq: uniqueIndex("table_branch_number_uq").on(t.branchId, t.tableNumber) })
);

// ---------------------------------------------------------------------
// MENU
// ---------------------------------------------------------------------

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const menuItems = sqliteTable(
  "menu_items",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id").notNull().references(() => categories.id),
    name: text("name").notNull(),
    description: text("description"),
    basePriceMinor: integer("base_price_minor").notNull(),
    imagePath: text("image_path"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    kitchenAvailable: integer("kitchen_available", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => ({ categoryIdx: index("menu_items_category_idx").on(t.categoryId) })
);

export const menuVariants = sqliteTable("menu_variants", {
  id: text("id").primaryKey(),
  menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
  name: text("name").notNull(),
  priceDeltaMinor: integer("price_delta_minor").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const modifiers = sqliteTable("modifiers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  priceDeltaMinor: integer("price_delta_minor").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const menuItemModifiers = sqliteTable(
  "menu_item_modifiers",
  {
    menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
    modifierId: text("modifier_id").notNull().references(() => modifiers.id),
    isRequired: integer("is_required", { mode: "boolean" }).notNull().default(false),
    maxQuantity: integer("max_quantity").notNull().default(1),
  },
  (t) => ({ pk: primaryKey({ columns: [t.menuItemId, t.modifierId] }) })
);

// ---------------------------------------------------------------------
// OFFERS / COMBOS
// ---------------------------------------------------------------------

export const offers = sqliteTable("offers", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  name: text("name").notNull(),
  description: text("description"),
  discountType: text("discount_type", { enum: ["PERCENTAGE", "FIXED_AMOUNT"] }).notNull(),
  discountValue: integer("discount_value").notNull(), // percentage*100 OR minor units, per discountType
  startsAt: integer("starts_at"),
  endsAt: integer("ends_at"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").references(() => users.id),
});

export const offerItems = sqliteTable(
  "offer_items",
  {
    offerId: text("offer_id").notNull().references(() => offers.id),
    menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
    quantity: integer("quantity").notNull().default(1),
  },
  (t) => ({ pk: primaryKey({ columns: [t.offerId, t.menuItemId] }) })
);

export const combos = sqliteTable("combos", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  name: text("name").notNull(),
  description: text("description"),
  priceMinor: integer("price_minor").notNull(),
  startsAt: integer("starts_at"),
  endsAt: integer("ends_at"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").references(() => users.id),
});

export const comboItems = sqliteTable(
  "combo_items",
  {
    comboId: text("combo_id").notNull().references(() => combos.id),
    menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
    quantity: integer("quantity").notNull().default(1),
  },
  (t) => ({ pk: primaryKey({ columns: [t.comboId, t.menuItemId] }) })
);

// ---------------------------------------------------------------------
// ORDERS
// ---------------------------------------------------------------------

export const ORDER_SOURCES = ["WAITER", "TAKEOUT", "SELF_ORDER", "KIOSK", "ONLINE"] as const;
export const ORDER_TYPES = ["DINE_IN", "TAKEAWAY", "DELIVERY", "SELF_ORDER"] as const;
export const ORDER_STATUSES = [
  "DRAFT",
  "CONFIRMED",
  "SENT_TO_KITCHEN",
  "PREPARING",
  "READY",
  "SERVED",
  "BILL_REQUESTED",
  "BILLED",
  "PAID",
  "COMPLETED",
  "CANCELLED",
  "VOIDED",
] as const;
export const ITEM_KITCHEN_STATUSES = ["PENDING", "PREPARING", "READY", "SERVED", "CANCELLED"] as const;

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    publicOrderId: text("public_order_id").notNull().unique(), // "10452" -> displayed "Order #10452"
    branchId: text("branch_id").notNull().references(() => branches.id),
    source: text("source", { enum: ORDER_SOURCES }).notNull(),
    orderType: text("order_type", { enum: ORDER_TYPES }).notNull(),
    tableId: text("table_id").references(() => restaurantTables.id),
    waiterUserId: text("waiter_user_id").references(() => users.id),
    createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
    customerId: text("customer_id").references(() => customers.id),
    status: text("status", { enum: ORDER_STATUSES }).notNull().default("DRAFT"),

    subtotalMinor: integer("subtotal_minor").notNull().default(0),
    discountMinor: integer("discount_minor").notNull().default(0),
    taxMinor: integer("tax_minor").notNull().default(0),
    serviceChargeMinor: integer("service_charge_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull().default(0),

    // Offer the waiter attached at order time (spec: order offers directly
    // from the Waiter screen). Purely informational until billing — it
    // does NOT change subtotalMinor/totalMinor here; generateBill reads it
    // to pre-fill the Cashier's discount instead of recomputing pricing
    // rules in two places. Nullable: most orders have no offer attached.
    offerId: text("offer_id").references(() => offers.id),

    // Prevents duplicate order creation when a client retries "Send to Kitchen"
    // after a timeout/network blip (spec #37, #71: idempotent submission).
    idempotencyKey: text("idempotency_key").unique(),

    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
    completedAt: integer("completed_at"),
  },
  (t) => ({
    createdAtIdx: index("orders_created_at_idx").on(t.createdAt),
    statusIdx: index("orders_status_idx").on(t.status),
    tableIdx: index("orders_table_idx").on(t.tableId),
    waiterIdx: index("orders_waiter_idx").on(t.waiterUserId),
  })
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull().references(() => orders.id),
    menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
    variantId: text("variant_id").references(() => menuVariants.id),
    quantity: integer("quantity").notNull(),
    unitPriceMinor: integer("unit_price_minor").notNull(), // frozen at order time
    lineTotalMinor: integer("line_total_minor").notNull(),
    notes: text("notes"),
    kitchenStatus: text("kitchen_status", { enum: ITEM_KITCHEN_STATUSES }).notNull().default("PENDING"),

    // Set when this line was generated by expanding a Combo the waiter
    // ordered directly (see orderService.priceCombo), so receipts/kitchen
    // tickets can group it visually. comboName is a frozen snapshot — same
    // reasoning as unitPriceMinor above: a combo renamed/removed later
    // must not rewrite history.
    comboId: text("combo_id").references(() => combos.id),
    comboName: text("combo_name"),
  },
  (t) => ({ orderIdx: index("order_items_order_idx").on(t.orderId) })
);

export const orderItemModifiers = sqliteTable("order_item_modifiers", {
  id: text("id").primaryKey(),
  orderItemId: text("order_item_id").notNull().references(() => orderItems.id),
  modifierId: text("modifier_id").notNull().references(() => modifiers.id),
  quantity: integer("quantity").notNull().default(1),
  unitPriceMinor: integer("unit_price_minor").notNull(), // frozen at order time
});

export const orderStatusHistory = sqliteTable(
  "order_status_history",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id").notNull().references(() => orders.id),
    oldStatus: text("old_status", { enum: ORDER_STATUSES }),
    newStatus: text("new_status", { enum: ORDER_STATUSES }).notNull(),
    changedBy: text("changed_by").notNull().references(() => users.id),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({ orderIdx: index("order_status_history_order_idx").on(t.orderId) })
);

// ---------------------------------------------------------------------
// BILLING / PAYMENTS
// ---------------------------------------------------------------------

export const BILL_STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID", "VOIDED"] as const;
export const PAYMENT_METHODS = ["CASH", "CARD", "MOBILE", "OTHER"] as const;

export const bills = sqliteTable("bills", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id),
  billNumber: text("bill_number").notNull().unique(),
  subtotalMinor: integer("subtotal_minor").notNull(),
  discountMinor: integer("discount_minor").notNull().default(0),
  taxMinor: integer("tax_minor").notNull().default(0),
  serviceChargeMinor: integer("service_charge_minor").notNull().default(0),
  totalMinor: integer("total_minor").notNull(),
  status: text("status", { enum: BILL_STATUSES }).notNull().default("UNPAID"),
  generatedBy: text("generated_by").notNull().references(() => users.id),
  generatedAt: integer("generated_at").notNull().default(now),
  // Cashier's mandatory note explaining any ad-hoc discount applied at
  // billing time (distinct from a pre-defined Offer). Required whenever
  // discountMinor > 0 and no offerId is set — see billingService.
  discountReason: text("discount_reason"),
  offerId: text("offer_id").references(() => offers.id),
});

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  billId: text("bill_id").notNull().references(() => bills.id),
  paymentMethod: text("payment_method", { enum: PAYMENT_METHODS }).notNull(),
  amountMinor: integer("amount_minor").notNull(),
  reference: text("reference"),
  receivedBy: text("received_by").notNull().references(() => users.id),
  paidAt: integer("paid_at").notNull().default(now),
});

// ---------------------------------------------------------------------
// CUSTOMERS
// ---------------------------------------------------------------------

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  branchId: text("branch_id").notNull().references(() => branches.id),
  name: text("name"),
  phone: text("phone"),
  email: text("email"),
  createdAt: integer("created_at").notNull().default(now),
});

// ---------------------------------------------------------------------
// AUDIT
// ---------------------------------------------------------------------

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    branchId: text("branch_id").notNull().references(() => branches.id),
    userId: text("user_id").references(() => users.id),
    action: text("action").notNull(), // extensible — see domain/audit/actions.ts
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    oldValueJson: text("old_value_json"),
    newValueJson: text("new_value_json"),
    ipAddress: text("ip_address"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => ({
    createdAtIdx: index("audit_logs_created_at_idx").on(t.createdAt),
    entityIdx: index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  })
);

// ---------------------------------------------------------------------
// COUNTERS (backs sequential public Order IDs, bill numbers)
// ---------------------------------------------------------------------

export const counters = sqliteTable(
  "counters",
  {
    branchId: text("branch_id").notNull().references(() => branches.id),
    name: text("name").notNull(), // e.g. "order_id", "bill_number"
    value: integer("value").notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.branchId, t.name] }) })
);

// ---------------------------------------------------------------------
// KITCHEN AVAILABILITY
// ---------------------------------------------------------------------

export const itemAvailabilityEvents = sqliteTable("item_availability_events", {
  id: text("id").primaryKey(),
  menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
  changedBy: text("changed_by").notNull().references(() => users.id),
  status: text("status", { enum: ["UNAVAILABLE", "AVAILABLE"] }).notNull(),
  reason: text("reason"),
  startsAt: integer("starts_at").notNull().default(now),
  endsAt: integer("ends_at"),
});
