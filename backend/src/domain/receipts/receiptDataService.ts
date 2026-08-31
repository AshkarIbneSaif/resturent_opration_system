import { eq } from "drizzle-orm";
import { db } from "../../infra/db/client";
import {
  orders,
  orderItems,
  orderItemModifiers,
  bills,
  payments,
  restaurants,
  restaurantTables,
  users,
  menuItems,
  menuVariants,
  modifiers,
} from "../../infra/db/schema";
import { currency } from "../../config/env";
import { ApiError } from "../../api/middleware/errorHandler";

/**
 * Normalized, printer-agnostic receipt data (spec pipeline: Order -> Receipt
 * Data Object -> Template -> Renderer -> Printer). Nothing downstream of
 * this function touches the database — swapping printer models or adding a
 * new template only ever needs this shape.
 */
export interface ReceiptData {
  restaurant: { name: string; logoPath: string | null; address: string | null; phone: string | null };
  orderPublicId: string;
  tableNumber: string | null;
  orderType: string;
  waiterName: string | null;
  cashierName: string | null;
  dateTimeEpochSeconds: number;
  items: {
    name: string;
    variantName: string | null;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
    modifiers: { name: string; quantity: number }[];
  }[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  serviceChargeMinor: number;
  totalMinor: number;
  paymentMethod: string | null;
  billStatus: string;
  billNumber: string;
  currency: { code: string; symbol: string; decimalPlaces: number };
}

export function buildReceiptData(orderId: string): ReceiptData {
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found.");

  const bill = db.select().from(bills).where(eq(bills.orderId, orderId)).get();
  if (!bill) throw new ApiError(409, "NO_BILL", "No bill has been generated for this order yet.");

  const restaurant = db.select().from(restaurants).get();
  const table = order.tableId ? db.select().from(restaurantTables).where(eq(restaurantTables.id, order.tableId)).get() : null;
  const waiter = order.waiterUserId ? db.select().from(users).where(eq(users.id, order.waiterUserId)).get() : null;
  const cashier = db.select().from(users).where(eq(users.id, bill.generatedBy)).get();

  const rawItems = db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();
  const items = rawItems.map((item) => {
    const menuItem = db.select().from(menuItems).where(eq(menuItems.id, item.menuItemId)).get();
    const variant = item.variantId ? db.select().from(menuVariants).where(eq(menuVariants.id, item.variantId)).get() : null;
    const mods = db
      .select()
      .from(orderItemModifiers)
      .where(eq(orderItemModifiers.orderItemId, item.id))
      .all()
      .map((m) => {
        const modifier = db.select().from(modifiers).where(eq(modifiers.id, m.modifierId)).get();
        return { name: modifier?.name ?? "Modifier", quantity: m.quantity };
      });

    return {
      name: menuItem?.name ?? "Item",
      variantName: variant?.name ?? null,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      lineTotalMinor: item.lineTotalMinor,
      modifiers: mods,
    };
  });

  const lastPayment = db
    .select()
    .from(payments)
    .where(eq(payments.billId, bill.id))
    .all()
    .sort((a, b) => b.paidAt - a.paidAt)[0];

  return {
    restaurant: {
      name: restaurant?.name ?? "Restaurant",
      logoPath: restaurant?.logoPath ?? null,
      address: restaurant?.address ?? null,
      phone: restaurant?.phone ?? null,
    },
    orderPublicId: order.publicOrderId,
    tableNumber: table?.tableNumber ?? null,
    orderType: order.orderType,
    waiterName: waiter?.displayName ?? null,
    cashierName: cashier?.displayName ?? null,
    dateTimeEpochSeconds: bill.generatedAt,
    items,
    subtotalMinor: bill.subtotalMinor,
    discountMinor: bill.discountMinor,
    taxMinor: bill.taxMinor,
    serviceChargeMinor: bill.serviceChargeMinor,
    totalMinor: bill.totalMinor,
    paymentMethod: lastPayment?.paymentMethod ?? null,
    billStatus: bill.status,
    billNumber: bill.billNumber,
    currency,
  };
}

/** Kitchen receipt data — operational only, no financial fields (spec #25). */
export interface KitchenReceiptData {
  orderPublicId: string;
  tableNumber: string | null;
  orderType: string;
  createdAtEpochSeconds: number;
  items: {
    name: string;
    variantName: string | null;
    quantity: number;
    notes: string | null;
    modifiers: { name: string; quantity: number }[];
  }[];
}

export function buildKitchenReceiptData(orderId: string): KitchenReceiptData {
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found.");
  const table = order.tableId ? db.select().from(restaurantTables).where(eq(restaurantTables.id, order.tableId)).get() : null;

  const rawItems = db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();
  const items = rawItems.map((item) => {
    const menuItem = db.select().from(menuItems).where(eq(menuItems.id, item.menuItemId)).get();
    const variant = item.variantId ? db.select().from(menuVariants).where(eq(menuVariants.id, item.variantId)).get() : null;
    const mods = db
      .select()
      .from(orderItemModifiers)
      .where(eq(orderItemModifiers.orderItemId, item.id))
      .all()
      .map((m) => {
        const modifier = db.select().from(modifiers).where(eq(modifiers.id, m.modifierId)).get();
        return { name: modifier?.name ?? "Modifier", quantity: m.quantity };
      });
    return {
      name: menuItem?.name ?? "Item",
      variantName: variant?.name ?? null,
      quantity: item.quantity,
      notes: item.notes,
      modifiers: mods,
    };
  });

  return {
    orderPublicId: order.publicOrderId,
    tableNumber: table?.tableNumber ?? null,
    orderType: order.orderType,
    createdAtEpochSeconds: order.createdAt,
    items,
  };
}
