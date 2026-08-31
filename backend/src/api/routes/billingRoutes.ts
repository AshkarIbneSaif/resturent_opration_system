import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth";
import { PERMISSIONS } from "../../domain/identity/permissions";
import { generateBill, getBillForOrder } from "../../domain/billing/billingService";
import { recordPayment, listPaymentsForBill, completeOrder } from "../../domain/billing/paymentService";
import { PAYMENT_METHODS } from "../../infra/db/schema";

export const billingRoutes = Router();
billingRoutes.use(authenticate);

const GenerateBillSchema = z.object({
  orderId: z.string(),
  discountMinor: z.number().int().nonnegative().optional(),
  taxMinor: z.number().int().nonnegative().optional(),
  serviceChargeMinor: z.number().int().nonnegative().optional(),
  discountReason: z.string().trim().min(1).max(300).optional(),
  offerId: z.string().optional(),
});

billingRoutes.post("/bills", requirePermission(PERMISSIONS.BILL_CREATE), (req, res) => {
  const parsed = GenerateBillSchema.parse(req.body);
  // Discount requires its own permission distinct from bill.create (spec:
  // "Cashier can apply permitted discounts" implies discount is gated).
  if (parsed.discountMinor && !req.session!.permissions.includes(PERMISSIONS.DISCOUNT_APPLY)) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "Missing permission: discount.apply" } });
  }
  // Every ad-hoc discount needs a note explaining why — this is an open
  // amount left entirely to the cashier's judgement (product decision),
  // so the note is the only paper trail an Owner reviewing the audit log
  // gets. Not required when the discount comes from a pre-defined Offer,
  // since the Offer's own name/reason already documents it.
  if (parsed.discountMinor && !parsed.offerId && !parsed.discountReason) {
    return res.status(400).json({
      error: { code: "DISCOUNT_REASON_REQUIRED", message: "A short note is required whenever a discount is applied." },
    });
  }
  res.status(201).json(generateBill(parsed, req.session!.userId));
});

billingRoutes.get("/bills/by-order/:orderId", requirePermission(PERMISSIONS.BILL_VIEW), (req, res) => {
  res.json(getBillForOrder(String(req.params.orderId)));
});

const RecordPaymentSchema = z.object({
  billId: z.string(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  amountMinor: z.number().int().positive(),
  reference: z.string().optional(),
});

billingRoutes.post("/payments", requirePermission(PERMISSIONS.PAYMENT_CREATE), (req, res) => {
  const parsed = RecordPaymentSchema.parse(req.body);
  res.status(201).json(recordPayment(parsed, req.session!.userId));
});

billingRoutes.get("/bills/:billId/payments", requirePermission(PERMISSIONS.PAYMENT_VIEW), (req, res) => {
  res.json(listPaymentsForBill(String(req.params.billId)));
});

billingRoutes.post("/orders/:orderId/complete", requirePermission(PERMISSIONS.BILL_VIEW), (req, res) => {
  res.json(completeOrder(String(req.params.orderId), req.session!.userId));
});
