import type { Database as SqlJsDatabase } from "sql.js";

/**
 * sql.js has no `.transaction()` sugar like better-sqlite3 did, so this
 * provides the same guarantee manually: BEGIN, run the callback, COMMIT —
 * or ROLLBACK and rethrow on any error. None of this codebase nests
 * transactions, so nested BEGINs are not handled.
 */
export function runInTransaction<T>(rawDb: SqlJsDatabase, fn: () => T): T {
  rawDb.exec("BEGIN");
  try {
    const result = fn();
    rawDb.exec("COMMIT");
    return result;
  } catch (err) {
    rawDb.exec("ROLLBACK");
    throw err;
  }
}
