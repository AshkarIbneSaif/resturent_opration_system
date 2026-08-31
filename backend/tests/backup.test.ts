import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();

async function loginAs(username: string, password: string) {
  const res = await request(app).post("/auth/login").send({ username, password });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

let ownerToken: string;
let waiterToken: string;

beforeAll(async () => {
  ownerToken = await loginAs("owner", "Owner123!");

  await request(app)
    .post("/users")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ username: "backup_waiter", displayName: "Backup Waiter", roleName: "WAITER", password: "WaiterPass1!" });
  waiterToken = await loginAs("backup_waiter", "WaiterPass1!");
});

describe("Backup export", () => {
  it("blocks a waiter from exporting (backup.restore required)", async () => {
    const res = await request(app).get("/backup/export").set("Authorization", `Bearer ${waiterToken}`);
    expect(res.status).toBe(403);
  });

  it("lets the owner export the full database as base64 SQLite bytes", async () => {
    const res = await request(app).get("/backup/export").set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.filename).toMatch(/\.sqlite$/);
    expect(res.body.sizeBytes).toBeGreaterThan(0);
    expect(typeof res.body.data).toBe("string");

    const decoded = Buffer.from(res.body.data, "base64");
    expect(decoded.toString("utf8", 0, 16)).toBe("SQLite format 3\u0000");
  });

  it("records a DATABASE_EXPORTED audit entry", async () => {
    const res = await request(app)
      .get("/audit")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((e: any) => e.action === "DATABASE_EXPORTED")).toBe(true);
  });
});

describe("Backup import", () => {
  it("rejects import without critical confirmation", async () => {
    const res = await request(app)
      .post("/backup/import")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ data: "not-real-data" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CRITICAL_CONFIRMATION_REQUIRED");
  });

  it("blocks a waiter from importing (backup.restore required)", async () => {
    const res = await request(app)
      .post("/backup/import")
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({ data: "not-real-data", criticalConfirmation: "test-critical-pass" });
    expect(res.status).toBe(403);
  });

  it("rejects a non-SQLite payload as an invalid backup file", async () => {
    const res = await request(app)
      .post("/backup/import")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ data: Buffer.from("not a real database").toString("base64"), criticalConfirmation: "test-critical-pass" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_BACKUP_FILE");
  });

  it("rejects a well-formed but ROS-schema-less SQLite file", async () => {
    // A minimal, genuinely-valid empty SQLite file header followed by
    // nothing resembling ROS's schema — must be rejected by the
    // core-table check, not just the magic-byte check.
    const initSqlJs = (await import("sql.js")).default;
    const SQL = await initSqlJs();
    const emptyDb = new SQL.Database();
    emptyDb.run("CREATE TABLE unrelated_thing (id INTEGER)");
    const bytes = Buffer.from(emptyDb.export());
    emptyDb.close();

    const res = await request(app)
      .post("/backup/import")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ data: bytes.toString("base64"), criticalConfirmation: "test-critical-pass" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_BACKUP_FILE");
    expect(res.body.error.message).toMatch(/missing tables/i);
  });

  it("round-trips: export, mutate, restore, and the mutation is gone", async () => {
    const exportRes = await request(app).get("/backup/export").set("Authorization", `Bearer ${ownerToken}`);
    expect(exportRes.status).toBe(200);
    const snapshot: string = exportRes.body.data;

    const createTableRes = await request(app)
      .post("/tables")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tableNumber: "99", capacity: 2 });
    expect(createTableRes.status).toBe(201);

    const beforeRestore = await request(app).get("/tables").set("Authorization", `Bearer ${ownerToken}`);
    expect(beforeRestore.body.some((t: any) => t.tableNumber === "99")).toBe(true);

    const importRes = await request(app)
      .post("/backup/import")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ data: snapshot, criticalConfirmation: "test-critical-pass" });
    expect(importRes.status).toBe(200);
    expect(importRes.body.restoredAt).toBeGreaterThan(0);
    expect(importRes.body.tables).toHaveProperty("restaurants");
    expect(importRes.body.tables).toHaveProperty("orders");

    // The owner's own session token must still work — the snapshot was
    // taken while this owner account already existed.
    const afterRestore = await request(app).get("/tables").set("Authorization", `Bearer ${ownerToken}`);
    expect(afterRestore.status).toBe(200);
    expect(afterRestore.body.some((t: any) => t.tableNumber === "99")).toBe(false);
  });
});
