import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, initDb, persist } from "./db/client";
import { branches, categories, menuItems, restaurantTables, roles, users } from "./db/schema";
import { createId } from "../domain/shared/id";
import { hashPassword } from "../domain/identity/password";

async function seedDemo() {
  await initDb();
  const branch = db.select().from(branches).all()[0];
  if (!branch) throw new Error("Run bootstrap first.");

  // Tables 01-08
  for (let i = 1; i <= 8; i++) {
    const num = String(i).padStart(2, "0");
    const existing = db
      .select()
      .from(restaurantTables)
      .where(eq(restaurantTables.branchId, branch.id))
      .all()
      .find((t) => t.tableNumber === num);
    if (!existing) {
      db.insert(restaurantTables)
        .values({ id: createId(), branchId: branch.id, tableNumber: num, capacity: i % 2 === 0 ? 4 : 2 })
        .run();
    }
  }

  // Categories + items
  const menu: Record<string, { name: string; priceMinor: number }[]> = {
    Burgers: [
      { name: "Chicken Burger", priceMinor: 25000 },
      { name: "Beef Burger", priceMinor: 32000 },
      { name: "Veg Burger", priceMinor: 20000 },
    ],
    Sides: [
      { name: "French Fries", priceMinor: 8000 },
      { name: "Onion Rings", priceMinor: 9000 },
    ],
    Drinks: [
      { name: "Coke", priceMinor: 6000 },
      { name: "Lemonade", priceMinor: 7000 },
    ],
  };

  for (const [categoryName, items] of Object.entries(menu)) {
    let category = db
      .select()
      .from(categories)
      .where(eq(categories.branchId, branch.id))
      .all()
      .find((c) => c.name === categoryName);
    if (!category) {
      const id = createId();
      db.insert(categories).values({ id, branchId: branch.id, name: categoryName }).run();
      category = db.select().from(categories).where(eq(categories.id, id)).get()!;
    }
    for (const item of items) {
      const existingItem = db
        .select()
        .from(menuItems)
        .where(eq(menuItems.categoryId, category.id))
        .all()
        .find((i) => i.name === item.name);
      if (!existingItem) {
        db.insert(menuItems)
          .values({ id: createId(), categoryId: category.id, name: item.name, basePriceMinor: item.priceMinor })
          .run();
      }
    }
  }

  // The owner account itself is created by bootstrap.ts with a random,
  // console-printed one-time password (deliberately — bootstrap never
  // hardcodes a password, since it's meant to run in production too).
  // seedDemo, on the other hand, is explicitly a demo/test-environment
  // script whose whole point is predictable known logins for every role
  // — it already does this for manager/waiter/kitchen/cashier/takeout
  // below. Resetting the owner's password here to match what this script
  // prints keeps that promise consistent instead of silently leaving the
  // owner stuck on a password nobody has anymore.
  const ownerRole = db.select().from(roles).where(eq(roles.name, "OWNER")).get();
  if (ownerRole) {
    const ownerUser = db.select().from(users).where(eq(users.roleId, ownerRole.id)).get();
    if (ownerUser) {
      const ownerPasswordHash = await hashPassword("Owner123!");
      db.update(users).set({ passwordHash: ownerPasswordHash }).where(eq(users.id, ownerUser.id)).run();
    }
  }

  // Demo staff accounts (one per role) so every interface is reachable
  const demoAccounts: { username: string; displayName: string; roleName: string; password: string }[] = [
    { username: "manager", displayName: "Manager Demo", roleName: "MANAGER", password: "Manager123!" },
    { username: "waiter", displayName: "Waiter W-014", roleName: "WAITER", password: "Waiter123!" },
    { username: "kitchen", displayName: "Kitchen Demo", roleName: "KITCHEN", password: "Kitchen123!" },
    { username: "cashier", displayName: "Cashier Demo", roleName: "CASHIER", password: "Cashier123!" },
    { username: "takeout", displayName: "Takeout Demo", roleName: "TAKEOUT", password: "Takeout123!" },
  ];

  for (const acc of demoAccounts) {
    const existing = db.select().from(users).where(eq(users.username, acc.username)).get();
    if (existing) continue;
    const role = db.select().from(roles).where(eq(roles.name, acc.roleName)).get();
    if (!role) continue;
    const passwordHash = await hashPassword(acc.password);
    db.insert(users)
      .values({
        id: createId(),
        branchId: branch.id,
        username: acc.username,
        passwordHash,
        displayName: acc.displayName,
        roleId: role.id,
        isActive: true,
      })
      .run();
  }

  console.log("Demo data seeded.");
  console.log("Login as: owner/Owner123!, manager/Manager123!, waiter/Waiter123!, kitchen/Kitchen123!, cashier/Cashier123!, takeout/Takeout123!");
}

seedDemo()
  .then(() => {
    persist();
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
