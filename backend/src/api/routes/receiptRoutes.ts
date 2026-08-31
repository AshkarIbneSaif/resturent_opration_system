import { Router } from "express";
import { authenticate, requirePermission } from "../middleware/auth";
import { PERMISSIONS } from "../../domain/identity/permissions";
import { buildReceiptData, buildKitchenReceiptData } from "../../domain/receipts/receiptDataService";
import { renderCustomerReceiptText, renderKitchenReceiptText } from "../../domain/receipts/receiptTemplate";

export const receiptRoutes = Router();
receiptRoutes.use(authenticate);

/**
 * Returns the normalized receipt data object (not the rendered text) —
 * useful for a frontend that wants to render its own on-screen preview
 * before printing.
 */
receiptRoutes.get("/customer/:orderId/data", requirePermission(PERMISSIONS.BILL_VIEW), (req, res) => {
  res.json(buildReceiptData(String(req.params.orderId)));
});

receiptRoutes.get("/customer/:orderId/text", requirePermission(PERMISSIONS.BILL_VIEW), (req, res) => {
  const data = buildReceiptData(String(req.params.orderId));
  res.type("text/plain").send(renderCustomerReceiptText(data));
});

receiptRoutes.get("/kitchen/:orderId/text", requirePermission(PERMISSIONS.KITCHEN_VIEW), (req, res) => {
  const data = buildKitchenReceiptData(String(req.params.orderId));
  res.type("text/plain").send(renderKitchenReceiptText(data));
});

/**
 * NOT IMPLEMENTED: actual 80mm thermal printer output (ESC/POS byte stream
 * over USB/network/Bluetooth). There is no printer hardware in this
 * environment to test against, and RECEIPT_SPEC.md explicitly withholds
 * exact printer models (OPEN_QUESTIONS.md "Hardware" section). The
 * Renderer stage is intentionally left as the integration point: swap this
 * route's response (plain text) for an ESC/POS command buffer once a
 * target printer model is chosen, without touching receiptDataService or
 * receiptTemplate.
 */
