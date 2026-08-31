import { eq, desc } from "drizzle-orm";
import { db } from "../../infra/db/client";
import { auditLogs } from "../../infra/db/schema";

/**
 * Read-only by construction: this module exposes no update/delete
 * function for audit_logs anywhere, and no route in the API layer offers
 * one either (spec #28 — "Do not allow ordinary users to modify or delete
 * audit records").
 */
export function listAuditLogs(branchId: string, limit = 200) {
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.branchId, branchId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .all();
}

export function listAuditLogsForEntity(branchId: string, entityType: string, entityId: string) {
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.branchId, branchId))
    .orderBy(desc(auditLogs.createdAt))
    .all()
    .filter((row) => row.entityType === entityType && row.entityId === entityId);
}
