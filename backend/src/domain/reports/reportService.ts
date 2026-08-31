import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { db } from "../../infra/db/client";
import { orders, orderItems, bills, payments, menuItems, users } from "../../infra/db/schema";

export interface DateRange {
  fromEpochSeconds?: number;
  toEpochSeconds?: number;
}

function inRange(ts: number, range: DateRange): boolean {
  if (range.fromEpochSeconds && ts < range.fromEpochSeconds) return false;
  if (range.toEpochSeconds && ts > range.toEpochSeconds) return false;
  return true;
}

/**
 * Sales report (spec #27): totals, transaction count, paid orders, payment
 * method breakdown, computed directly from bills/payments — no separate
 * "sales" table to keep in sync.
 */
export function salesReport(branchId: string, range: DateRange = {}) {
  const branchOrders = db.select().from(orders).where(eq(orders.branchId, branchId)).all();
  const orderIds = new Set(branchOrders.map((o) => o.id));

  const allBills = db.select().from(bills).all().filter((b) => orderIds.has(b.orderId) && inRange(b.generatedAt, range));
  const billIds = allBills.map((b) => b.id);
  const allPayments = billIds.length
    ? db.select().from(payments).where(inArray(payments.billId, billIds)).all().filter((p) => inRange(p.paidAt, range))
    : [];

  const paidBills = allBills.filter((b) => b.status === "PAID");
  const totalRevenueMinor = allPayments.reduce((sum, p) => sum + p.amountMinor, 0);

  const byMethod: Record<string, number> = {};
  for (const p of allPayments) {
    byMethod[p.paymentMethod] = (byMethod[p.paymentMethod] ?? 0) + p.amountMinor;
  }

  return {
    transactionCount: allBills.length,
    paidOrderCount: paidBills.length,
    totalRevenueMinor,
    paymentMethodBreakdown: byMethod,
  };
}

/** Product performance: best-selling items, quantity sold, revenue by item. */
export function productPerformanceReport(branchId: string, range: DateRange = {}) {
  const branchOrders = db
    .select()
    .from(orders)
    .where(eq(orders.branchId, branchId))
    .all()
    .filter((o) => inRange(o.createdAt, range) && o.status !== "CANCELLED" && o.status !== "VOIDED");
  const orderIds = branchOrders.map((o) => o.id);
  if (orderIds.length === 0) return [];

  const items = db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)).all();

  const byMenuItem = new Map<string, { quantitySold: number; revenueMinor: number }>();
  for (const item of items) {
    if (item.kitchenStatus === "CANCELLED") continue;
    const entry = byMenuItem.get(item.menuItemId) ?? { quantitySold: 0, revenueMinor: 0 };
    entry.quantitySold += item.quantity;
    entry.revenueMinor += item.lineTotalMinor;
    byMenuItem.set(item.menuItemId, entry);
  }

  const results = [...byMenuItem.entries()].map(([menuItemId, stats]) => {
    const menuItem = db.select().from(menuItems).where(eq(menuItems.id, menuItemId)).get();
    return { menuItemId, name: menuItem?.name ?? "Unknown item", ...stats };
  });

  return results.sort((a, b) => b.revenueMinor - a.revenueMinor);
}

/** Waiter performance: orders handled, associated sales, order counts. */
export function waiterPerformanceReport(branchId: string, range: DateRange = {}) {
  const branchOrders = db
    .select()
    .from(orders)
    .where(eq(orders.branchId, branchId))
    .all()
    .filter((o) => inRange(o.createdAt, range) && o.waiterUserId);

  const byWaiter = new Map<string, { orderCount: number; salesMinor: number }>();
  for (const order of branchOrders) {
    const key = order.waiterUserId!;
    const entry = byWaiter.get(key) ?? { orderCount: 0, salesMinor: 0 };
    entry.orderCount += 1;
    if (order.status === "PAID" || order.status === "COMPLETED") {
      entry.salesMinor += order.totalMinor;
    }
    byWaiter.set(key, entry);
  }

  return [...byWaiter.entries()].map(([waiterUserId, stats]) => {
    const waiter = db.select().from(users).where(eq(users.id, waiterUserId)).get();
    return { waiterUserId, displayName: waiter?.displayName ?? "Unknown", ...stats };
  });
}

/** Order statistics: volume, status distribution, dine-in vs takeaway, source distribution. */
export function orderStatisticsReport(branchId: string, range: DateRange = {}) {
  const branchOrders = db
    .select()
    .from(orders)
    .where(eq(orders.branchId, branchId))
    .all()
    .filter((o) => inRange(o.createdAt, range));

  const statusDistribution: Record<string, number> = {};
  const typeDistribution: Record<string, number> = {};
  const sourceDistribution: Record<string, number> = {};

  for (const o of branchOrders) {
    statusDistribution[o.status] = (statusDistribution[o.status] ?? 0) + 1;
    typeDistribution[o.orderType] = (typeDistribution[o.orderType] ?? 0) + 1;
    sourceDistribution[o.source] = (sourceDistribution[o.source] ?? 0) + 1;
  }

  return {
    totalOrders: branchOrders.length,
    statusDistribution,
    typeDistribution,
    sourceDistribution,
  };
}
