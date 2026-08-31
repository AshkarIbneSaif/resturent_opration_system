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
let cashierToken: string;
let kitchenToken: string;
let tableId: string;
let burgerId: string;

beforeAll(async () => {
  ownerToken = await loginAs("owner", "Owner123!");

  await request(app)
    .post("/users")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ username: "bill_waiter", displayName: "Bill Waiter", roleName: "WAITER", password: "WaiterPass1!" });
  waiterToken = await loginAs("bill_waiter", "WaiterPass1!");

  await request(app)
    .post("/users")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ username: "bill_cashier", displayName: "Bill Cashier", roleName: "CASHIER", password: "CashierPass1!" });
  cashierToken = await loginAs("bill_cashier", "CashierPass1!");

  await request(app)
    .post("/users")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ username: "bill_kitchen", displayName: "Bill Kitchen", roleName: "KITCHEN", password: "KitchenPass1!" });
  kitchenToken = await loginAs("bill_kitchen", "KitchenPass1!");

  const tableRes = await request(app)
    .post("/tables")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ tableNumber: "BILL-1", capacity: 4 });
  tableId = tableRes.body.id;

  const catRes = await request(app)
    .post("/menu/categories")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name: "Billing Test Category" });

  const itemRes = await request(app)
    .post("/menu/items")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ categoryId: catRes.body.id, name: "Billing Test Burger", basePriceMinor: 50000 });
  burgerId = itemRes.body.id;
});

async function driveOrderToBillRequested() {
  // Each full flow needs its own table — a table stays BILL_REQUESTED until
  // its order is completed/cancelled, so reusing one table across multiple
  // in-progress flows would correctly be rejected as TABLE_NOT_AVAILABLE.
  const tableRes = await request(app)
    .post("/tables")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ tableNumber: `BILL-${Date.now()}-${Math.floor(Math.random() * 100000)}`, capacity: 4 });
  const freshTableId = tableRes.body.id;

  const createRes = await request(app)
    .post("/orders")
    .set("Authorization", `Bearer ${waiterToken}`)
    .send({
      source: "WAITER",
      orderType: "DINE_IN",
      tableId: freshTableId,
      items: [{ menuItemId: burgerId, quantity: 2 }], // 2 * 50000 = 100000
      idempotencyKey: `billing-flow-${Date.now()}-${Math.random()}`,
    });
  const orderId = createRes.body.id;
  const orderItemId = createRes.body.items[0].id;

  await request(app).post(`/orders/${orderId}/send-to-kitchen`).set("Authorization", `Bearer ${waiterToken}`);
  await request(app)
    .post(`/orders/items/${orderItemId}/status`)
    .set("Authorization", `Bearer ${kitchenToken}`)
    .send({ status: "PREPARING" });
  await request(app)
    .post(`/orders/items/${orderItemId}/status`)
    .set("Authorization", `Bearer ${kitchenToken}`)
    .send({ status: "READY" }); // order auto-advances SENT_TO_KITCHEN -> PREPARING -> READY

  await request(app).post(`/orders/${orderId}/status`).set("Authorization", `Bearer ${waiterToken}`).send({ status: "SERVED" });
  await request(app).post(`/orders/${orderId}/request-bill`).set("Authorization", `Bearer ${waiterToken}`);
  return orderId;
}

describe("Bill generation", () => {
  it("cannot generate a bill before the order reaches BILL_REQUESTED", async () => {
    const createRes = await request(app)
      .post("/orders")
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({
        source: "WAITER",
        orderType: "DINE_IN",
        tableId,
        items: [{ menuItemId: burgerId, quantity: 1 }],
        idempotencyKey: `too-early-${Date.now()}`,
      });
    const res = await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ orderId: createRes.body.id });
    expect(res.status).toBe(409);
  });

  it("generates a bill with correct totals once BILL_REQUESTED, order becomes BILLED", async () => {
    const orderId = await driveOrderToBillRequested();
    const res = await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ orderId, taxMinor: 5000, serviceChargeMinor: 2000 });
    expect(res.status).toBe(201);
    expect(res.body.subtotalMinor).toBe(100000);
    expect(res.body.totalMinor).toBe(100000 + 5000 + 2000);
    expect(res.body.status).toBe("UNPAID");

    const orderRes = await request(app).get(`/orders/${orderId}`).set("Authorization", `Bearer ${cashierToken}`);
    expect(orderRes.body.status).toBe("BILLED");
  });

  it("a waiter cannot apply a discount without discount.apply permission", async () => {
    const orderId = await driveOrderToBillRequested();
    const res = await request(app)
      .post("/bills")
      .set("Authorization", `Bearer ${waiterToken}`)
      .send({ orderId, discountMinor: 1000 });
    // waiter has bill.create (to "request bill") but not discount.apply
    expect(res.status).toBe(403);
  });

  it("regenerating a bill for the same order returns the existing bill, not a duplicate", async () => {
    const orderId = await driveOrderToBillRequested();
    const first = await request(app).post("/bills").set("Authorization", `Bearer ${cashierToken}`).send({ orderId });
    const second = await request(app).post("/bills").set("Authorization", `Bearer ${cashierToken}`).send({ orderId });
    expect(second.body.id).toBe(first.body.id);
  });
});

describe("Payments — atomicity and partial payment", () => {
  it("rejects a payment that would overpay the bill", async () => {
    const orderId = await driveOrderToBillRequested();
    const billRes = await request(app).post("/bills").set("Authorization", `Bearer ${cashierToken}`).send({ orderId });

    const res = await request(app)
      .post("/payments")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ billId: billRes.body.id, paymentMethod: "CASH", amountMinor: billRes.body.totalMinor + 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("OVERPAYMENT");
  });

  it("supports partial payment, then completes with a second payment — bill and order both transition correctly", async () => {
    const orderId = await driveOrderToBillRequested();
    const billRes = await request(app).post("/bills").set("Authorization", `Bearer ${cashierToken}`).send({ orderId });
    const total = billRes.body.totalMinor;
    const half = Math.floor(total / 2);

    const firstPay = await request(app)
      .post("/payments")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ billId: billRes.body.id, paymentMethod: "CARD", amountMinor: half });
    expect(firstPay.status).toBe(201);
    expect(firstPay.body.bill.status).toBe("PARTIALLY_PAID");

    const orderMidway = await request(app).get(`/orders/${orderId}`).set("Authorization", `Bearer ${cashierToken}`);
    expect(orderMidway.body.status).toBe("BILLED"); // not yet PAID

    const secondPay = await request(app)
      .post("/payments")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ billId: billRes.body.id, paymentMethod: "CASH", amountMinor: total - half });
    expect(secondPay.status).toBe(201);
    expect(secondPay.body.bill.status).toBe("PAID");

    const orderAfter = await request(app).get(`/orders/${orderId}`).set("Authorization", `Bearer ${cashierToken}`);
    expect(orderAfter.body.status).toBe("PAID");
  });

  it("rejects further payment once a bill is already fully paid", async () => {
    const orderId = await driveOrderToBillRequested();
    const billRes = await request(app).post("/bills").set("Authorization", `Bearer ${cashierToken}`).send({ orderId });
    await request(app)
      .post("/payments")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ billId: billRes.body.id, paymentMethod: "CASH", amountMinor: billRes.body.totalMinor });

    const res = await request(app)
      .post("/payments")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ billId: billRes.body.id, paymentMethod: "CASH", amountMinor: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_PAID");
  });

  it("kitchen staff cannot record payments (wrong permission)", async () => {
    const orderId = await driveOrderToBillRequested();
    const billRes = await request(app).post("/bills").set("Authorization", `Bearer ${cashierToken}`).send({ orderId });

    const res = await request(app)
      .post("/payments")
      .set("Authorization", `Bearer ${kitchenToken}`)
      .send({ billId: billRes.body.id, paymentMethod: "CASH", amountMinor: billRes.body.totalMinor });
    expect(res.status).toBe(403);
  });
});

describe("Full order -> bill -> payment -> receipt -> completed flow (spec #73)", () => {
  it("runs the entire acceptance scenario end to end", async () => {
    const orderId = await driveOrderToBillRequested();

    const billRes = await request(app).post("/bills").set("Authorization", `Bearer ${cashierToken}`).send({ orderId });
    expect(billRes.status).toBe(201);

    const payRes = await request(app)
      .post("/payments")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ billId: billRes.body.id, paymentMethod: "CASH", amountMinor: billRes.body.totalMinor });
    expect(payRes.status).toBe(201);
    expect(payRes.body.bill.status).toBe("PAID");

    // Receipt data object + rendered text
    const receiptDataRes = await request(app)
      .get(`/receipts/customer/${orderId}/data`)
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(receiptDataRes.status).toBe(200);
    expect(receiptDataRes.body.billStatus).toBe("PAID");
    expect(receiptDataRes.body.paymentMethod).toBe("CASH");

    const receiptTextRes = await request(app)
      .get(`/receipts/customer/${orderId}/text`)
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(receiptTextRes.status).toBe(200);
    expect(receiptTextRes.text).toContain("ORDER #");
    expect(receiptTextRes.text).toContain("TOTAL");
    expect(receiptTextRes.text).toContain("THANK YOU!");

    const kitchenReceiptRes = await request(app)
      .get(`/receipts/kitchen/${orderId}/text`)
      .set("Authorization", `Bearer ${kitchenToken}`);
    expect(kitchenReceiptRes.status).toBe(200);
    // Kitchen receipt must never leak financial info (spec #25)
    expect(kitchenReceiptRes.text).not.toContain("TOTAL");
    expect(kitchenReceiptRes.text).not.toContain("Subtotal");

    // Order completion
    const completeRes = await request(app)
      .post(`/orders/${orderId}/complete`)
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe("COMPLETED");
    expect(completeRes.body.completedAt).toBeTruthy();

    // Table is freed once the order completes
    const orderDetail = await request(app).get(`/orders/${orderId}`).set("Authorization", `Bearer ${cashierToken}`);
    const tablesRes = await request(app).get("/tables").set("Authorization", `Bearer ${ownerToken}`);
    const table = tablesRes.body.find((t: any) => t.id === orderDetail.body.tableId);
    expect(table.status).toBe("AVAILABLE");
  });
});
