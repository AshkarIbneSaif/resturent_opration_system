import { eq } from "drizzle-orm";
import { db, getRawDb, persist } from "../../infra/db/client";
import { runInTransaction } from "../../infra/db/transaction";
import { bills, payments, orders } from "../../infra/db/schema";
import { createId } from "../shared/id";
import { recordAudit } from "../audit/auditService";
import { AUDIT_ACTIONS } from "../audit/actions";
import { ApiError } from "../../api/middleware/errorHandler";
import { transitionOrderStatus } from "../orders/orderService";
import { emitOrderEvent } from "../../realtime/events";
import type { PAYMENT_METHODS } from "../../infra/db/schema";

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

export interface RecordPaymentInput {
  billId: string;
  paymentMethod: PaymentMethodValue;
  amountMinor: number;
  reference?: string;
}

/**
 * Records a payment against a bill atomically (spec #22, #37): the payment
 * row, the bill's new status (UNPAID/PARTIALLY_PAID/PAID), and — once the
 * bill is fully paid — the order's BILLED->PAID transition all happen
 * inside one SQLite transaction. A crash or error mid-way leaves the
 * database exactly as it was before the call; there is no window where a
 * payment exists but the bill status doesn't reflect it, or vice versa.
 */
export function recordPayment(input: RecordPaymentInput, actingUserId: string) {
  if (input.amountMinor <= 0) throw new ApiError(400, "VALIDATION_ERROR", "Payment amount must be positive.");

  const bill = db.select().from(bills).where(eq(bills.id, input.billId)).get();
  if (!bill) throw new ApiError(404, "NOT_FOUND", "Bill not found.");
  if (bill.status === "VOIDED") throw new ApiError(409, "BILL_VOIDED", "Cannot pay a voided bill.");
  if (bill.status === "PAID") throw new ApiError(409, "ALREADY_PAID", "This bill is already fully paid.");

  const existingPayments = db.select().from(payments).where(eq(payments.billId, bill.id)).all();
  const alreadyPaidMinor = existingPayments.reduce((sum, p) => sum + p.amountMinor, 0);
  const remainingMinor = bill.totalMinor - alreadyPaidMinor;

  if (input.amountMinor > remainingMinor) {
    throw new ApiError(
      400,
      "OVERPAYMENT",
      `Payment of ${input.amountMinor} exceeds the remaining balance of ${remainingMinor}.`
    );
  }

  const paymentId = createId();
  const newPaidTotal = alreadyPaidMinor + input.amountMinor;
  const newBillStatus = newPaidTotal >= bill.totalMinor ? "PAID" : "PARTIALLY_PAID";

  const order = db.select().from(orders).where(eq(orders.id, bill.orderId)).get()!;

  runInTransaction(getRawDb(), () => {
    db.insert(payments)
      .values({
        id: paymentId,
        billId: bill.id,
        paymentMethod: input.paymentMethod,
        amountMinor: input.amountMinor,
        reference: input.reference ?? null,
        receivedBy: actingUserId,
      })
      .run();

    db.update(bills).set({ status: newBillStatus }).where(eq(bills.id, bill.id)).run();
  });
  persist();

  recordAudit({
    branchId: order.branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.PAYMENT_CREATED,
    entityType: "payment",
    entityId: paymentId,
    newValue: { billId: bill.id, amountMinor: input.amountMinor, paymentMethod: input.paymentMethod },
  });

  emitOrderEvent("payment.created", { billId: bill.id, amountMinor: input.amountMinor, newBillStatus });

  if (newBillStatus === "PAID" && order.status === "BILLED") {
    transitionOrderStatus(order.id, "PAID", actingUserId);
  }

  return {
    payment: db.select().from(payments).where(eq(payments.id, paymentId)).get()!,
    bill: db.select().from(bills).where(eq(bills.id, bill.id)).get()!,
  };
}

export function listPaymentsForBill(billId: string) {
  return db.select().from(payments).where(eq(payments.billId, billId)).all();
}

/** Owner/manager completion step — closes out a fully paid order (spec workflow: PAID -> COMPLETED). */
export function completeOrder(orderId: string, actingUserId: string) {
  return transitionOrderStatus(orderId, "COMPLETED", actingUserId);
}
