import { eq } from "drizzle-orm";
import { db } from "../../infra/db/client";
import {
  categories,
  menuItems,
  menuVariants,
  modifiers,
  menuItemModifiers,
  itemAvailabilityEvents,
  orderItems,
  offerItems,
  comboItems,
} from "../../infra/db/schema";
import { createId } from "../shared/id";
import { recordAudit } from "../audit/auditService";
import { AUDIT_ACTIONS } from "../audit/actions";
import { ApiError } from "../../api/middleware/errorHandler";

// ---------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------

export function listCategories(branchId: string) {
  return db.select().from(categories).where(eq(categories.branchId, branchId)).all();
}

export function createCategory(branchId: string, name: string, sortOrder: number, actingUserId: string) {
  const id = createId();
  db.insert(categories).values({ id, branchId, name, sortOrder }).run();
  recordAudit({
    branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.MENU_CREATED,
    entityType: "category",
    entityId: id,
    newValue: { name, sortOrder },
  });
  return db.select().from(categories).where(eq(categories.id, id)).get();
}

export function updateCategory(
  id: string,
  input: { name?: string; sortOrder?: number; isActive?: boolean },
  actingUserId: string
) {
  const current = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!current) throw new ApiError(404, "NOT_FOUND", "Category not found.");

  db.update(categories)
    .set({
      name: input.name ?? current.name,
      sortOrder: input.sortOrder ?? current.sortOrder,
      isActive: input.isActive ?? current.isActive,
    })
    .where(eq(categories.id, id))
    .run();

  recordAudit({
    branchId: current.branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.MENU_UPDATED,
    entityType: "category",
    entityId: id,
    oldValue: current,
    newValue: input,
  });

  return db.select().from(categories).where(eq(categories.id, id)).get();
}

// ---------------------------------------------------------------------
// Menu items
// ---------------------------------------------------------------------

export interface CreateMenuItemInput {
  categoryId: string;
  name: string;
  description?: string;
  basePriceMinor: number;
  imagePath?: string;
}

export function listMenuItems(categoryId?: string) {
  if (categoryId) {
    return db.select().from(menuItems).where(eq(menuItems.categoryId, categoryId)).all();
  }
  return db.select().from(menuItems).all();
}

export function getMenuItem(id: string) {
  const item = db.select().from(menuItems).where(eq(menuItems.id, id)).get();
  if (!item) throw new ApiError(404, "NOT_FOUND", "Menu item not found.");
  return item;
}

export function createMenuItem(input: CreateMenuItemInput, branchId: string, actingUserId: string) {
  const category = db.select().from(categories).where(eq(categories.id, input.categoryId)).get();
  if (!category) throw new ApiError(400, "INVALID_CATEGORY", "Category does not exist.");
  if (input.basePriceMinor < 0) throw new ApiError(400, "VALIDATION_ERROR", "Price cannot be negative.");

  const id = createId();
  db.insert(menuItems)
    .values({
      id,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description ?? null,
      basePriceMinor: input.basePriceMinor,
      imagePath: input.imagePath ?? null,
    })
    .run();

  recordAudit({
    branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.MENU_CREATED,
    entityType: "menu_item",
    entityId: id,
    newValue: input,
  });

  return getMenuItem(id);
}

export interface UpdateMenuItemInput {
  name?: string;
  description?: string;
  basePriceMinor?: number;
  imagePath?: string;
  isActive?: boolean;
}

/**
 * Price changes get their own audit action (MENU_PRICE_CHANGED) distinct
 * from general MENU_UPDATED, per spec #41 — financially significant
 * changes must be individually traceable, not buried in a generic update
 * event.
 */
export function updateMenuItem(id: string, input: UpdateMenuItemInput, branchId: string, actingUserId: string) {
  const current = getMenuItem(id);
  if (input.basePriceMinor !== undefined && input.basePriceMinor < 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Price cannot be negative.");
  }

  db.update(menuItems)
    .set({
      name: input.name ?? current.name,
      description: input.description ?? current.description,
      basePriceMinor: input.basePriceMinor ?? current.basePriceMinor,
      imagePath: input.imagePath ?? current.imagePath,
      isActive: input.isActive ?? current.isActive,
      updatedAt: Math.floor(Date.now() / 1000),
    })
    .where(eq(menuItems.id, id))
    .run();

  if (input.basePriceMinor !== undefined && input.basePriceMinor !== current.basePriceMinor) {
    recordAudit({
      branchId,
      userId: actingUserId,
      action: AUDIT_ACTIONS.MENU_PRICE_CHANGED,
      entityType: "menu_item",
      entityId: id,
      oldValue: { basePriceMinor: current.basePriceMinor },
      newValue: { basePriceMinor: input.basePriceMinor },
    });
  }

  const otherFieldsChanged = input.name || input.description || input.imagePath || input.isActive !== undefined;
  if (otherFieldsChanged) {
    recordAudit({
      branchId,
      userId: actingUserId,
      action: AUDIT_ACTIONS.MENU_UPDATED,
      entityType: "menu_item",
      entityId: id,
      oldValue: current,
      newValue: input,
    });
  }

  return getMenuItem(id);
}

/**
 * Permanent, irreversible removal (per product decision — Manager wants
 * true delete, not just deactivate). Guarded against the one case that
 * would actually corrupt data: an item that has ever appeared on an
 * order. Order history is financial record and must never be able to
 * point at a menu item that no longer exists, so that case is refused
 * with a clear message instead of failing on the FK constraint. Anything
 * else referencing the item (variants, modifier links, offer/combo
 * membership) is just current menu configuration, so it's cleaned up
 * automatically as part of the delete.
 */
export function deleteMenuItem(id: string, branchId: string, actingUserId: string) {
  const current = getMenuItem(id);

  const hasOrderHistory = db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.menuItemId, id)).get();
  if (hasOrderHistory) {
    throw new ApiError(
      409,
      "HAS_ORDER_HISTORY",
      "This item has already been ordered at least once, so it can't be permanently deleted — deactivate it instead to keep past orders and receipts intact."
    );
  }

  db.delete(menuVariants).where(eq(menuVariants.menuItemId, id)).run();
  db.delete(menuItemModifiers).where(eq(menuItemModifiers.menuItemId, id)).run();
  db.delete(offerItems).where(eq(offerItems.menuItemId, id)).run();
  db.delete(comboItems).where(eq(comboItems.menuItemId, id)).run();
  db.delete(itemAvailabilityEvents).where(eq(itemAvailabilityEvents.menuItemId, id)).run();
  db.delete(menuItems).where(eq(menuItems.id, id)).run();

  recordAudit({
    branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.MENU_DELETED,
    entityType: "menu_item",
    entityId: id,
    oldValue: current,
  });

  return { deleted: true, id };
}

/** Refused if any menu item (active or not) still belongs to this category — categoryId is required on menu_items. */
export function deleteCategory(id: string, branchId: string, actingUserId: string) {
  const current = db.select().from(categories).where(eq(categories.id, id)).get();
  if (!current) throw new ApiError(404, "NOT_FOUND", "Category not found.");

  const hasItems = db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.categoryId, id)).get();
  if (hasItems) {
    throw new ApiError(
      409,
      "HAS_MENU_ITEMS",
      "This category still has menu items in it — move or delete those items first."
    );
  }

  db.delete(categories).where(eq(categories.id, id)).run();

  recordAudit({
    branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.CATEGORY_DELETED,
    entityType: "category",
    entityId: id,
    oldValue: current,
  });

  return { deleted: true, id };
}

// ---------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------

export function addVariant(menuItemId: string, name: string, priceDeltaMinor: number, actingUserId: string, branchId: string) {
  getMenuItem(menuItemId); // 404s if missing
  const id = createId();
  db.insert(menuVariants).values({ id, menuItemId, name, priceDeltaMinor }).run();
  recordAudit({
    branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.MENU_UPDATED,
    entityType: "menu_variant",
    entityId: id,
    newValue: { menuItemId, name, priceDeltaMinor },
  });
  return db.select().from(menuVariants).where(eq(menuVariants.id, id)).get();
}

export function listVariants(menuItemId: string) {
  return db.select().from(menuVariants).where(eq(menuVariants.menuItemId, menuItemId)).all();
}

// ---------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------

export function createModifier(name: string, priceDeltaMinor: number, actingUserId: string, branchId: string) {
  const id = createId();
  db.insert(modifiers).values({ id, name, priceDeltaMinor }).run();
  recordAudit({
    branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.MENU_CREATED,
    entityType: "modifier",
    entityId: id,
    newValue: { name, priceDeltaMinor },
  });
  return db.select().from(modifiers).where(eq(modifiers.id, id)).get();
}

export function listModifiers() {
  return db.select().from(modifiers).all();
}

export function attachModifierToItem(
  menuItemId: string,
  modifierId: string,
  isRequired: boolean,
  maxQuantity: number,
  actingUserId: string,
  branchId: string
) {
  getMenuItem(menuItemId);
  const modifier = db.select().from(modifiers).where(eq(modifiers.id, modifierId)).get();
  if (!modifier) throw new ApiError(404, "NOT_FOUND", "Modifier not found.");

  db.insert(menuItemModifiers).values({ menuItemId, modifierId, isRequired, maxQuantity }).run();

  recordAudit({
    branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.MENU_UPDATED,
    entityType: "menu_item_modifier",
    entityId: `${menuItemId}:${modifierId}`,
    newValue: { menuItemId, modifierId, isRequired, maxQuantity },
  });

  return { menuItemId, modifierId, isRequired, maxQuantity };
}

export function listModifiersForItem(menuItemId: string) {
  return db
    .select({
      modifierId: modifiers.id,
      name: modifiers.name,
      priceDeltaMinor: modifiers.priceDeltaMinor,
      isRequired: menuItemModifiers.isRequired,
      maxQuantity: menuItemModifiers.maxQuantity,
    })
    .from(menuItemModifiers)
    .innerJoin(modifiers, eq(modifiers.id, menuItemModifiers.modifierId))
    .where(eq(menuItemModifiers.menuItemId, menuItemId))
    .all();
}

// ---------------------------------------------------------------------
// Kitchen availability (temporary unavailability)
// ---------------------------------------------------------------------

export function setKitchenAvailability(
  menuItemId: string,
  available: boolean,
  actingUserId: string,
  branchId: string,
  reason?: string
) {
  const item = getMenuItem(menuItemId);
  db.update(menuItems).set({ kitchenAvailable: available }).where(eq(menuItems.id, menuItemId)).run();

  // Durable event record — who changed it, status, reason, when it started
  // (and, if closing out a prior unavailability window, when it ended).
  db.insert(itemAvailabilityEvents)
    .values({
      id: createId(),
      menuItemId,
      changedBy: actingUserId,
      status: available ? "AVAILABLE" : "UNAVAILABLE",
      reason: reason ?? null,
    })
    .run();

  recordAudit({
    branchId,
    userId: actingUserId,
    action: available ? AUDIT_ACTIONS.ITEM_AVAILABLE : AUDIT_ACTIONS.ITEM_UNAVAILABLE,
    entityType: "menu_item",
    entityId: menuItemId,
    oldValue: { kitchenAvailable: item.kitchenAvailable },
    newValue: { kitchenAvailable: available, reason },
  });

  return getMenuItem(menuItemId);
}

export function listAvailabilityEvents(menuItemId: string) {
  return db
    .select()
    .from(itemAvailabilityEvents)
    .where(eq(itemAvailabilityEvents.menuItemId, menuItemId))
    .all();
}
