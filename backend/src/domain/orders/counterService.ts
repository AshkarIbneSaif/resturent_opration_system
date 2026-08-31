import { getRawDb, persist } from "../../infra/db/client";
import { runInTransaction } from "../../infra/db/transaction";

/**
 * Allocates the next value for a named, branch-scoped counter (e.g.
 * "order_id" -> 10452, "bill_number" -> sequential bill numbers) inside a
 * single SQLite transaction, so concurrent submissions can never receive
 * the same number (spec #14, #37).
 */
export function nextCounterValue(branchId: string, name: string, startAt = 10000): number {
  const rawDb = getRawDb();

  const result = runInTransaction(rawDb, () => {
    const selectStmt = rawDb.prepare(`SELECT value FROM counters WHERE branch_id = ? AND name = ?`);
    const row = selectStmt.getAsObject([branchId, name]) as { value?: number };
    selectStmt.free();

    if (row.value === undefined) {
      const initial = startAt;
      const insertStmt = rawDb.prepare(`INSERT INTO counters (branch_id, name, value) VALUES (?, ?, ?)`);
      insertStmt.run([branchId, name, initial]);
      insertStmt.free();
      return initial;
    }

    const next = row.value + 1;
    const updateStmt = rawDb.prepare(`UPDATE counters SET value = ? WHERE branch_id = ? AND name = ?`);
    updateStmt.run([next, branchId, name]);
    updateStmt.free();
    return next;
  });

  persist();
  return result;
}
