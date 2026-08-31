import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth";
import { PERMISSIONS } from "../../domain/identity/permissions";
import * as menu from "../../domain/menu/menuService";

export const menuRoutes = Router();
menuRoutes.use(authenticate);

// --- Categories ---
menuRoutes.get("/categories", requirePermission(PERMISSIONS.MENU_VIEW), (req, res) => {
  res.json(menu.listCategories(req.session!.branchId));
});

const CreateCategorySchema = z.object({ name: z.string().min(1), sortOrder: z.number().int().default(0) });
menuRoutes.post("/categories", requirePermission(PERMISSIONS.MENU_CREATE), (req, res) => {
  const parsed = CreateCategorySchema.parse(req.body);
  res
    .status(201)
    .json(menu.createCategory(req.session!.branchId, parsed.name, parsed.sortOrder, req.session!.userId));
});

const UpdateCategorySchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
menuRoutes.patch("/categories/:id", requirePermission(PERMISSIONS.MENU_UPDATE), (req, res) => {
  const parsed = UpdateCategorySchema.parse(req.body);
  res.json(menu.updateCategory(String(req.params.id), parsed, req.session!.userId));
});

menuRoutes.delete("/categories/:id", requirePermission(PERMISSIONS.CATEGORY_DELETE), (req, res) => {
  res.json(menu.deleteCategory(String(req.params.id), req.session!.branchId, req.session!.userId));
});

// --- Menu items ---
menuRoutes.get("/items", requirePermission(PERMISSIONS.MENU_VIEW), (req, res) => {
  const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
  res.json(menu.listMenuItems(categoryId));
});

const CreateItemSchema = z.object({
  categoryId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  basePriceMinor: z.number().int().nonnegative(),
  imagePath: z.string().optional(),
});
menuRoutes.post("/items", requirePermission(PERMISSIONS.MENU_CREATE), (req, res) => {
  const parsed = CreateItemSchema.parse(req.body);
  res.status(201).json(menu.createMenuItem(parsed, req.session!.branchId, req.session!.userId));
});

const UpdateItemSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  basePriceMinor: z.number().int().nonnegative().optional(),
  imagePath: z.string().optional(),
  isActive: z.boolean().optional(),
});
// Price changes require an explicit extra permission beyond general
// MENU_UPDATE (ROLES_AND_PERMISSIONS.md keeps "menu.price_change" distinct)
// — checked in the route body below, not via requirePermission, since the
// same PATCH endpoint handles both price and non-price edits.
menuRoutes.patch("/items/:id", requirePermission(PERMISSIONS.MENU_UPDATE), (req, res) => {
  const parsed = UpdateItemSchema.parse(req.body);
  if (parsed.basePriceMinor !== undefined && !req.session!.permissions.includes(PERMISSIONS.MENU_PRICE_CHANGE)) {
    return res.status(403).json({
      error: { code: "FORBIDDEN", message: "Missing permission: menu.price_change" },
    });
  }
  res.json(menu.updateMenuItem(String(req.params.id), parsed, req.session!.branchId, req.session!.userId));
});

menuRoutes.delete("/items/:id", requirePermission(PERMISSIONS.MENU_DELETE), (req, res) => {
  res.json(menu.deleteMenuItem(String(req.params.id), req.session!.branchId, req.session!.userId));
});

// --- Variants ---
menuRoutes.get("/items/:id/variants", requirePermission(PERMISSIONS.MENU_VIEW), (req, res) => {
  res.json(menu.listVariants(String(req.params.id)));
});

const VariantSchema = z.object({ name: z.string().min(1), priceDeltaMinor: z.number().int() });
menuRoutes.post("/items/:id/variants", requirePermission(PERMISSIONS.MENU_UPDATE), (req, res) => {
  const parsed = VariantSchema.parse(req.body);
  res
    .status(201)
    .json(menu.addVariant(String(req.params.id), parsed.name, parsed.priceDeltaMinor, req.session!.userId, req.session!.branchId));
});

// --- Modifiers ---
menuRoutes.get("/modifiers", requirePermission(PERMISSIONS.MENU_VIEW), (req, res) => {
  res.json(menu.listModifiers());
});

const ModifierSchema = z.object({ name: z.string().min(1), priceDeltaMinor: z.number().int() });
menuRoutes.post("/modifiers", requirePermission(PERMISSIONS.MENU_CREATE), (req, res) => {
  const parsed = ModifierSchema.parse(req.body);
  res
    .status(201)
    .json(menu.createModifier(parsed.name, parsed.priceDeltaMinor, req.session!.userId, req.session!.branchId));
});

const AttachModifierSchema = z.object({
  modifierId: z.string(),
  isRequired: z.boolean().default(false),
  maxQuantity: z.number().int().positive().default(1),
});
menuRoutes.post("/items/:id/modifiers", requirePermission(PERMISSIONS.MENU_UPDATE), (req, res) => {
  const parsed = AttachModifierSchema.parse(req.body);
  res
    .status(201)
    .json(
      menu.attachModifierToItem(
        String(req.params.id),
        parsed.modifierId,
        parsed.isRequired,
        parsed.maxQuantity,
        req.session!.userId,
        req.session!.branchId
      )
    );
});

menuRoutes.get("/items/:id/modifiers", requirePermission(PERMISSIONS.MENU_VIEW), (req, res) => {
  res.json(menu.listModifiersForItem(String(req.params.id)));
});

// --- Kitchen availability ---
const AvailabilitySchema = z.object({ available: z.boolean(), reason: z.string().optional() });
menuRoutes.post(
  "/items/:id/availability",
  requirePermission(PERMISSIONS.KITCHEN_UPDATE_AVAILABILITY),
  (req, res) => {
    const parsed = AvailabilitySchema.parse(req.body);
    res.json(
      menu.setKitchenAvailability(
        String(req.params.id),
        parsed.available,
        req.session!.userId,
        req.session!.branchId,
        parsed.reason
      )
    );
  }
);

menuRoutes.get(
  "/items/:id/availability-events",
  requirePermission(PERMISSIONS.MENU_VIEW),
  (req, res) => {
    res.json(menu.listAvailabilityEvents(String(req.params.id)));
  }
);
