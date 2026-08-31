import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, initDb, persist } from "./db/client";
import { restaurants, branches, roles, permissions, rolePermissions, users } from "./db/schema";
import { createId } from "../domain/shared/id";
import { hashPassword } from "../domain/identity/password";
import { PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from "../domain/identity/permissions";

/**
 * Idempotent bootstrap: seeds permissions, roles, role_permissions, a
 * default restaurant + branch, and one initial OWNER account so a fresh
 * deployment has a way to log in at all. Never hard-codes a production
 * password — reads OWNER_BOOTSTRAP_PASSWORD from the environment, or
 * generates and prints a random one-time password if absent.
 */
export async function bootstrap() {
  // 1. Permissions
  const existingPerms = db.select().from(permissions).all();
  const existingPermKeys = new Set(existingPerms.map((p) => p.key));
  for (const key of Object.values(PERMISSIONS)) {
    if (!existingPermKeys.has(key)) {
      db.insert(permissions).values({ id: createId(), key, description: null }).run();
    }
  }
  const allPerms = db.select().from(permissions).all();
  const permIdByKey = new Map(allPerms.map((p) => [p.key, p.id]));

  // 2. Roles
  const roleNames = Object.keys(DEFAULT_ROLE_PERMISSIONS);
  const existingRoles = db.select().from(roles).all();
  const roleIdByName = new Map(existingRoles.map((r) => [r.name, r.id]));
  for (const name of roleNames) {
    if (!roleIdByName.has(name)) {
      const id = createId();
      db.insert(roles).values({ id, name, description: null }).run();
      roleIdByName.set(name, id);
    }
  }

  // 3. Role -> permission grants
  for (const [roleName, permKeys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const roleId = roleIdByName.get(roleName)!;
    for (const permKey of permKeys) {
      const permissionId = permIdByKey.get(permKey);
      if (!permissionId) continue;
      const already = db
        .select()
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, roleId))
        .all()
        .some((rp) => rp.permissionId === permissionId);
      if (!already) {
        db.insert(rolePermissions).values({ roleId, permissionId }).run();
      }
    }
  }

  // 4. Default restaurant + branch
  let restaurant = db.select().from(restaurants).all()[0];
  if (!restaurant) {
    const id = createId();
    db.insert(restaurants).values({ id, name: "My Restaurant" }).run();
    restaurant = db.select().from(restaurants).where(eq(restaurants.id, id)).get()!;
  }

  let branch = db.select().from(branches).all()[0];
  if (!branch) {
    const id = createId();
    db.insert(branches).values({ id, restaurantId: restaurant.id, name: "Main Branch" }).run();
    branch = db.select().from(branches).where(eq(branches.id, id)).get()!;
  }

  // 5. Initial Owner account
  const ownerRoleId = roleIdByName.get("OWNER")!;
  const existingOwner = db.select().from(users).where(eq(users.roleId, ownerRoleId)).get();
  if (!existingOwner) {
    const password = process.env.OWNER_BOOTSTRAP_PASSWORD || createId();
    const passwordHash = await hashPassword(password);
    db.insert(users)
      .values({
        id: createId(),
        branchId: branch.id,
        username: "owner",
        passwordHash,
        displayName: "Restaurant Owner",
        roleId: ownerRoleId,
        isActive: true,
      })
      .run();
    // eslint-disable-next-line no-console
    console.log("Created initial OWNER account.");
    console.log(`  username: owner`);
    console.log(`  password: ${password}`);
    console.log("Change this password on first login — it is only printed here.");
  } else {
    // eslint-disable-next-line no-console
    console.log("Owner account already exists — skipping.");
  }

  // eslint-disable-next-line no-console
  console.log("Bootstrap complete.");
}

// Only auto-run when executed directly (`tsx src/infra/bootstrap.ts`), not
// when imported by tests or other modules.
if (require.main === module) {
  (async () => {
    await initDb();
    await bootstrap();
    persist();
  })().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Bootstrap failed:", err);
    process.exit(1);
  });
}
