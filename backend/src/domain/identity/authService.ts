import { eq, and } from "drizzle-orm";
import { db } from "../../infra/db/client";
import { users, roles, rolePermissions, permissions, loginEvents } from "../../infra/db/schema";
import { verifyPassword } from "./password";
import { signSessionToken } from "./token";
import { createId } from "../shared/id";
import { recordAudit } from "../audit/auditService";
import { AUDIT_ACTIONS } from "../audit/actions";

export class AuthError extends Error {
  constructor(message: string, public code: "NOT_FOUND" | "BAD_PASSWORD" | "INACTIVE") {
    super(message);
  }
}

export interface LoginResult {
  token: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    roleName: string;
    branchId: string;
  };
  permissions: string[];
}

/** Loads the resolved set of permission keys granted to a role (FR-002). */
export function getPermissionsForRole(roleId: string): string[] {
  const rows = db
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, roleId))
    .all();
  return rows.map((r) => r.key);
}

/**
 * Login flow. Always records a login_events row (FR-004), even on failure,
 * and raises an audit event on success/failure so login activity is
 * traceable independent of the operational login_events log.
 */
export async function login(
  username: string,
  plainPassword: string,
  ipAddress?: string
): Promise<LoginResult> {
  const user = db.select().from(users).where(eq(users.username, username)).get();

  if (!user) {
    db.insert(loginEvents)
      .values({ id: createId(), usernameAttempted: username, success: false, reason: "not_found", ipAddress })
      .run();
    throw new AuthError("Invalid username or password.", "NOT_FOUND");
  }

  if (!user.isActive) {
    db.insert(loginEvents)
      .values({
        id: createId(),
        userId: user.id,
        usernameAttempted: username,
        success: false,
        reason: "inactive_user",
        ipAddress,
      })
      .run();
    recordAudit({
      branchId: user.branchId,
      userId: user.id,
      action: AUDIT_ACTIONS.USER_LOGIN_FAILED,
      entityType: "user",
      entityId: user.id,
      newValue: { reason: "inactive_user" },
      ipAddress,
    });
    throw new AuthError("This account is inactive.", "INACTIVE");
  }

  const passwordOk = await verifyPassword(plainPassword, user.passwordHash);
  if (!passwordOk) {
    db.insert(loginEvents)
      .values({
        id: createId(),
        userId: user.id,
        usernameAttempted: username,
        success: false,
        reason: "bad_password",
        ipAddress,
      })
      .run();
    recordAudit({
      branchId: user.branchId,
      userId: user.id,
      action: AUDIT_ACTIONS.USER_LOGIN_FAILED,
      entityType: "user",
      entityId: user.id,
      newValue: { reason: "bad_password" },
      ipAddress,
    });
    throw new AuthError("Invalid username or password.", "BAD_PASSWORD");
  }

  const role = db.select().from(roles).where(eq(roles.id, user.roleId)).get();
  if (!role) throw new AuthError("User role misconfigured.", "NOT_FOUND");

  const grantedPermissions = getPermissionsForRole(role.id);

  db.update(users)
    .set({ lastLoginAt: Math.floor(Date.now() / 1000) })
    .where(eq(users.id, user.id))
    .run();

  db.insert(loginEvents)
    .values({ id: createId(), userId: user.id, usernameAttempted: username, success: true, reason: "ok", ipAddress })
    .run();

  recordAudit({
    branchId: user.branchId,
    userId: user.id,
    action: AUDIT_ACTIONS.USER_LOGIN_SUCCESS,
    entityType: "user",
    entityId: user.id,
    ipAddress,
  });

  const token = signSessionToken({
    userId: user.id,
    branchId: user.branchId,
    roleId: role.id,
    roleName: role.name,
    permissions: grantedPermissions,
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      roleName: role.name,
      branchId: user.branchId,
    },
    permissions: grantedPermissions,
  };
}
