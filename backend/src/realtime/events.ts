import type { Server as IOServer } from "socket.io";

/**
 * Central event bus (spec #40, #17): the kitchen UI and waiter UI never
 * talk to each other directly — both subscribe to events emitted here by
 * the application layer. `io` is set once at server startup; emitOrderEvent
 * is a no-op (safe for tests) until then.
 */
let io: IOServer | null = null;

export function attachSocketServer(server: IOServer) {
  io = server;
}

export type OrderEventName =
  | "order.created"
  | "order.confirmed"
  | "order.sent_to_kitchen"
  | "order.preparing"
  | "order.item_status_changed"
  | "order.ready"
  | "order.served"
  | "order.bill_requested"
  | "order.billed"
  | "order.paid"
  | "order.completed"
  | "order.cancelled"
  | "order.voided"
  | "menu.item_unavailable"
  | "menu.item_available"
  | "payment.created"
  | "table.status_changed";

export function emitOrderEvent(event: OrderEventName | string, payload: unknown) {
  if (!io) return; // no-op outside a running server (e.g. unit tests)
  io.emit(event, payload);
}
