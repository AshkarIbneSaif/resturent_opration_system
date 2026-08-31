import { randomBytes } from "crypto";

/** Simple, dependency-free collision-resistant ID (timestamp + random). */
export function createId(): string {
  const ts = Date.now().toString(36);
  const rand = randomBytes(8).toString("hex");
  return `${ts}${rand}`;
}

/**
 * Sequential public Order ID (spec #14: "Order #10452").
 * MVP-safe assumption (see OPEN_QUESTIONS.md — not specified): a
 * branch-scoped monotonically increasing counter, formatted as a bare
 * number, displayed with an "Order #" prefix by the UI/receipt layer.
 * Implemented via a dedicated counter row updated inside the same
 * transaction as order creation, so it never collides under concurrent
 * submissions.
 */
