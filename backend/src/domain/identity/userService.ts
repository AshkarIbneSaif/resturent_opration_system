import { eq } from "drizzle-orm";
import { db } from "../../infra/db/client";
import { users, roles } from "../../infra/db/schema";
import { createId } from "../shared/id";
import { hashPassword } from "./password";
import { recordAudit } from "../audit/auditService";
import { AUDIT_ACTIONS } from "../audit/actions";
import { ApiError } from "../../api/middleware/errorHandler";

export interface CreateUserInput {
  branchId: string;
  username: string;
  displayName: string;
  employeeCode?: string;
  roleName: string;
  password: string;
}

function getRoleByName(roleName: string) {
  const role = db.select().from(roles).where(eq(roles.name, roleName)).get();
  if (!role) throw new ApiError(400, "INVALID_ROLE", `Unknown role: ${roleName}`);
  return role;
}

export function listUsers(branchId: string) {
  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      employeeCode: users.employeeCode,
      roleId: users.roleId,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(eq(users.branchId, branchId))
    .all();
}

export async function createUser(input: CreateUserInput, actingUserId: string) {
  const existing = db.select().from(users).where(eq(users.username, input.username)).get();
  if (existing) throw new ApiError(409, "CONFLICT", `Username "${input.username}" is already taken.`);

  const role = getRoleByName(input.roleName);
  const passwordHash = await hashPassword(input.password);
  const id = createId();

  db.insert(users)
    .values({
      id,
      branchId: input.branchId,
      username: input.username,
      passwordHash,
      displayName: input.displayName,
      employeeCode: input.employeeCode ?? null,
      roleId: role.id,
      isActive: true,
    })
    .run();

  recordAudit({
    branchId: input.branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.USER_CREATED,
    entityType: "user",
    entityId: id,
    newValue: { username: input.username, roleName: input.roleName },
  });

  return { id, username: input.username, displayName: input.displayName, roleName: role.name };
}

export function setUserActive(userId: string, isActive: boolean, actingUserId: string) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new ApiError(404, "NOT_FOUND", "User not found.");

  db.update(users).set({ isActive }).where(eq(users.id, userId)).run();

  recordAudit({
    branchId: user.branchId,
    userId: actingUserId,
    action: isActive ? AUDIT_ACTIONS.USER_ENABLED : AUDIT_ACTIONS.USER_DISABLED,
    entityType: "user",
    entityId: userId,
    oldValue: { isActive: user.isActive },
    newValue: { isActive },
  });

  return { id: userId, isActive };
}

export async function resetUserPassword(userId: string, newPassword: string, actingUserId: string) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new ApiError(404, "NOT_FOUND", "User not found.");

  const passwordHash = await hashPassword(newPassword);
  db.update(users).set({ passwordHash }).where(eq(users.id, userId)).run();

  recordAudit({
    branchId: user.branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
    entityType: "user",
    entityId: userId,
  });

  return { id: userId };
}

export function assignRole(userId: string, roleName: string, actingUserId: string) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new ApiError(404, "NOT_FOUND", "User not found.");
  const role = getRoleByName(roleName);

  const oldRole = db.select().from(roles).where(eq(roles.id, user.roleId)).get();

  db.update(users).set({ roleId: role.id }).where(eq(users.id, userId)).run();

  recordAudit({
    branchId: user.branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
    entityType: "user",
    entityId: userId,
    oldValue: { roleName: oldRole?.name },
    newValue: { roleName },
  });

  return { id: userId, roleName };
}
