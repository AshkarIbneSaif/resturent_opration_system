import path from "path";

// Runs in the SAME module-registry context as the test file that imports
// it (unlike globalSetup, which runs in an isolated process). This is
// where the in-memory sql.js `db` actually needs to be initialized for
// each test file — the database file itself was already migrated and
// bootstrapped once, by tests/globalSetup.ts, before any test file ran.
process.env.DATABASE_URL ||= `file:${path.join(__dirname, "test.db")}`;
process.env.AUTH_SECRET ||= "test-secret-at-least-16-chars";
process.env.CRITICAL_ACTION_PASSPHRASE ||= "test-critical-pass";
process.env.APP_ENV ||= "test";

const { initDb } = await import("../src/infra/db/client");
await initDb();
