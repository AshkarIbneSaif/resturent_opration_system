/**
 * Mirrors backend/src/domain/identity/permissions.ts. This is used ONLY to
 * decide what the UI shows — every one of these is independently
 * re-checked server-side on every request (spec #3, #38). Losing sync
 * with the backend list only affects which buttons render, never what
 * the API will actually allow.
 */
export const PERMISSIONS = {
  ORDER_CREATE: "order.create",
  ORDER_MODIFY: "order.modify",
  ORDER_VIEW: "order.view",
  ORDER_SEND_TO_KITCHEN: "order.send_to_kitchen",
  KITCHEN_VIEW: "kitchen.view",
  KITCHEN_UPDATE_ITEM_STATUS: "kitchen.update_item_status",
  KITCHEN_UPDATE_AVAILABILITY: "kitchen.update_availability",
  MENU_VIEW: "menu.view",
  MENU_CREATE: "menu.create",
  MENU_UPDATE: "menu.update",
  MENU_PRICE_CHANGE: "menu.price_change",
  MENU_DELETE: "menu.delete",
  CATEGORY_DELETE: "menu.delete_category",
  OFFER_VIEW: "offer.view",
  OFFER_MANAGE: "offer.manage",
  COMBO_MANAGE: "combo.manage",
  TABLE_VIEW: "table.view",
  TABLE_MANAGE: "table.manage",
  BILL_CREATE: "bill.create",
  BILL_VIEW: "bill.view",
  PAYMENT_CREATE: "payment.create",
  PAYMENT_VIEW: "payment.view",
  DISCOUNT_APPLY: "discount.apply",
  USER_CREATE: "user.create",
  REPORT_SALES: "report.sales",
  REPORT_PERFORMANCE: "report.performance",
  SETTINGS_RESTAURANT_UPDATE: "settings.restaurant.update",
  AUDIT_VIEW: "audit.view",
  CUSTOMER_MANAGE: "customer.manage",
} as const;

export const ROLE_HOME_ROUTE: Record<string, string> = {
  OWNER: "/owner",
  MANAGER: "/manager",
  WAITER: "/waiter",
  KITCHEN: "/kitchen",
  CASHIER: "/cashier",
  TAKEOUT: "/takeout",
};
