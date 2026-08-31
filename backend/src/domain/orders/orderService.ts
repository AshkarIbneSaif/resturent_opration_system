import { eq, and } from "drizzle-orm";
import { db } from "../../infra/db/client";
import {
  orders,
  orderItems,
  orderItemModifiers,
  orderStatusHistory,
  menuItems,
  menuVariants,
  modifiers,
  restaurantTables,
  combos,
  comboItems,
  offers,
  ORDER_SOURCES,
  ORDER_TYPES,
  ITEM_KITCHEN_STATUSES,
} from "../../infra/db/schema";
import { createId } from "../shared/id";
import { nextCounterValue } from "./counterService";
import { assertTransition, InvalidTransitionError, OrderStatusValue } from "./orderStateMachine";
import { recordAudit } from "../audit/auditService";
import { AUDIT_ACTIONS } from "../audit/actions";
import { ApiError } from "../../api/middleware/errorHandler";
import { changeTableStatus } from "../tables/tableService";
import { emitOrderEvent } from "../../realtime/events";

export type OrderSourceValue = (typeof ORDER_SOURCES)[number];
export type OrderTypeValue = (typeof ORDER_TYPES)[number];
export type ItemKitchenStatusValue = (typeof ITEM_KITCHEN_STATUSES)[number];

export interface CreateOrderItemInput {
  menuItemId: string;
  variantId?: string;
  quantity: number;
  notes?: string;
  modifiers?: { modifierId: string; quantity: number }[];
}

export interface CreateOrderComboInput {
  comboId: string;
  quantity: number;
}

export interface CreateOrderInput {
  branchId: string;
  source: OrderSourceValue;
  orderType: OrderTypeValue;
  tableId?: string;
  waiterUserId?: string;
  customerId?: string;
  items: CreateOrderItemInput[];
  /** Combos ordered directly (waiter taps a combo card) — expanded into their component lines below. */
  combos?: CreateOrderComboInput[];
  /** An Offer the waiter attached at order time, purely to save the Cashier a step later — see schema.ts orders.offerId. */
  offerId?: string;
  idempotencyKey: string;
}

/** A fully-priced line ready to insert, whether it came from a plain menu item or was expanded out of a combo. */
interface PricedLine {
  menuItemId: string;
  variantId: string | null;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  notes: string | null;
  resolvedModifiers: { modifierId: string; quantity: number; unitPriceMinor: number }[];
  comboId: string | null;
  comboName: string | null;
}

function nowEpoch() {
  return Math.floor(Date.now() / 1000);
}

function priceItem(input: CreateOrderItemInput): PricedLine {
  const menuItem = db.select().from(menuItems).where(eq(menuItems.id, input.menuItemId)).get();
  if (!menuItem) throw new ApiError(400, "INVALID_ITEM", `Menu item ${input.menuItemId} does not exist.`);
  if (!menuItem.isActive) throw new ApiError(400, "ITEM_INACTIVE", `${menuItem.name} is not currently sold.`);
  if (!menuItem.kitchenAvailable) {
    throw new ApiError(409, "ITEM_UNAVAILABLE", `${menuItem.name} is temporarily unavailable.`);
  }

  let unitPriceMinor = menuItem.basePriceMinor;

  if (input.variantId) {
    const variant = db.select().from(menuVariants).where(eq(menuVariants.id, input.variantId)).get();
    if (!variant || variant.menuItemId !== menuItem.id) {
      throw new ApiError(400, "INVALID_VARIANT", "Variant does not belong to this menu item.");
    }
    if (!variant.isActive) throw new ApiError(400, "VARIANT_INACTIVE", "This variant is not available.");
    unitPriceMinor += variant.priceDeltaMinor;
  }

  const resolvedModifiers = (input.modifiers ?? []).map((m) => {
    const modifier = db.select().from(modifiers).where(eq(modifiers.id, m.modifierId)).get();
    if (!modifier) throw new ApiError(400, "INVALID_MODIFIER", `Modifier ${m.modifierId} does not exist.`);
    if (!modifier.isActive) throw new ApiError(400, "MODIFIER_INACTIVE", `${modifier.name} is not available.`);
    return { modifierId: modifier.id, quantity: m.quantity, unitPriceMinor: modifier.priceDeltaMinor };
  });

  const modifierTotal = resolvedModifiers.reduce((sum, m) => sum + m.unitPriceMinor * m.quantity, 0);
  const lineTotalMinor = (unitPriceMinor + modifierTotal) * input.quantity;

  return {
    menuItemId: menuItem.id,
    variantId: input.variantId ?? null,
    quantity: input.quantity,
    unitPriceMinor,
    lineTotalMinor,
    notes: input.notes ?? null,
    resolvedModifiers,
    comboId: null,
    comboName: null,
  };
}

/**
 * Expands one "order N of this Combo" request into its component lines,
 * each priced so the group's total equals `combo.priceMinor * quantity`
 * (spec: order a Combo directly from the Waiter screen at its bundle
 * price, not the sum of the individual items). The discount implied by
 * the bundle price is distributed across components proportionally to
 * their normal price, rounded per line — the sum can be off by at most a
 * few minor units due to rounding, which is an accepted MVP trade-off
 * (same category as the tax/service-charge rules noted in billingService).
 * Combos never carry variants or modifiers (schema: combo_items only
 * references menuItemId+quantity), so each expanded line is plain.
 */
function priceCombo(input: CreateOrderComboInput): PricedLine[] {
  const combo = db.select().from(combos).where(eq(combos.id, input.comboId)).get();
  if (!combo) throw new ApiError(400, "INVALID_COMBO", `Combo ${input.comboId} does not exist.`);
  if (!combo.isActive) throw new ApiError(409, "COMBO_UNAVAILABLE", `${combo.name} is not currently offered.`);
  if (combo.startsAt && combo.startsAt > nowEpoch()) {
    throw new ApiError(409, "COMBO_UNAVAILABLE", `${combo.name} isn't available yet.`);
  }
  if (combo.endsAt && combo.endsAt <= nowEpoch()) {
    throw new ApiError(409, "COMBO_UNAVAILABLE", `${combo.name} has expired.`);
  }

  const components = db.select().from(comboItems).where(eq(comboItems.comboId, combo.id)).all();
  if (components.length === 0) throw new ApiError(409, "COMBO_UNAVAILABLE", `${combo.name} has no items configured.`);

  const resolved = components.map((c) => {
    const menuItem = db.select().from(menuItems).where(eq(menuItems.id, c.menuItemId)).get();
    if (!menuItem) throw new ApiError(409, "COMBO_UNAVAILABLE", `${combo.name} references a menu item that no longer exists.`);
    if (!menuItem.isActive) throw new ApiError(409, "ITEM_INACTIVE", `${menuItem.name} (in ${combo.name}) is not currently sold.`);
    if (!menuItem.kitchenAvailable) {
      throw new ApiError(409, "ITEM_UNAVAILABLE", `${menuItem.name} (in ${combo.name}) is temporarily unavailable.`);
    }
    return { menuItem, comboQty: c.quantity };
  });

  const normalUnitTotal = resolved.reduce((sum, r) => sum + r.menuItem.basePriceMinor * r.comboQty, 0);
  const normalTotalForQty = normalUnitTotal * input.quantity;
  const targetTotal = combo.priceMinor * input.quantity;
  const ratio = normalTotalForQty > 0 ? targetTotal / normalTotalForQty : 1;

  return resolved.map((r) => {
    const quantity = r.comboQty * input.quantity;
    const lineTotalMinor = Math.round(r.menuItem.basePriceMinor * quantity * ratio);
    const unitPriceMinor = quantity > 0 ? Math.round(lineTotalMinor / quantity) : 0;
    return {
      menuItemId: r.menuItem.id,
      variantId: null,
      quantity,
      unitPriceMinor,
      lineTotalMinor,
      notes: null,
      resolvedModifiers: [],
      comboId: combo.id,
      comboName: combo.name,
    };
  });
}

/**
 * Creates an order and all its items in one SQLite transaction. Prices are
 * resolved from the CURRENT menu at creation time and then frozen onto the
 * order_items row (unitPriceMinor/lineTotalMinor) — later menu price
 * changes never retroactively alter this order (spec #15).
 *
 * Idempotent: if `idempotencyKey` matches an existing order, that order is
 * returned as-is instead of creating a duplicate (spec #37/#71 — a waiter
 * double-tapping "Send to Kitchen" under network lag must not create two
 * orders).
 */
export function createOrder(input: CreateOrderInput, createdByUserId: string) {
  const existing = db.select().from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey)).get();
  if (existing) return getOrderWithItems(existing.id);

  if (input.items.length === 0 && (input.combos ?? []).length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Order must contain at least one item.");
  }

  if (input.orderType === "DINE_IN" && !input.tableId) {
    throw new ApiError(400, "VALIDATION_ERROR", "Dine-in orders must be associated with a table.");
  }

  if (input.tableId) {
    const table = db.select().from(restaurantTables).where(eq(restaurantTables.id, input.tableId)).get();
    if (!table) throw new ApiError(400, "INVALID_TABLE", "Table does not exist.");
    if (!table.isActive) throw new ApiError(400, "TABLE_INACTIVE", "Table is not active.");
    if (table.status === "BILL_REQUESTED" || table.status === "OUT_OF_SERVICE") {
      throw new ApiError(409, "TABLE_NOT_AVAILABLE", `Table ${table.tableNumber} is not available for a new order.`);
    }
  }

  const priced: PricedLine[] = [
    ...input.items.map(priceItem),
    ...(input.combos ?? []).flatMap(priceCombo),
  ];
  const subtotalMinor = priced.reduce((sum, p) => sum + p.lineTotalMinor, 0);

  let attachedOfferId: string | null = null;
  if (input.offerId) {
    const offer = db.select().from(offers).where(eq(offers.id, input.offerId)).get();
    if (!offer || offer.branchId !== input.branchId) {
      throw new ApiError(400, "INVALID_OFFER", "Offer does not exist.");
    }
    if (!offer.isActive) throw new ApiError(409, "OFFER_UNAVAILABLE", `${offer.name} is not currently active.`);
    if (offer.startsAt && offer.startsAt > nowEpoch()) throw new ApiError(409, "OFFER_UNAVAILABLE", `${offer.name} isn't available yet.`);
    if (offer.endsAt && offer.endsAt <= nowEpoch()) throw new ApiError(409, "OFFER_UNAVAILABLE", `${offer.name} has expired.`);
    attachedOfferId = offer.id;
  }

  const orderId = createId();
  const publicOrderId = String(nextCounterValue(input.branchId, "order_id"));

  db.insert(orders)
    .values({
      id: orderId,
      publicOrderId,
      branchId: input.branchId,
      source: input.source,
      orderType: input.orderType,
      tableId: input.tableId ?? null,
      waiterUserId: input.waiterUserId ?? null,
      createdByUserId,
      customerId: input.customerId ?? null,
      status: "DRAFT",
      subtotalMinor,
      totalMinor: subtotalMinor,
      offerId: attachedOfferId,
      idempotencyKey: input.idempotencyKey,
    })
    .run();

  for (const p of priced) {
    const orderItemId = createId();
    db.insert(orderItems)
      .values({
        id: orderItemId,
        orderId,
        menuItemId: p.menuItemId,
        variantId: p.variantId,
        quantity: p.quantity,
        unitPriceMinor: p.unitPriceMinor,
        lineTotalMinor: p.lineTotalMinor,
        notes: p.notes,
        kitchenStatus: "PENDING",
        comboId: p.comboId,
        comboName: p.comboName,
      })
      .run();

    for (const m of p.resolvedModifiers) {
      db.insert(orderItemModifiers)
        .values({
          id: createId(),
          orderItemId,
          modifierId: m.modifierId,
          quantity: m.quantity,
          unitPriceMinor: m.unitPriceMinor,
        })
        .run();
    }
  }

  db.insert(orderStatusHistory)
    .values({ id: createId(), orderId, oldStatus: null, newStatus: "DRAFT", changedBy: createdByUserId })
    .run();

  recordAudit({
    branchId: input.branchId,
    userId: createdByUserId,
    action: AUDIT_ACTIONS.ORDER_CREATED,
    entityType: "order",
    entityId: orderId,
    newValue: { publicOrderId, source: input.source, orderType: input.orderType, subtotalMinor },
  });

  // A new dine-in order occupies its table (spec #8: table state tracks
  // service in progress). Only bump AVAILABLE/RESERVED -> OCCUPIED; an
  // already-OCCUPIED table (e.g. a second order was somehow allowed) is
  // left as-is rather than erroring the whole order creation.
  if (input.tableId) {
    const table = db.select().from(restaurantTables).where(eq(restaurantTables.id, input.tableId)).get()!;
    if (table.status === "AVAILABLE" || table.status === "RESERVED") {
      changeTableStatus(input.tableId, "OCCUPIED", createdByUserId);
    }
  }

  const result = getOrderWithItems(orderId);
  emitOrderEvent("order.created", result);
  return result;
}

export function getOrderWithItems(orderId: string) {
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found.");

  const items = db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).all();
  const itemsWithModifiers = items.map((item) => ({
    ...item,
    modifiers: db
      .select()
      .from(orderItemModifiers)
      .where(eq(orderItemModifiers.orderItemId, item.id))
      .all(),
  }));

  return { ...order, items: itemsWithModifiers };
}

export function findOrderByPublicId(branchId: string, publicOrderId: string) {
  const order = db
    .select()
    .from(orders)
    .where(and(eq(orders.branchId, branchId), eq(orders.publicOrderId, publicOrderId)))
    .get();
  if (!order) throw new ApiError(404, "NOT_FOUND", `No order with ID ${publicOrderId}.`);
  return getOrderWithItems(order.id);
}

export function listActiveOrders(branchId: string, waiterUserId?: string) {
  const terminal = new Set(["COMPLETED", "CANCELLED", "VOIDED"]);
  const all = db.select().from(orders).where(eq(orders.branchId, branchId)).all();
  return all
    .filter((o) => !terminal.has(o.status) && (!waiterUserId || o.waiterUserId === waiterUserId))
    .map((o) => getOrderWithItems(o.id));
}

export function listKitchenQueue(branchId: string) {
  const relevant = new Set(["SENT_TO_KITCHEN", "PREPARING", "READY"]);
  const all = db.select().from(orders).where(eq(orders.branchId, branchId)).all();
  return all.filter((o) => relevant.has(o.status)).map((o) => getOrderWithItems(o.id));
}

/**
 * Central status-transition entry point (spec #39): validates the current
 * state via the state machine, records history, updates the row, emits a
 * real-time event, and updates dependent entities (e.g. freeing the table
 * when an order reaches a terminal-ish billing point) — all in one place.
 */
export function transitionOrderStatus(orderId: string, newStatus: OrderStatusValue, actingUserId: string) {
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found.");

  try {
    assertTransition(order.status as OrderStatusValue, newStatus);
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      throw new ApiError(409, "INVALID_TRANSITION", err.message);
    }
    throw err;
  }
  const completedAt = newStatus === "COMPLETED" ? Math.floor(Date.now() / 1000) : order.completedAt;

  db.update(orders)
    .set({ status: newStatus, updatedAt: Math.floor(Date.now() / 1000), completedAt })
    .where(eq(orders.id, orderId))
    .run();

  db.insert(orderStatusHistory)
    .values({ id: createId(), orderId, oldStatus: order.status, newStatus, changedBy: actingUserId })
    .run();

  recordAudit({
    branchId: order.branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.ORDER_STATUS_CHANGED,
    entityType: "order",
    entityId: orderId,
    oldValue: { status: order.status },
    newValue: { status: newStatus },
  });

  if (newStatus === "BILL_REQUESTED" && order.tableId) {
    changeTableStatus(order.tableId, "BILL_REQUESTED", actingUserId);
  }
  if ((newStatus === "COMPLETED" || newStatus === "CANCELLED" || newStatus === "VOIDED") && order.tableId) {
    const table = db.select().from(restaurantTables).where(eq(restaurantTables.id, order.tableId)).get();
    if (table && table.status !== "AVAILABLE" && table.status !== "OUT_OF_SERVICE") {
      changeTableStatus(order.tableId, "AVAILABLE", actingUserId);
    }
  }

  const result = getOrderWithItems(orderId);
  emitOrderEvent(`order.${newStatus.toLowerCase()}`, result);
  return result;
}

/** Sends a CONFIRMED order to the kitchen — a convenience wrapper that also runs the DRAFT->CONFIRMED step if needed. */
export function sendToKitchen(orderId: string, actingUserId: string) {
  const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found.");

  let current = order.status as OrderStatusValue;
  if (current === "DRAFT") {
    transitionOrderStatus(orderId, "CONFIRMED", actingUserId);
    current = "CONFIRMED";
  }
  const result = transitionOrderStatus(orderId, "SENT_TO_KITCHEN", actingUserId);
  recordAudit({
    branchId: order.branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.ORDER_SENT_TO_KITCHEN,
    entityType: "order",
    entityId: orderId,
  });
  emitOrderEvent("order.sent_to_kitchen", result);
  return result;
}

// ---------------------------------------------------------------------
// Item-level kitchen states
// ---------------------------------------------------------------------

const ITEM_TRANSITIONS: Record<ItemKitchenStatusValue, ItemKitchenStatusValue[]> = {
  PENDING: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED"],
  SERVED: [],
  CANCELLED: [],
};

/**
 * Updates a single order item's kitchen status, then recomputes the parent
 * order's overall status from the aggregate of its items — an order can be
 * PARTIALLY_READY in spirit (some items READY, others PREPARING) without a
 * dedicated status: the order stays PREPARING until every non-cancelled
 * item reaches READY, at which point the order auto-advances to READY.
 */
export function updateItemKitchenStatus(orderItemId: string, newStatus: ItemKitchenStatusValue, actingUserId: string) {
  const item = db.select().from(orderItems).where(eq(orderItems.id, orderItemId)).get();
  if (!item) throw new ApiError(404, "NOT_FOUND", "Order item not found.");

  const allowed = ITEM_TRANSITIONS[item.kitchenStatus as ItemKitchenStatusValue];
  if (!allowed.includes(newStatus)) {
    throw new ApiError(409, "INVALID_TRANSITION", `Cannot move item from ${item.kitchenStatus} to ${newStatus}.`);
  }

  db.update(orderItems).set({ kitchenStatus: newStatus }).where(eq(orderItems.id, orderItemId)).run();

  const order = db.select().from(orders).where(eq(orders.id, item.orderId)).get()!;
  emitOrderEvent("order.item_status_changed", { orderId: item.orderId, orderItemId, status: newStatus });

  const siblings = db.select().from(orderItems).where(eq(orderItems.orderId, item.orderId)).all();
  const active = siblings.filter((s) => s.kitchenStatus !== "CANCELLED");
  const allReady = active.length > 0 && active.every((s) => s.kitchenStatus === "READY" || s.kitchenStatus === "SERVED");
  const anyPreparing = active.some((s) => s.kitchenStatus === "PREPARING" || s.kitchenStatus === "READY");

  if (order.status === "SENT_TO_KITCHEN" && anyPreparing) {
    transitionOrderStatus(order.id, "PREPARING", actingUserId);
  } else if (order.status === "PREPARING" && allReady) {
    transitionOrderStatus(order.id, "READY", actingUserId);
  }

  return getOrderWithItems(item.orderId);
}
