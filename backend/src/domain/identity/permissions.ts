/**
 * Granular permission keys (ROLES_AND_PERMISSIONS.md "Permission Design").
 * The server authorizes against these keys — never against role names
 * directly — so future roles or per-user permission overrides don't
 * require rewriting authorization checks.
 */
export const PERMISSIONS = {
  // Orders
  ORDER_CREATE: "order.create",
  ORDER_MODIFY: "order.modify",
  ORDER_CANCEL: "order.cancel",
  ORDER_VIEW: "order.view",
  ORDER_SEND_TO_KITCHEN: "order.send_to_kitchen",

  // Kitchen
  KITCHEN_VIEW: "kitchen.view",
  KITCHEN_UPDATE_ITEM_STATUS: "kitchen.update_item_status",
  KITCHEN_UPDATE_AVAILABILITY: "kitchen.update_availability",

  // Menu
  MENU_VIEW: "menu.view",
  MENU_CREATE: "menu.create",
  MENU_UPDATE: "menu.update",
  MENU_DELETE: "menu.delete",
  MENU_PRICE_CHANGE: "menu.price_change",
  CATEGORY_DELETE: "menu.delete_category",

  // Offers / Combos
  OFFER_VIEW: "offer.view",
  OFFER_MANAGE: "offer.manage",
  COMBO_MANAGE: "combo.manage",

  // Tables
  TABLE_VIEW: "table.view",
  TABLE_MANAGE: "table.manage",

  // Billing / payments
  BILL_CREATE: "bill.create",
  BILL_VIEW: "bill.view",
  PAYMENT_CREATE: "payment.create",
  PAYMENT_REFUND: "payment.refund",
  PAYMENT_VIEW: "payment.view",
  DISCOUNT_APPLY: "discount.apply",

  // Users
  USER_CREATE: "user.create",
  USER_DISABLE: "user.disable",
  USER_RESET: "user.reset",
  USER_ASSIGN_ROLE: "user.assign_role",

  // Reports
  REPORT_SALES: "report.sales",
  REPORT_PERFORMANCE: "report.performance",
  REPORT_OPERATIONAL: "report.operational",

  // Settings / restaurant identity
  SETTINGS_RESTAURANT_UPDATE: "settings.restaurant.update",
  SETTINGS_CRITICAL_UPDATE: "settings.critical.update",

  // Audit / backup
  AUDIT_VIEW: "audit.view",
  BACKUP_RESTORE: "backup.restore",

  // Takeout / customers
  CUSTOMER_MANAGE: "customer.manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Actions that require an additional critical-action confirmation (REQUIREMENTS.md FR-011). */
export const CRITICAL_ACTIONS = new Set<PermissionKey>([
  PERMISSIONS.SETTINGS_RESTAURANT_UPDATE,
  PERMISSIONS.SETTINGS_CRITICAL_UPDATE,
  PERMISSIONS.BACKUP_RESTORE,
]);

/**
 * Default role -> permission set. Seeded into role_permissions at bootstrap.
 * Manager intentionally excludes settings.*, user.*, backup.*, audit.view —
 * ROLES_AND_PERMISSIONS.md: "Manager should NOT automatically have
 * owner-level authority."
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  OWNER: Object.values(PERMISSIONS),

  MANAGER: [
    PERMISSIONS.MENU_VIEW,
    PERMISSIONS.MENU_CREATE,
    PERMISSIONS.MENU_UPDATE,
    PERMISSIONS.MENU_DELETE,
    PERMISSIONS.MENU_PRICE_CHANGE,
    PERMISSIONS.CATEGORY_DELETE,
    PERMISSIONS.OFFER_VIEW,
    PERMISSIONS.OFFER_MANAGE,
    PERMISSIONS.COMBO_MANAGE,
    PERMISSIONS.TABLE_VIEW,
    PERMISSIONS.TABLE_MANAGE,
    PERMISSIONS.ORDER_VIEW,
    PERMISSIONS.KITCHEN_VIEW,
    PERMISSIONS.REPORT_SALES,
    PERMISSIONS.REPORT_PERFORMANCE,
    PERMISSIONS.REPORT_OPERATIONAL,
    PERMISSIONS.CUSTOMER_MANAGE,
  ],

  WAITER: [
    PERMISSIONS.TABLE_VIEW,
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_MODIFY,
    PERMISSIONS.ORDER_VIEW,
    PERMISSIONS.ORDER_SEND_TO_KITCHEN,
    PERMISSIONS.MENU_VIEW,
    PERMISSIONS.OFFER_VIEW,
    PERMISSIONS.BILL_CREATE, // "request bill" — creates a BILL_REQUESTED transition, not a bill record
  ],

  KITCHEN: [
    PERMISSIONS.KITCHEN_VIEW,
    PERMISSIONS.KITCHEN_UPDATE_ITEM_STATUS,
    PERMISSIONS.KITCHEN_UPDATE_AVAILABILITY,
    PERMISSIONS.ORDER_VIEW,
    PERMISSIONS.MENU_VIEW,
  ],

  CASHIER: [
    PERMISSIONS.ORDER_VIEW,
    PERMISSIONS.BILL_CREATE,
    PERMISSIONS.BILL_VIEW,
    PERMISSIONS.PAYMENT_CREATE,
    PERMISSIONS.PAYMENT_VIEW,
    PERMISSIONS.DISCOUNT_APPLY,
    PERMISSIONS.MENU_VIEW,
    PERMISSIONS.OFFER_VIEW,
  ],

  TAKEOUT: [
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_MODIFY,
    PERMISSIONS.ORDER_VIEW,
    PERMISSIONS.ORDER_SEND_TO_KITCHEN,
    PERMISSIONS.MENU_VIEW,
    PERMISSIONS.PAYMENT_CREATE,
    PERMISSIONS.BILL_CREATE,
    PERMISSIONS.CUSTOMER_MANAGE,
  ],
};
