import { db } from "../../infra/db/client";
import { auditLogs } from "../../infra/db/schema";
import { createId } from "../shared/id";
import type { AuditAction } from "./actions";

export interface RecordAuditParams {
  branchId: string;
  userId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
}

/**
 * Append-only audit trail. There is no update/delete exposed for audit_logs
 * anywhere in the API — ordinary users, and even Owner-level endpoints,
 * cannot modify or remove audit history (spec #28).
 */
export function recordAudit(params: RecordAuditParams) {
  db.insert(auditLogs)
    .values({
      id: createId(),
      branchId: params.branchId,
      userId: params.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      oldValueJson: params.oldValue !== undefined ? JSON.stringify(params.oldValue) : null,
      newValueJson: params.newValue !== undefined ? JSON.stringify(params.newValue) : null,
      ipAddress: params.ipAddress ?? null,
    })
    .run();
}
