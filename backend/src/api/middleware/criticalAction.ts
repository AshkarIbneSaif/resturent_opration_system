import { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";

/**
 * Critical actions (restaurant identity, owner account changes, backup
 * restore, historical financial corrections — spec #5, #7) require a
 * second confirmation value in the request body: `criticalConfirmation`.
 * MVP-safe assumption (OPEN_QUESTIONS.md doesn't specify the exact
 * mechanism): a shared critical-action passphrase distinct from the login
 * password. Swap for a per-owner re-auth or 2FA step later without
 * touching call sites — they only depend on this middleware.
 */
export function requireCriticalConfirmation(req: Request, res: Response, next: NextFunction) {
  const provided = req.body?.criticalConfirmation;
  if (!provided || provided !== env.CRITICAL_ACTION_PASSPHRASE) {
    return res.status(403).json({
      error: {
        code: "CRITICAL_CONFIRMATION_REQUIRED",
        message: "This action requires critical-action confirmation.",
      },
    });
  }
  next();
}
