import "dotenv/config";
import { migrate } from "drizzle-orm/sql-js/migrator";
import { db, initDb, persist } from "./client";

async function main() {
  await initDb();
  migrate(db, { migrationsFolder: "./src/infra/db/migrations" });
  persist();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
