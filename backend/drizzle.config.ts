import type { Config } from "drizzle-kit";

export default {
  schema: "./src/infra/db/schema.ts",
  out: "./src/infra/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_URL?.replace("file:", "") || "./dev.db",
  },
} satisfies Config;
