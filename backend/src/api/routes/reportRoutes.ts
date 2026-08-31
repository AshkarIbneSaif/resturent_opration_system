import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth";
import { PERMISSIONS } from "../../domain/identity/permissions";
import * as reports from "../../domain/reports/reportService";

export const reportRoutes = Router();
reportRoutes.use(authenticate);

const RangeSchema = z.object({
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
});

function parseRange(query: unknown) {
  const parsed = RangeSchema.parse(query);
  return { fromEpochSeconds: parsed.from, toEpochSeconds: parsed.to };
}

reportRoutes.get("/sales", requirePermission(PERMISSIONS.REPORT_SALES), (req, res) => {
  res.json(reports.salesReport(req.session!.branchId, parseRange(req.query)));
});

reportRoutes.get("/product-performance", requirePermission(PERMISSIONS.REPORT_PERFORMANCE), (req, res) => {
  res.json(reports.productPerformanceReport(req.session!.branchId, parseRange(req.query)));
});

reportRoutes.get("/waiter-performance", requirePermission(PERMISSIONS.REPORT_PERFORMANCE), (req, res) => {
  res.json(reports.waiterPerformanceReport(req.session!.branchId, parseRange(req.query)));
});

reportRoutes.get("/order-statistics", requirePermission(PERMISSIONS.REPORT_OPERATIONAL), (req, res) => {
  res.json(reports.orderStatisticsReport(req.session!.branchId, parseRange(req.query)));
});
