import { Request, Response, NextFunction } from "express";
import { verifySessionToken, SessionTokenPayload } from "../../domain/identity/token";
import { eq } from "drizzle-orm";
import { db } from "../../infra/db/client";
import { users } from "../../infra/db/schema";
import type { PermissionKey } from "../../domain/identity/permissions";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionTokenPayload;
    }
  }
}

/**
 * Verifies the bearer token AND re-checks the user is still active on every
 * request — a token issued before a user was disabled must stop working
 * immediately, not just at next login (FR-003).
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Missing bearer token." } });
  }
  try {
    const payload = verifySessionToken(header.slice("Bearer ".length));
    const user = db.select().from(users).where(eq(users.id, payload.userId)).get();
    if (!user || !user.isActive) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Session no longer valid." } });
    }
    req.session = payload;
    next();
  } catch {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Invalid or expired token." } });
  }
}

/**
 * Server-side permission check (spec #3: "Never rely only on frontend route
 * hiding for security"). Every protected route lists the exact permission
 * key(s) it needs — checked against the token's resolved permission set,
 * which was itself resolved server-side at login time from role_permissions.
 */
export function requirePermission(...required: PermissionKey[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Not authenticated." } });
    }
    const granted = new Set(req.session.permissions);
    const missing = required.filter((p) => !granted.has(p));
    if (missing.length > 0) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "Insufficient permissions.", missing },
      });
    }
    next();
  };
}
