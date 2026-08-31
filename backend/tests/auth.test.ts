import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db } from "../src/infra/db/client";
import { users, roles } from "../src/infra/db/schema";
import { hashPassword } from "../src/domain/identity/password";
import { createId } from "../src/domain/shared/id";
import { createApp } from "../src/app";

const app = createApp();

describe("POST /auth/login", () => {
  it("rejects an unknown username with a generic message", async () => {
    const res = await request(app).post("/auth/login").send({ username: "nobody", password: "x" });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("Invalid username or password.");
  });

  it("rejects a correct username with the wrong password", async () => {
    const res = await request(app).post("/auth/login").send({ username: "owner", password: "wrong-pass" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("BAD_PASSWORD");
  });

  it("logs in the bootstrapped owner and returns a resolved permission set", async () => {
    const res = await request(app).post("/auth/login").send({ username: "owner", password: "Owner123!" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.roleName).toBe("OWNER");
    expect(res.body.permissions).toContain("settings.restaurant.update");
    expect(res.body.permissions).toContain("user.create");
  });

  it("blocks an inactive user from logging in (FR-003)", async () => {
    const ownerRole = db.select().from(roles).where(eq(roles.name, "WAITER")).get()!;
    const branch = db.select().from(users).get()!.branchId;
    const passwordHash = await hashPassword("SomePass1!");
    db.insert(users)
      .values({
        id: createId(),
        branchId: branch,
        username: "disabled_waiter",
        passwordHash,
        displayName: "Disabled Waiter",
        roleId: ownerRole.id,
        isActive: false,
      })
      .run();

    const res = await request(app).post("/auth/login").send({ username: "disabled_waiter", password: "SomePass1!" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INACTIVE");
  });

  it("rejects malformed request bodies", async () => {
    const res = await request(app).post("/auth/login").send({ username: "" });
    expect(res.status).toBe(400);
  });
});

describe("GET /auth/me", () => {
  let token: string;

  beforeAll(async () => {
    const res = await request(app).post("/auth/login").send({ username: "owner", password: "Owner123!" });
    token = res.body.token;
  });

  it("rejects requests with no token", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects requests with a garbage token", async () => {
    const res = await request(app).get("/auth/me").set("Authorization", "Bearer garbage");
    expect(res.status).toBe(401);
  });

  it("returns the authenticated user's profile and permissions", async () => {
    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("owner");
    expect(res.body.role).toBe("OWNER");
  });

  it("stops working immediately once the user is deactivated, without waiting for token expiry", async () => {
    // Create + login a throwaway waiter, then disable them and confirm the
    // still-unexpired token is rejected on the very next request.
    const waiterRole = db.select().from(roles).where(eq(roles.name, "WAITER")).get()!;
    const anyUser = db.select().from(users).get()!;
    const passwordHash = await hashPassword("TempPass1!");
    const userId = createId();
    db.insert(users)
      .values({
        id: userId,
        branchId: anyUser.branchId,
        username: "temp_waiter",
        passwordHash,
        displayName: "Temp Waiter",
        roleId: waiterRole.id,
        isActive: true,
      })
      .run();

    const loginRes = await request(app).post("/auth/login").send({ username: "temp_waiter", password: "TempPass1!" });
    expect(loginRes.status).toBe(200);
    const waiterToken = loginRes.body.token;

    db.update(users).set({ isActive: false }).where(eq(users.id, userId)).run();

    const meRes = await request(app).get("/auth/me").set("Authorization", `Bearer ${waiterToken}`);
    expect(meRes.status).toBe(401);
  });
});
