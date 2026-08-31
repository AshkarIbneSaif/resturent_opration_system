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
let managerToken: string;
let waiterToken: string;
let kitchenToken: string;
let cashierToken: string;
let takeoutToken: string;
let burgerId: string;

beforeAll(async () => {
  ownerToken = await loginAs("owner", "Owner123!");

  const roles: [string, string, string][] = [
    ["report_manager", "MANAGER", "ManagerPass1!"],
    ["report_waiter", "WAITER", "WaiterPass1!"],
    ["report_kitchen", "KITCHEN", "KitchenPass1!"],
    ["report_cashier", "CASHIER", "CashierPass1!"],
    ["report_takeout", "TAKEOUT", "TakeoutPass1!"],
  ];
  for (const [username, roleName, password] of roles) {
    await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ username, displayName: username, roleName, password });
  }
  managerToken = await loginAs("report_manager", "ManagerPass1!");
  waiterToken = await loginAs("report_waiter", "WaiterPass1!");
  kitchenToken = await loginAs("report_kitchen", "KitchenPass1!");
  cashierToken = await loginAs("report_cashier", "CashierPass1!");
  takeoutToken = await loginAs("report_takeout", "TakeoutPass1!");

  const catRes = await request(app)
    .post("/menu/categories")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Report Test Category" });
  const itemRes = await request(app)
    .post("/menu/items")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ categoryId: catRes.body.id, name: "Report Test Burger", basePriceMinor: 40000 });
  burgerId = itemRes.body.id;
});

async function fullyPayDineInOrder(waiterTok: string) {
  const tableRes = await request(app)
    .post("/tables")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ tableNumber: `RPT-${Date.now()}-${Math.random()}`, capacity: 2 });

  const createRes = await request(app)
    .post("/orders")
    .set("Authorization", `Bearer ${waiterTok}`)
    .send({
      source: "WAITER",
      orderType: "DINE_IN",
      tableId: tableRes.body.id,
      items: [{ menuItemId: burgerId, quantity: 1 }],
      idempotencyKey: `report-flow-${Date.now()}-${Math.random()}`,
    });
  const orderId = createRes.body.id;
  const itemId = createRes.body.items[0].id;

  await request(app).post(`/orders/${orderId}/send-to-kitchen`).set("Authorization", `Bearer ${waiterTok}`);
  await request(app).post(`/orders/items/${itemId}/status`).set("Authorization", `Bearer ${kitchenToken}`).send({ status: "PREPARING" });
  await request(app).post(`/orders/items/${itemId}/status`).set("Authorization", `Bearer ${kitchenToken}`).send({ status: "READY" });
  await request(app).post(`/orders/${orderId}/status`).set("Authorization", `Bearer ${waiterTok}`).send({ status: "SERVED" });
  await request(app).post(`/orders/${orderId}/request-bill`).set("Authorization", `Bearer ${waiterTok}`);

  const billRes = await request(app).post("/bills").set("Authorization", `Bearer ${cashierToken}`).send({ orderId });
  await request(app)
    .post("/payments")
    .set("Authorization", `Bearer ${cashierToken}`)
    .send({ billId: billRes.body.id, paymentMethod: "CASH", amountMinor: billRes.body.totalMinor });

  return orderId;
}

describe("Customers (takeout)", () => {
  it("blocks a waiter from managing customers (customer.manage not granted to WAITER)", async () => {
    const res = await request(app)
      .post("/customers")
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({ name: "Should Fail" });
    expect(res.status).toBe(403);
  });

  it("takeout staff can create a customer record and a takeaway order without a table", async () => {
    const custRes = await request(app)
      .post("/customers")
      .set("Authorization", `Bearer ${takeoutToken}`)
      .send({ name: "Jane Doe", phone: "01700000000" });
    expect(custRes.status).toBe(201);

    const orderRes = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${takeoutToken}`)
      .send({
        source: "TAKEOUT",
        orderType: "TAKEAWAY",
        customerId: custRes.body.id,
        items: [{ menuItemId: burgerId, quantity: 1 }],
        idempotencyKey: `takeout-key-${Date.now()}`,
      });
    expect(orderRes.status).toBe(201);
    expect(orderRes.body.tableId).toBeNull();
    expect(orderRes.body.customerId).toBe(custRes.body.id);
    expect(orderRes.body.orderType).toBe("TAKEAWAY");
  });

  it("still requires a table for DINE_IN even when submitted by a non-waiter role", async () => {
    const res = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${takeoutToken}`)
      .send({
        source: "TAKEOUT",
        orderType: "DINE_IN",
        items: [{ menuItemId: burgerId, quantity: 1 }],
        idempotencyKey: `bad-dinein-${Date.now()}`,
      });
    expect(res.status).toBe(400);
  });
});

describe("Reports — computed from real transactional data", () => {
  it("blocks a kitchen user from viewing sales reports", async () => {
    const res = await request(app).get("/reports/sales").set("Authorization", `Bearer ${kitchenToken}`);
    expect(res.status).toBe(403);
  });

  it("sales report reflects an actual completed payment", async () => {
    const before = await request(app).get("/reports/sales").set("Authorization", `Bearer ${managerToken}`);
    const beforeRevenue = before.body.totalRevenueMinor;

    await fullyPayDineInOrder(waiterToken);

    const after = await request(app).get("/reports/sales").set("Authorization", `Bearer ${managerToken}`);
    expect(after.body.totalRevenueMinor).toBe(beforeRevenue + 40000);
    expect(after.body.paymentMethodBreakdown.CASH).toBeGreaterThanOrEqual(40000);
  });

  it("product performance report attributes quantity and revenue to the correct item", async () => {
    const res = await request(app).get("/reports/product-performance").set("Authorization", `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    const line = res.body.find((r: any) => r.menuItemId === burgerId);
    expect(line).toBeTruthy();
    expect(line.quantitySold).toBeGreaterThanOrEqual(2); // one from customer test, one from fullyPayDineInOrder
  });

  it("waiter performance report attributes the order to the correct waiter", async () => {
    const res = await request(app).get("/reports/waiter-performance").set("Authorization", `Bearer ${managerToken}`);
    const waiterId = (await request(app).get("/auth/me").set("Authorization", `Bearer ${waiterToken}`)).body.user.id;
    const line = res.body.find((r: any) => r.waiterUserId === waiterId);
    expect(line).toBeTruthy();
    expect(line.orderCount).toBeGreaterThanOrEqual(1);
    expect(line.salesMinor).toBeGreaterThanOrEqual(40000);
  });

  it("order statistics report reflects real status/type/source distribution", async () => {
    const res = await request(app).get("/reports/order-statistics").set("Authorization", `Bearer ${managerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalOrders).toBeGreaterThan(0);
    expect(res.body.sourceDistribution.WAITER).toBeGreaterThan(0);
    expect(res.body.sourceDistribution.TAKEOUT).toBeGreaterThan(0);
    expect(res.body.typeDistribution.DINE_IN).toBeGreaterThan(0);
    expect(res.body.typeDistribution.TAKEAWAY).toBeGreaterThan(0);
  });
});

describe("Audit log — read-only", () => {
  it("blocks a manager from viewing audit logs (audit.view is OWNER-only by default)", async () => {
    const res = await request(app).get("/audit").set("Authorization", `Bearer ${managerToken}`);
    expect(res.status).toBe(403);
  });

  it("owner can view the audit trail and it contains real recorded events", async () => {
    const res = await request(app).get("/audit").set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some((e: any) => e.action === "ORDER_CREATED")).toBe(true);
    expect(res.body.some((e: any) => e.action === "PAYMENT_CREATED")).toBe(true);
    expect(res.body.some((e: any) => e.action === "USER_LOGIN_SUCCESS")).toBe(true);
  });

  it("offers no route to modify or delete audit entries", async () => {
    const listRes = await request(app).get("/audit").set("Authorization", `Bearer ${ownerToken}`);
    const entry = listRes.body[0];
    const patchRes = await request(app)
      .patch(`/audit/${entry.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ action: "TAMPERED" });
    expect(patchRes.status).toBe(404); // no such route exists at all
    const deleteRes = await request(app).delete(`/audit/${entry.id}`).set("Authorization", `Bearer ${ownerToken}`);
    expect(deleteRes.status).toBe(404);
  });

  it("can filter audit history down to a single entity", async () => {
    const orderId = await fullyPayDineInOrder(waiterToken);
    const res = await request(app).get(`/audit/entity/order/${orderId}`).set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.every((e: any) => e.entityId === orderId)).toBe(true);
    expect(res.body.some((e: any) => e.action === "ORDER_CREATED")).toBe(true);
  });
});
