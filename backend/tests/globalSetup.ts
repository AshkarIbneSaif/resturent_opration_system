import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const testDbPath = path.join(__dirname, "test.db");

/**
 * Vitest's globalSetup runs in a separate process from the actual test
 * files, so initializing the sql.js in-memory `db` here would be invisible
 * to the tests (each test file gets its own isolated module registry).
 * Instead, this prepares the ON-DISK database file once, in a real
 * subprocess, before any test file runs. Each test file then loads that
 * already-migrated-and-seeded file into its own memory via
 * tests/setupPerFile.ts (registered as `setupFiles`, which DOES run in
 * the same context as the test file).
 */
export async function setup() {
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  process.env.DATABASE_URL = `file:${testDbPath}`;
  process.env.AUTH_SECRET = "test-secret-at-least-16-chars";
  process.env.CRITICAL_ACTION_PASSPHRASE = "test-critical-pass";
  process.env.APP_ENV = "test";
  process.env.OWNER_BOOTSTRAP_PASSWORD = "Owner123!";

  const backendRoot = path.join(__dirname, "..");
  execFileSync("npx", ["tsx", "src/infra/db/migrate.ts"], { cwd: backendRoot, env: process.env, stdio: "inherit" });
  execFileSync("npx", ["tsx", "src/infra/bootstrap.ts"], { cwd: backendRoot, env: process.env, stdio: "inherit" });
}
