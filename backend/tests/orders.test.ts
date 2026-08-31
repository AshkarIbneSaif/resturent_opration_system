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
let kitchenToken: string;
let tableId: string;
let categoryId: string;
let burgerId: string;
let friesId: string;
let variantId: string;

beforeAll(async () => {
  ownerToken = await loginAs("owner", "Owner123!");

  await request(app)
    .post("/users")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ username: "order_waiter", displayName: "Order Waiter", roleName: "WAITER", password: "WaiterPass1!" });
  waiterToken = await loginAs("order_waiter", "WaiterPass1!");

  await request(app)
    .post("/users")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ username: "order_kitchen", displayName: "Order Kitchen", roleName: "KITCHEN", password: "KitchenPass1!" });
  kitchenToken = await loginAs("order_kitchen", "KitchenPass1!");

  const tableRes = await request(app)
    .post("/tables")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ tableNumber: "ORD-1", capacity: 4 });
  tableId = tableRes.body.id;

  const catRes = await request(app)
    .post("/menu/categories")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Order Test Category" });
  categoryId = catRes.body.id;

  const burgerRes = await request(app)
    .post("/menu/items")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ categoryId, name: "Test Burger", basePriceMinor: 25000 });
  burgerId = burgerRes.body.id;

  const variantRes = await request(app)
    .post(`/menu/items/${burgerId}/variants`)
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Large", priceDeltaMinor: 5000 });
  variantId = variantRes.body.id;

  const friesRes = await request(app)
    .post("/menu/items")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ categoryId, name: "Test Fries", basePriceMinor: 8000 });
  friesId = friesRes.body.id;
});

describe("Order creation", () => {
  it("requires a table for DINE_IN orders", async () => {
    const res = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({
        source: "WAITER",
        orderType: "DINE_IN",
        items: [{ menuItemId: burgerId, quantity: 1 }],
        idempotencyKey: "no-table-test",
      });
    expect(res.status).toBe(400);
  });

  it("creates a dine-in order with frozen pricing including variant delta", async () => {
    const res = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({
        source: "WAITER",
        orderType: "DINE_IN",
        tableId,
        items: [
          { menuItemId: burgerId, variantId, quantity: 2, notes: "no onion" },
          { menuItemId: friesId, quantity: 2 },
        ],
        idempotencyKey: "order-1-key",
      });
    expect(res.status).toBe(201);
    expect(res.body.publicOrderId).toBeTruthy();
    expect(res.body.status).toBe("DRAFT");
    // Burger 25000 + variant delta 5000 = 30000/unit * 2 = 60000; fries 8000*2=16000
    expect(res.body.subtotalMinor).toBe(60000 + 16000);
    expect(res.body.items).toHaveLength(2);
    const burgerLine = res.body.items.find((i: any) => i.menuItemId === burgerId);
    expect(burgerLine.unitPriceMinor).toBe(30000);
  });

  it("is idempotent — resubmitting the same idempotencyKey returns the same order, not a duplicate", async () => {
    const first = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({
        source: "WAITER",
        orderType: "DINE_IN",
        tableId,
        items: [{ menuItemId: friesId, quantity: 1 }],
        idempotencyKey: "duplicate-guard-key",
      });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({
        source: "WAITER",
        orderType: "DINE_IN",
        tableId,
        items: [{ menuItemId: friesId, quantity: 1 }],
        idempotencyKey: "duplicate-guard-key",
      });
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.publicOrderId).toBe(first.body.publicOrderId);
  });

  it("rejects ordering an item the kitchen has marked unavailable", async () => {
    await request(app)
      .post(`/menu/items/${friesId}/availability`)
      .set("Authorization", `Bearer ${kitchenToken}`)
      .send({ available: false, reason: "out of potatoes" });

    const res = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({
        source: "WAITER",
        orderType: "DINE_IN",
        tableId,
        items: [{ menuItemId: friesId, quantity: 1 }],
        idempotencyKey: "unavailable-item-key",
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ITEM_UNAVAILABLE");

    // restore availability for later tests
    await request(app)
      .post(`/menu/items/${friesId}/availability`)
      .set("Authorization", `Bearer ${kitchenToken}`)
      .send({ available: true });
  });
});

describe("Full end-to-end acceptance scenario (spec #73)", () => {
  let orderId: string;
  let burgerItemId: string;
  let friesItemId: string;

  it("waiter creates order and sends to kitchen", async () => {
    const createRes = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({
        source: "WAITER",
        orderType: "DINE_IN",
        tableId,
        items: [
          { menuItemId: burgerId, quantity: 1 },
          { menuItemId: friesId, quantity: 1 },
        ],
        idempotencyKey: "e2e-scenario-key",
      });
    expect(createRes.status).toBe(201);
    orderId = createRes.body.id;
    burgerItemId = createRes.body.items.find((i: any) => i.menuItemId === burgerId).id;
    friesItemId = createRes.body.items.find((i: any) => i.menuItemId === friesId).id;

    const sendRes = await request(app)
      .post(`/orders/${orderId}/send-to-kitchen`)
      .set("Authorization", `Bearer ${waiterToken}`);
    expect(sendRes.status).toBe(200);
    expect(sendRes.body.status).toBe("SENT_TO_KITCHEN");
  });

  it("order appears in the kitchen queue", async () => {
    const res = await request(app).get("/orders/kitchen-queue").set("Authorization", `Bearer ${kitchenToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((o: any) => o.id === orderId)).toBe(true);
  });

  it("kitchen starts preparing one item — order auto-advances to PREPARING", async () => {
    const res = await request(app)
      .post(`/orders/items/${burgerItemId}/status`)
      .set("Authorization", `Bearer ${kitchenToken}`)
      .send({ status: "PREPARING" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PREPARING");
  });

  it("order stays PREPARING while items are partially ready", async () => {
    const res = await request(app)
      .post(`/orders/items/${burgerItemId}/status`)
      .set("Authorization", `Bearer ${kitchenToken}`)
      .send({ status: "READY" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PREPARING"); // fries is still PENDING
    const burgerLine = res.body.items.find((i: any) => i.id === burgerItemId);
    expect(burgerLine.kitchenStatus).toBe("READY");
  });

  it("kitchen cannot skip a state (PENDING -> READY directly)", async () => {
    const res = await request(app)
      .post(`/orders/items/${friesItemId}/status`)
      .set("Authorization", `Bearer ${kitchenToken}`)
      .send({ status: "READY" });
    expect(res.status).toBe(409);
  });

  it("once every item is ready, the order auto-advances to READY", async () => {
    await request(app)
      .post(`/orders/items/${friesItemId}/status`)
      .set("Authorization", `Bearer ${kitchenToken}`)
      .send({ status: "PREPARING" });
    const res = await request(app)
      .post(`/orders/items/${friesItemId}/status`)
      .set("Authorization", `Bearer ${kitchenToken}`)
      .send({ status: "READY" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("READY");
  });

  it("waiter marks order served, then requests the bill — table flips to BILL_REQUESTED", async () => {
    const servedRes = await request(app)
      .post(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({ status: "SERVED" });
    expect(servedRes.status).toBe(200);

    const billRes = await request(app)
      .post(`/orders/${orderId}/request-bill`)
      .set("Authorization", `Bearer ${waiterToken}`);
    expect(billRes.status).toBe(200);
    expect(billRes.body.status).toBe("BILL_REQUESTED");

    const tableRes = await request(app).get("/tables").set("Authorization", `Bearer ${waiterToken}`);
    const table = tableRes.body.find((t: any) => t.id === tableId);
    expect(table.status).toBe("BILL_REQUESTED");
  });

  it("rejects an invalid order-level transition (READY state already passed — cannot go back)", async () => {
    const res = await request(app)
      .post(`/orders/${orderId}/status`)
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({ status: "PREPARING" });
    expect(res.status).toBe(409);
  });

  it("order is fully searchable by its public Order ID", async () => {
    const orderRes = await request(app).get(`/orders/${orderId}`).set("Authorization", `Bearer ${waiterToken}`);
    const publicOrderId = orderRes.body.publicOrderId;

    const searchRes = await request(app)
      .get(`/orders/by-public-id/${publicOrderId}`)
      .set("Authorization", `Bearer ${waiterToken}`);
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.id).toBe(orderId);
  });
});

describe("Waiter order visibility", () => {
  it("a waiter only sees their own active orders, not another waiter's", async () => {
    await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ username: "other_waiter", displayName: "Other Waiter", roleName: "WAITER", password: "OtherPass1!" });
    const otherToken = await loginAs("other_waiter", "OtherPass1!");

    const table2 = await request(app)
      .post("/tables")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ tableNumber: "ORD-2", capacity: 2 });

    await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({
        source: "WAITER",
        orderType: "DINE_IN",
        tableId: table2.body.id,
        items: [{ menuItemId: friesId, quantity: 1 }],
        idempotencyKey: "visibility-test-key",
      });

    const otherActive = await request(app).get("/orders/active").set("Authorization", `Bearer ${otherToken}`);
    expect(otherActive.body.every((o: any) => o.waiterUserId !== null)).toBe(true);
    expect(otherActive.body.some((o: any) => o.tableId === table2.body.id)).toBe(false);

    const ownActive = await request(app).get("/orders/active").set("Authorization", `Bearer ${waiterToken}`);
    expect(ownActive.body.some((o: any) => o.tableId === table2.body.id)).toBe(true);
  });

  it("returns each order's line items, not just the order header (regression: frontend crashed on missing .items)", async () => {
    const active = await request(app).get("/orders/active").set("Authorization", `Bearer ${waiterToken}`);
    expect(active.status).toBe(200);
    expect(active.body.length).toBeGreaterThan(0);
    for (const order of active.body) {
      expect(Array.isArray(order.items)).toBe(true);
      expect(order.items.length).toBeGreaterThan(0);
      expect(order.items[0]).toHaveProperty("kitchenStatus");
    }
  });
});
