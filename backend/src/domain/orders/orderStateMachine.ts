import { ORDER_STATUSES } from "../../infra/db/schema";

export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

/**
 * Centralized order state-transition table (spec #4, #39). Every status
 * change in the system goes through `assertTransition` — no route or
 * service mutates `orders.status` directly. This is the single place that
 * knows which transitions are legal, so kitchen, waiter, and cashier flows
 * cannot put an order into an inconsistent state.
 */
const TRANSITIONS: Record<OrderStatusValue, OrderStatusValue[]> = {
  DRAFT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SENT_TO_KITCHEN", "CANCELLED"],
  SENT_TO_KITCHEN: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: ["BILL_REQUESTED", "CANCELLED"],
  BILL_REQUESTED: ["BILLED", "CANCELLED"],
  BILLED: ["PAID", "VOIDED"],
  PAID: ["COMPLETED", "VOIDED"],
  COMPLETED: [],
  CANCELLED: [],
  VOIDED: [],
};

export class InvalidTransitionError extends Error {
  constructor(from: OrderStatusValue, to: OrderStatusValue) {
    super(`Cannot transition order from ${from} to ${to}.`);
  }
}

export function assertTransition(from: OrderStatusValue, to: OrderStatusValue) {
  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function canTransition(from: OrderStatusValue, to: OrderStatusValue): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}
