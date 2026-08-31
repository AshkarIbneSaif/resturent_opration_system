import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";
import fs from "fs";
import path from "path";

/**
 * Uses sql.js (SQLite compiled to WebAssembly) instead of better-sqlite3.
 * This was a deliberate swap: better-sqlite3 requires a native C++ compile
 * step (node-gyp + a system C++ toolchain), which isn't available on every
 * machine out of the box — most commonly Windows without Visual Studio
 * Build Tools installed. sql.js needs no native compilation at all and
 * keeps the same fully synchronous query shape (.all()/.get()/.run()) the
 * rest of this codebase relies on.
 *
 * Trade-off: sql.js runs the whole database in memory and has no native
 * file-backed durability of its own, so this module persists the database
 * to disk manually — see `persist()` below and its call sites. Swapping to
 * PostgreSQL for a real production deployment (see the note in schema.ts)
 * replaces this file entirely with a real server connection either way, so
 * this trade-off only affects local/dev/single-machine use, which is what
 * this driver was documented for from the start.
 */

const dbUrl = process.env.DATABASE_URL || "file:./dev.db";
const filePath = dbUrl.replace(/^file:/, "");
const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

let rawDb: SqlJsDatabase;
let SQL: SqlJsStatic;
export let db: ReturnType<typeof drizzle>;

/**
 * Must be awaited exactly once, before any request or script touches
 * `db`. Loads the on-disk file into memory if it exists, or starts a
 * fresh empty database otherwise.
 */
export async function initDb(): Promise<void> {
  SQL = await initSqlJs();
  if (fs.existsSync(resolvedPath)) {
    const fileBuffer = fs.readFileSync(resolvedPath);
    rawDb = new SQL.Database(fileBuffer);
  } else {
    rawDb = new SQL.Database();
  }
  rawDb.exec("PRAGMA foreign_keys = ON");
  db = drizzle(rawDb);
}

/** Writes the current in-memory database out to disk. Call after any mutation. */
export function persist(): void {
  const data = rawDb.export();
  fs.writeFileSync(resolvedPath, Buffer.from(data));
}

/** Exposes the raw sql.js Database for transactions/raw SQL (see transaction.ts, counterService.ts). */
export function getRawDb(): SqlJsDatabase {
  return rawDb;
}

/** Absolute path of the on-disk database file (see backupService.ts for the safety-snapshot use). */
export function getDbFilePath(): string {
  return resolvedPath;
}

/**
 * Opens `buffer` as a standalone sql.js Database WITHOUT touching the live
 * `rawDb`/`db` module state. Used by backupService to validate a candidate
 * restore file (parse it, sanity-check its schema) before anything is
 * committed — an invalid or corrupt upload must never have a chance to
 * clobber the live database. Throws if the bytes aren't a readable SQLite
 * file. Caller is responsible for `.close()`-ing the returned handle if it
 * doesn't end up calling replaceDatabase() with it.
 */
export function openDatabaseFromBuffer(buffer: Buffer): SqlJsDatabase {
  return new SQL.Database(buffer);
}

/**
 * Swaps the live database for an already-validated handle (see
 * backupService.importDatabase). The previous in-memory database is
 * closed; everything after this call — including every other request in
 * flight — reads/writes through the new one. Does NOT persist to disk by
 * itself; call persist() afterwards.
 */
export function replaceDatabase(newRawDb: SqlJsDatabase): void {
  const previous = rawDb;
  rawDb = newRawDb;
  rawDb.exec("PRAGMA foreign_keys = ON");
  db = drizzle(rawDb);
  try {
    previous?.close();
  } catch {
    // best-effort — the old handle being unclosable doesn't affect the new one
  }
}

/** Full binary snapshot of the live database (raw SQLite bytes) — see backupService.exportDatabase. */
export function exportDatabaseBuffer(): Buffer {
  return Buffer.from(rawDb.export());
}
