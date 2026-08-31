import { eq } from "drizzle-orm";
import { db } from "../../infra/db/client";
import { bills, orders } from "../../infra/db/schema";
import { createId } from "../shared/id";
import { nextCounterValue } from "../orders/counterService";
import { recordAudit } from "../audit/auditService";
import { AUDIT_ACTIONS } from "../audit/actions";
import { ApiError } from "../../api/middleware/errorHandler";
import { transitionOrderStatus } from "../orders/orderService";

export interface GenerateBillInput {
  orderId: string;
  discountMinor?: number;
  taxMinor?: number;
  serviceChargeMinor?: number;
  /** Cashier's mandatory note for an ad-hoc discount (required whenever discountMinor > 0 and offerId is absent — enforced in billingRoutes). */
  discountReason?: string;
  /** A pre-defined Offer being applied instead of / alongside a free-form discount. */
  offerId?: string;
}

/**
 * Bill generation is separate from the order record (spec #21). The order
 * must be at BILL_REQUESTED (or already BILLED, for idempotent re-fetch)
 * before a bill can be produced — this stops a bill being generated for an
 * order nobody has actually finished serving.
 *
 * Tax/VAT and service-charge RULES are an open product-discovery question
 * (OPEN_QUESTIONS.md) — this function does not invent jurisdiction-specific
 * math. It accepts already-computed minor-unit amounts from the caller
 * (cashier UI / future config-driven tax engine) and persists them as-is.
 */
export function generateBill(input: GenerateBillInput, actingUserId: string) {
  const order = db.select().from(orders).where(eq(orders.id, input.orderId)).get();
  if (!order) throw new ApiError(404, "NOT_FOUND", "Order not found.");

  const existingBill = db.select().from(bills).where(eq(bills.orderId, input.orderId)).get();
  if (existingBill) return existingBill;

  if (order.status !== "BILL_REQUESTED") {
    throw new ApiError(409, "INVALID_STATE", `Order must be BILL_REQUESTED to generate a bill (currently ${order.status}).`);
  }

  const discountMinor = input.discountMinor ?? 0;
  const taxMinor = input.taxMinor ?? 0;
  const serviceChargeMinor = input.serviceChargeMinor ?? 0;
  const totalMinor = order.subtotalMinor - discountMinor + taxMinor + serviceChargeMinor;
  if (totalMinor < 0) throw new ApiError(400, "VALIDATION_ERROR", "Bill total cannot be negative.");

  const billId = createId();
  const billNumber = `B-${nextCounterValue(order.branchId, "bill_number")}`;

  db.insert(bills)
    .values({
      id: billId,
      orderId: order.id,
      billNumber,
      subtotalMinor: order.subtotalMinor,
      discountMinor,
      taxMinor,
      serviceChargeMinor,
      totalMinor,
      status: "UNPAID",
      generatedBy: actingUserId,
      discountReason: input.discountReason ?? null,
      offerId: input.offerId ?? null,
    })
    .run();

  db.update(orders)
    .set({ discountMinor, taxMinor, serviceChargeMinor, totalMinor })
    .where(eq(orders.id, order.id))
    .run();

  transitionOrderStatus(order.id, "BILLED", actingUserId);

  recordAudit({
    branchId: order.branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.BILL_CREATED,
    entityType: "bill",
    entityId: billId,
    newValue: { billNumber, totalMinor, orderId: order.id },
  });

  // Separate, individually queryable audit entry for discounts (spec #41
  // pattern — financially significant changes get their own action type,
  // not buried inside the generic BILL_CREATED entry). Owner can review
  // who gave what discount, and why, via the existing audit log.
  if (discountMinor > 0) {
    recordAudit({
      branchId: order.branchId,
      userId: actingUserId,
      action: AUDIT_ACTIONS.DISCOUNT_APPLIED,
      entityType: "bill",
      entityId: billId,
      newValue: { discountMinor, reason: input.discountReason ?? null, offerId: input.offerId ?? null, orderId: order.id },
    });
  }

  return db.select().from(bills).where(eq(bills.id, billId)).get()!;
}

export function getBill(billId: string) {
  const bill = db.select().from(bills).where(eq(bills.id, billId)).get();
  if (!bill) throw new ApiError(404, "NOT_FOUND", "Bill not found.");
  return bill;
}

export function getBillForOrder(orderId: string) {
  const bill = db.select().from(bills).where(eq(bills.orderId, orderId)).get();
  if (!bill) throw new ApiError(404, "NOT_FOUND", "No bill exists for this order yet.");
  return bill;
}
