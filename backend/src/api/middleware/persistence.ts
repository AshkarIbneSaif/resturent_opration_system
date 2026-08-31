import { Request, Response, NextFunction } from "express";
import { persist } from "../../infra/db/client";

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/**
 * sql.js keeps the whole database in memory (see the note in
 * infra/db/client.ts on why — it trades that for needing zero native
 * compilation). This middleware is the general-purpose durability
 * backstop: after any request that could have written data finishes
 * successfully, flush the in-memory database to disk. Individual services
 * that need a stronger guarantee inside their own transaction (see
 * counterService.ts, paymentService.ts) call persist() directly too —
 * this is a safety net for everything else, not a replacement for those.
 */
export function persistenceMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!MUTATING_METHODS.has(req.method)) return next();

  res.on("finish", () => {
    if (res.statusCode < 400) {
      try {
        persist();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[persistence] failed to flush database to disk:", err);
      }
    }
  });

  next();
}
