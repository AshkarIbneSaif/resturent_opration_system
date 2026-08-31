import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth";
import { PERMISSIONS } from "../../domain/identity/permissions";
import * as orderService from "../../domain/orders/orderService";
import { ORDER_SOURCES, ORDER_TYPES, ORDER_STATUSES, ITEM_KITCHEN_STATUSES } from "../../infra/db/schema";

export const orderRoutes = Router();
orderRoutes.use(authenticate);

const OrderItemSchema = z.object({
  menuItemId: z.string(),
  variantId: z.string().optional(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
  modifiers: z.array(z.object({ modifierId: z.string(), quantity: z.number().int().positive() })).optional(),
});

const OrderComboSchema = z.object({
  comboId: z.string(),
  quantity: z.number().int().positive(),
});

const CreateOrderSchema = z.object({
  source: z.enum(ORDER_SOURCES),
  orderType: z.enum(ORDER_TYPES),
  tableId: z.string().optional(),
  customerId: z.string().optional(),
  items: z.array(OrderItemSchema).default([]),
  combos: z.array(OrderComboSchema).optional(),
  offerId: z.string().optional(),
  idempotencyKey: z.string().min(1),
});

orderRoutes.post("/", requirePermission(PERMISSIONS.ORDER_CREATE), (req, res) => {
  const parsed = CreateOrderSchema.parse(req.body);
  const isWaiterOrder = parsed.source === "WAITER";
  const order = orderService.createOrder(
    {
      branchId: req.session!.branchId,
      source: parsed.source,
      orderType: parsed.orderType,
      tableId: parsed.tableId,
      waiterUserId: isWaiterOrder ? req.session!.userId : undefined,
      customerId: parsed.customerId,
      items: parsed.items,
      combos: parsed.combos,
      offerId: parsed.offerId,
      idempotencyKey: parsed.idempotencyKey,
    },
    req.session!.userId
  );
  res.status(201).json(order);
});

orderRoutes.get("/active", requirePermission(PERMISSIONS.ORDER_VIEW), (req, res) => {
  // Waiters see only their own active orders (ROLES_AND_PERMISSIONS.md:
  // "View own active orders"); management roles see the full branch queue.
  const isWaiterRole = req.session!.roleName === "WAITER";
  res.json(orderService.listActiveOrders(req.session!.branchId, isWaiterRole ? req.session!.userId : undefined));
});

orderRoutes.get("/kitchen-queue", requirePermission(PERMISSIONS.KITCHEN_VIEW), (req, res) => {
  res.json(orderService.listKitchenQueue(req.session!.branchId));
});

orderRoutes.get("/by-public-id/:publicOrderId", requirePermission(PERMISSIONS.ORDER_VIEW), (req, res) => {
  res.json(orderService.findOrderByPublicId(req.session!.branchId, String(req.params.publicOrderId)));
});

orderRoutes.get("/:id", requirePermission(PERMISSIONS.ORDER_VIEW), (req, res) => {
  res.json(orderService.getOrderWithItems(String(req.params.id)));
});

orderRoutes.post("/:id/send-to-kitchen", requirePermission(PERMISSIONS.ORDER_SEND_TO_KITCHEN), (req, res) => {
  res.json(orderService.sendToKitchen(String(req.params.id), req.session!.userId));
});

const TransitionSchema = z.object({ status: z.enum(ORDER_STATUSES) });
orderRoutes.post("/:id/status", requirePermission(PERMISSIONS.ORDER_MODIFY), (req, res) => {
  const { status } = TransitionSchema.parse(req.body);
  res.json(orderService.transitionOrderStatus(String(req.params.id), status, req.session!.userId));
});

orderRoutes.post("/:id/request-bill", requirePermission(PERMISSIONS.BILL_CREATE), (req, res) => {
  res.json(orderService.transitionOrderStatus(String(req.params.id), "BILL_REQUESTED", req.session!.userId));
});

const ItemStatusSchema = z.object({ status: z.enum(ITEM_KITCHEN_STATUSES) });
orderRoutes.post(
  "/items/:orderItemId/status",
  requirePermission(PERMISSIONS.KITCHEN_UPDATE_ITEM_STATUS),
  (req, res) => {
    const { status } = ItemStatusSchema.parse(req.body);
    res.json(orderService.updateItemKitchenStatus(String(req.params.orderItemId), status, req.session!.userId));
  }
);
