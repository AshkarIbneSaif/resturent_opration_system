import express from "express";
import cors from "cors";
import { authRoutes } from "./api/routes/authRoutes";
import { restaurantRoutes } from "./api/routes/restaurantRoutes";
import { tableRoutes } from "./api/routes/tableRoutes";
import { userRoutes } from "./api/routes/userRoutes";
import { menuRoutes } from "./api/routes/menuRoutes";
import { offerRoutes } from "./api/routes/offerRoutes";
import { orderRoutes } from "./api/routes/orderRoutes";
import { billingRoutes } from "./api/routes/billingRoutes";
import { receiptRoutes } from "./api/routes/receiptRoutes";
import { customerRoutes } from "./api/routes/customerRoutes";
import { reportRoutes } from "./api/routes/reportRoutes";
import { auditRoutes } from "./api/routes/auditRoutes";
import { backupRoutes } from "./api/routes/backupRoutes";
import { errorHandler, notFoundHandler } from "./api/middleware/errorHandler";
import { persistenceMiddleware } from "./api/middleware/persistence";

export function createApp() {
  const app = express();
  app.use(cors());
  // Default express.json() limit is 100kb — fine for every other route,
  // but a full-database export/import travels as base64 JSON (see
  // backupRoutes.ts) and can legitimately be several MB for a restaurant
  // with real order history. Raised here, globally, rather than
  // per-route, since Express applies body parsing before routing runs.
  app.use(express.json({ limit: "100mb" }));
  app.use(persistenceMiddleware);

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/auth", authRoutes);
  app.use("/restaurant", restaurantRoutes);
  app.use("/tables", tableRoutes);
  app.use("/users", userRoutes);
  app.use("/menu", menuRoutes);
  app.use("/", offerRoutes);
  app.use("/orders", orderRoutes);
  app.use("/", billingRoutes);
  app.use("/receipts", receiptRoutes);
  app.use("/customers", customerRoutes);
  app.use("/reports", reportRoutes);
  app.use("/audit", auditRoutes);
  app.use("/backup", backupRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
