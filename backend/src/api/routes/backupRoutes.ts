import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth";
import { requireCriticalConfirmation } from "../middleware/criticalAction";
import { PERMISSIONS } from "../../domain/identity/permissions";
import * as backupService from "../../domain/backup/backupService";

export const backupRoutes = Router();
backupRoutes.use(authenticate);

/**
 * Returns a JSON envelope (base64 SQLite bytes + metadata) rather than a
 * raw binary stream, matching every other route in this API — the
 * frontend decodes `data` into a Blob client-side to trigger the actual
 * file download (see frontend/src/pages/owner/OwnerDashboard.tsx).
 */
backupRoutes.get("/export", requirePermission(PERMISSIONS.BACKUP_RESTORE), (req, res) => {
  const result = backupService.exportDatabase(req.session!.branchId, req.session!.userId, req.ip);
  res.json(result);
});

const ImportSchema = z.object({
  data: z.string().min(1, "Backup file data is required."),
  criticalConfirmation: z.string(),
});

/**
 * Restoring a backup is a CRITICAL action (permissions.CRITICAL_ACTIONS,
 * same tier as restaurant identity changes) — it can replace every user,
 * order, and password hash in the system, including the account making
 * this very request.
 */
backupRoutes.post(
  "/import",
  requirePermission(PERMISSIONS.BACKUP_RESTORE),
  requireCriticalConfirmation,
  (req, res) => {
    const parsed = ImportSchema.parse(req.body);
    const result = backupService.importDatabase(parsed.data, req.session!.branchId, req.session!.userId, req.ip);
    res.json(result);
  }
);
