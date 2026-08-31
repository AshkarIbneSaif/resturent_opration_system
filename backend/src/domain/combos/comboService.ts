import { and, eq, or, isNull, lte, gt } from "drizzle-orm";
import { db } from "../../infra/db/client";
import { combos, comboItems, menuItems } from "../../infra/db/schema";
import { createId } from "../shared/id";
import { recordAudit } from "../audit/auditService";
import { AUDIT_ACTIONS } from "../audit/actions";
import { ApiError } from "../../api/middleware/errorHandler";

export interface ComboItemInput {
  menuItemId: string;
  quantity?: number;
}

export interface CreateComboInput {
  name: string;
  description?: string;
  priceMinor: number;
  startsAt?: number | null;
  endsAt?: number | null;
  items: ComboItemInput[];
}

export type UpdateComboInput = Partial<Omit<CreateComboInput, "items">> & {
  items?: ComboItemInput[];
  isActive?: boolean;
};

function nowEpoch() {
  return Math.floor(Date.now() / 1000);
}

function validateWindow(startsAt?: number | null, endsAt?: number | null) {
  if (startsAt != null && endsAt != null && endsAt <= startsAt) {
    throw new ApiError(400, "VALIDATION_ERROR", "Combo end time must be after its start time.");
  }
}

function assertItemsExist(itemIds: string[]) {
  for (const menuItemId of itemIds) {
    const exists = db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.id, menuItemId)).get();
    if (!exists) throw new ApiError(400, "INVALID_MENU_ITEM", `Menu item ${menuItemId} does not exist.`);
  }
}

function replaceComboItems(comboId: string, items: ComboItemInput[]) {
  assertItemsExist(items.map((i) => i.menuItemId));
  db.delete(comboItems).where(eq(comboItems.comboId, comboId)).run();
  for (const item of items) {
    db.insert(comboItems)
      .values({ comboId, menuItemId: item.menuItemId, quantity: item.quantity ?? 1 })
      .run();
  }
}

function getComboItems(comboId: string) {
  return db.select().from(comboItems).where(eq(comboItems.comboId, comboId)).all();
}

/** Same "computed at read time" active-window logic as offers — see offerService.listOffers. */
export function listCombos(branchId: string, activeOnly = false) {
  const rows = activeOnly
    ? db
        .select()
        .from(combos)
        .where(
          and(
            eq(combos.branchId, branchId),
            eq(combos.isActive, true),
            or(isNull(combos.startsAt), lte(combos.startsAt, nowEpoch())),
            or(isNull(combos.endsAt), gt(combos.endsAt, nowEpoch()))
          )
        )
        .all()
    : db.select().from(combos).where(eq(combos.branchId, branchId)).all();

  return rows.map((combo) => ({ ...combo, items: getComboItems(combo.id) }));
}

export function getCombo(id: string) {
  const combo = db.select().from(combos).where(eq(combos.id, id)).get();
  if (!combo) throw new ApiError(404, "NOT_FOUND", "Combo not found.");
  return { ...combo, items: getComboItems(id) };
}

export function createCombo(branchId: string, input: CreateComboInput, actingUserId: string) {
  if (input.priceMinor < 0) throw new ApiError(400, "VALIDATION_ERROR", "Combo price cannot be negative.");
  if (!input.items.length) throw new ApiError(400, "VALIDATION_ERROR", "A combo needs at least one menu item.");
  validateWindow(input.startsAt, input.endsAt);
  assertItemsExist(input.items.map((i) => i.menuItemId));

  const id = createId();
  db.insert(combos)
    .values({
      id,
      branchId,
      name: input.name,
      description: input.description ?? null,
      priceMinor: input.priceMinor,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      createdBy: actingUserId,
    })
    .run();
  replaceComboItems(id, input.items);

  recordAudit({
    branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.COMBO_CREATED,
    entityType: "combo",
    entityId: id,
    newValue: input,
  });

  return getCombo(id);
}

export function updateCombo(id: string, branchId: string, input: UpdateComboInput, actingUserId: string) {
  const current = getCombo(id);

  const nextStartsAt = input.startsAt !== undefined ? input.startsAt : current.startsAt;
  const nextEndsAt = input.endsAt !== undefined ? input.endsAt : current.endsAt;
  validateWindow(nextStartsAt, nextEndsAt);

  if (input.priceMinor !== undefined && input.priceMinor < 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Combo price cannot be negative.");
  }

  db.update(combos)
    .set({
      name: input.name ?? current.name,
      description: input.description ?? current.description,
      priceMinor: input.priceMinor ?? current.priceMinor,
      startsAt: nextStartsAt,
      endsAt: nextEndsAt,
      isActive: input.isActive ?? current.isActive,
    })
    .where(eq(combos.id, id))
    .run();

  if (input.items) {
    if (!input.items.length) throw new ApiError(400, "VALIDATION_ERROR", "A combo needs at least one menu item.");
    replaceComboItems(id, input.items);
  }

  recordAudit({
    branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.COMBO_UPDATED,
    entityType: "combo",
    entityId: id,
    oldValue: current,
    newValue: input,
  });

  return getCombo(id);
}

/** Combos are never hard-deleted either, for the same reason as offers — see offerService.deactivateOffer. */
export function deactivateCombo(id: string, branchId: string, actingUserId: string) {
  const current = getCombo(id);
  db.update(combos).set({ isActive: false }).where(eq(combos.id, id)).run();
  recordAudit({
    branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.COMBO_DELETED,
    entityType: "combo",
    entityId: id,
    oldValue: current,
  });
  return getCombo(id);
}
