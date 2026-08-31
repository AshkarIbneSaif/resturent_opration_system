import fs from "fs";
import path from "path";
import {
  db,
  getRawDb,
  getDbFilePath,
  persist,
  exportDatabaseBuffer,
  openDatabaseFromBuffer,
  replaceDatabase,
} from "../../infra/db/client";
import { restaurants } from "../../infra/db/schema";
import { recordAudit } from "../audit/auditService";
import { AUDIT_ACTIONS } from "../audit/actions";
import { ApiError } from "../../api/middleware/errorHandler";

/**
 * Full-database backup/restore (README "Known scope gaps" — backup/restore
 * was previously unimplemented; permissions.BACKUP_RESTORE and
 * AUDIT_ACTIONS.DATABASE_RESTORED already existed as reserved hooks for
 * this).
 *
 * DESIGN: this exports/imports the entire raw SQLite file (the same bytes
 * `persist()` already writes to dev.db), not a hand-rolled JSON dump of
 * every table. That's a deliberate choice:
 *  - It's byte-for-byte exact — every table, every FK, every index, every
 *    password hash — with zero risk of a JSON round-trip silently coercing
 *    a boolean, dropping a column added later, or reordering an insert in
 *    a way that trips a foreign key.
 *  - It reuses the exact read/write path this backend already trusts
 *    (sql.js's own export()/Database() — see infra/db/client.ts), instead
 *    of a second, parallel serialization format that has to be kept in
 *    sync with schema.ts by hand forever.
 *  - Restoring to a fresh PostgreSQL deployment (see schema.ts) is a
 *    separate migration problem either way — a JSON export wouldn't have
 *    made that path any easier.
 *
 * The trade-off is the same one already accepted for sql.js generally
 * (README "Known scope gaps"): this is a whole-database swap, not a
 * per-table merge, and it only really makes sense for same-deployment
 * backup/restore — not for merging two independently-operated branches'
 * data together.
 */

const SQLITE_HEADER = "SQLite format 3\u0000";

// A handful of core tables that must exist for a file to plausibly be an
// ROS backup at all. Not an exhaustive schema check (drizzle-kit migrations
// own that) — just enough to reject an empty/unrelated/corrupted upload
// before it ever touches the live database.
const CORE_TABLES = ["restaurants", "branches", "roles", "permissions", "users", "orders", "menu_items"] as const;

// Tables surfaced in the import summary so an owner can eyeball that a
// restore "looks right" (row counts) without having to open the file.
const SUMMARY_TABLES = [
  "restaurants",
  "branches",
  "users",
  "restaurant_tables",
  "menu_items",
  "orders",
  "bills",
  "payments",
  "customers",
  "audit_logs",
] as const;

export interface ExportResult {
  filename: string;
  sizeBytes: number;
  exportedAt: number;
  /** Base64-encoded raw SQLite file bytes. */
  data: string;
}

export function exportDatabase(branchId: string, userId: string, ipAddress?: string | null): ExportResult {
  // Guarantees the export reflects every write made so far, even ones a
  // caller made outside a request (e.g. a script) that hasn't hit the
  // persistence middleware yet.
  persist();

  const buffer = exportDatabaseBuffer();
  const restaurant = db.select().from(restaurants).get();
  const exportedAt = Math.floor(Date.now() / 1000);
  const slug = (restaurant?.name ?? "restaurant").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const filename = `ros-backup-${slug || "restaurant"}-${exportedAt}.sqlite`;

  recordAudit({
    branchId,
    userId,
    action: AUDIT_ACTIONS.DATABASE_EXPORTED,
    entityType: "database",
    ipAddress,
  });

  return { filename, sizeBytes: buffer.byteLength, exportedAt, data: buffer.toString("base64") };
}

export interface ImportSummary {
  restoredAt: number;
  tables: Record<string, number>;
}

export function importDatabase(
  base64Data: string,
  branchId: string,
  userId: string,
  ipAddress?: string | null
): ImportSummary {
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Data, "base64");
  } catch {
    throw new ApiError(400, "INVALID_BACKUP_FILE", "Could not decode the uploaded backup data.");
  }

  if (buffer.length < 16 || buffer.toString("utf8", 0, 16) !== SQLITE_HEADER) {
    throw new ApiError(400, "INVALID_BACKUP_FILE", "This doesn't look like a valid ROS backup (.sqlite) file.");
  }

  // Open and sanity-check the candidate database WITHOUT touching the live
  // one — an invalid or corrupt upload must never get a chance to clobber
  // real data. Only after every check below passes do we commit the swap.
  let candidate;
  try {
    candidate = openDatabaseFromBuffer(buffer);
  } catch {
    throw new ApiError(400, "INVALID_BACKUP_FILE", "The backup file could not be opened — it may be corrupted.");
  }

  let tableNames: Set<string>;
  try {
    const result = candidate.exec("SELECT name FROM sqlite_master WHERE type='table'");
    tableNames = new Set((result[0]?.values ?? []).map((row) => String(row[0])));
  } catch {
    candidate.close();
    throw new ApiError(400, "INVALID_BACKUP_FILE", "The backup file's schema could not be read.");
  }

  const missing = CORE_TABLES.filter((t) => !tableNames.has(t));
  if (missing.length > 0) {
    candidate.close();
    throw new ApiError(
      400,
      "INVALID_BACKUP_FILE",
      `This file is missing tables ROS expects (${missing.join(", ")}) — refusing to restore.`
    );
  }

  // Safety net: snapshot the CURRENT live file before it gets overwritten,
  // so a bad or unwanted restore can still be recovered from disk by
  // whoever has server access. Not exposed through the API — this is a
  // last-resort backstop, not a browsable backup history feature.
  const filePath = getDbFilePath();
  if (fs.existsSync(filePath)) {
    try {
      const backupDir = path.join(path.dirname(filePath), "backups");
      fs.mkdirSync(backupDir, { recursive: true });
      fs.copyFileSync(filePath, path.join(backupDir, `pre-restore-${Date.now()}.sqlite`));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[backup] failed to write pre-restore safety snapshot (continuing with restore):", err);
    }
  }

  replaceDatabase(candidate);
  persist();

  const rawDb = getRawDb();
  const tables: Record<string, number> = {};
  for (const table of SUMMARY_TABLES) {
    try {
      const result = rawDb.exec(`SELECT COUNT(*) FROM "${table}"`);
      tables[table] = Number(result[0]?.values?.[0]?.[0] ?? 0);
    } catch {
      tables[table] = 0;
    }
  }

  // Best-effort: the restored database may not contain this branchId/userId
  // at all (e.g. restoring a backup from a differently-configured
  // instance) — a failed audit write must not undo an otherwise-successful
  // restore, so this never throws.
  try {
    recordAudit({
      branchId,
      userId,
      action: AUDIT_ACTIONS.DATABASE_RESTORED,
      entityType: "database",
      ipAddress,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[backup] restore succeeded but could not write an audit entry for it:", err);
  }

  return { restoredAt: Math.floor(Date.now() / 1000), tables };
}
