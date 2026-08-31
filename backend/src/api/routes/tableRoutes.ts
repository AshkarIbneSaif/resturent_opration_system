import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth";
import { PERMISSIONS } from "../../domain/identity/permissions";
import { listTables, createTable, updateTable, changeTableStatus, TABLE_STATUSES } from "../../domain/tables/tableService";

export const tableRoutes = Router();
tableRoutes.use(authenticate);

tableRoutes.get("/", requirePermission(PERMISSIONS.TABLE_VIEW), (req, res) => {
  res.json(listTables(req.session!.branchId));
});

const CreateTableSchema = z.object({
  tableNumber: z.string().min(1),
  capacity: z.number().int().positive(),
});

tableRoutes.post("/", requirePermission(PERMISSIONS.TABLE_MANAGE), (req, res) => {
  const parsed = CreateTableSchema.parse(req.body);
  const table = createTable({ branchId: req.session!.branchId, ...parsed }, req.session!.userId);
  res.status(201).json(table);
});

const UpdateTableSchema = z.object({
  capacity: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

tableRoutes.patch("/:id", requirePermission(PERMISSIONS.TABLE_MANAGE), (req, res) => {
  const parsed = UpdateTableSchema.parse(req.body);
  res.json(updateTable(String(req.params.id), parsed, req.session!.userId));
});

const StatusSchema = z.object({ status: z.enum(TABLE_STATUSES) });

tableRoutes.post("/:id/status", requirePermission(PERMISSIONS.TABLE_VIEW), (req, res) => {
  const { status } = StatusSchema.parse(req.body);
  res.json(changeTableStatus(String(req.params.id), status, req.session!.userId));
});
