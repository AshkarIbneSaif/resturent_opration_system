import { Router } from "express";
import { authenticate, requirePermission } from "../middleware/auth";
import { PERMISSIONS } from "../../domain/identity/permissions";
import { listAuditLogs, listAuditLogsForEntity } from "../../domain/audit/auditQueryService";

export const auditRoutes = Router();
auditRoutes.use(authenticate);

// No POST/PATCH/DELETE routes exist here, deliberately — audit history is
// append-only from the domain layer, and this router offers no way to
// touch it (spec #28).

auditRoutes.get("/", requirePermission(PERMISSIONS.AUDIT_VIEW), (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  res.json(listAuditLogs(req.session!.branchId, limit));
});

auditRoutes.get("/entity/:entityType/:entityId", requirePermission(PERMISSIONS.AUDIT_VIEW), (req, res) => {
  res.json(listAuditLogsForEntity(req.session!.branchId, String(req.params.entityType), String(req.params.entityId)));
});
