import { and, eq, or, isNull, lte, gt } from "drizzle-orm";
import { db } from "../../infra/db/client";
import { offers, offerItems, menuItems } from "../../infra/db/schema";
import { createId } from "../shared/id";
import { recordAudit } from "../audit/auditService";
import { AUDIT_ACTIONS } from "../audit/actions";
import { ApiError } from "../../api/middleware/errorHandler";

export interface OfferItemInput {
  menuItemId: string;
  quantity?: number;
}

export interface CreateOfferInput {
  name: string;
  description?: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  startsAt?: number | null;
  endsAt?: number | null;
  items: OfferItemInput[];
}

export type UpdateOfferInput = Partial<Omit<CreateOfferInput, "items">> & {
  items?: OfferItemInput[];
  isActive?: boolean;
};

function nowEpoch() {
  return Math.floor(Date.now() / 1000);
}

function validateWindow(startsAt?: number | null, endsAt?: number | null) {
  if (startsAt != null && endsAt != null && endsAt <= startsAt) {
    throw new ApiError(400, "VALIDATION_ERROR", "Offer end time must be after its start time.");
  }
}

function assertItemsExist(itemIds: string[]) {
  for (const menuItemId of itemIds) {
    const exists = db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.id, menuItemId)).get();
    if (!exists) throw new ApiError(400, "INVALID_MENU_ITEM", `Menu item ${menuItemId} does not exist.`);
  }
}

function replaceOfferItems(offerId: string, items: OfferItemInput[]) {
  assertItemsExist(items.map((i) => i.menuItemId));
  db.delete(offerItems).where(eq(offerItems.offerId, offerId)).run();
  for (const item of items) {
    db.insert(offerItems)
      .values({ offerId, menuItemId: item.menuItemId, quantity: item.quantity ?? 1 })
      .run();
  }
}

function getOfferItems(offerId: string) {
  return db.select().from(offerItems).where(eq(offerItems.offerId, offerId)).all();
}

/**
 * `activeOnly` filters offers that are currently redeemable right now:
 * isActive=true AND (no start time OR start time has passed) AND (no end
 * time OR end time hasn't passed). This is computed at read time rather
 * than via a background job — an offer whose endsAt has slipped into the
 * past simply stops appearing in the "active" list on its own, satisfying
 * "auto-deactivate silently" without needing a scheduler in this app.
 */
export function listOffers(branchId: string, activeOnly = false) {
  const rows = activeOnly
    ? db
        .select()
        .from(offers)
        .where(
          and(
            eq(offers.branchId, branchId),
            eq(offers.isActive, true),
            or(isNull(offers.startsAt), lte(offers.startsAt, nowEpoch())),
            or(isNull(offers.endsAt), gt(offers.endsAt, nowEpoch()))
          )
        )
        .all()
    : db.select().from(offers).where(eq(offers.branchId, branchId)).all();

  return rows.map((offer) => ({ ...offer, items: getOfferItems(offer.id) }));
}

export function getOffer(id: string) {
  const offer = db.select().from(offers).where(eq(offers.id, id)).get();
  if (!offer) throw new ApiError(404, "NOT_FOUND", "Offer not found.");
  return { ...offer, items: getOfferItems(id) };
}

export function createOffer(branchId: string, input: CreateOfferInput, actingUserId: string) {
  if (input.discountValue <= 0) throw new ApiError(400, "VALIDATION_ERROR", "Discount value must be positive.");
  if (input.discountType === "PERCENTAGE" && input.discountValue > 10000) {
    throw new ApiError(400, "VALIDATION_ERROR", "Percentage discount cannot exceed 100%.");
  }
  if (!input.items.length) throw new ApiError(400, "VALIDATION_ERROR", "An offer needs at least one menu item.");
  validateWindow(input.startsAt, input.endsAt);
  assertItemsExist(input.items.map((i) => i.menuItemId));

  const id = createId();
  db.insert(offers)
    .values({
      id,
      branchId,
      name: input.name,
      description: input.description ?? null,
      discountType: input.discountType,
      discountValue: input.discountValue,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      createdBy: actingUserId,
    })
    .run();
  replaceOfferItems(id, input.items);

  recordAudit({
    branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.OFFER_CREATED,
    entityType: "offer",
    entityId: id,
    newValue: input,
  });

  return getOffer(id);
}

export function updateOffer(id: string, branchId: string, input: UpdateOfferInput, actingUserId: string) {
  const current = getOffer(id);

  const nextStartsAt = input.startsAt !== undefined ? input.startsAt : current.startsAt;
  const nextEndsAt = input.endsAt !== undefined ? input.endsAt : current.endsAt;
  validateWindow(nextStartsAt, nextEndsAt);

  if (input.discountValue !== undefined && input.discountValue <= 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Discount value must be positive.");
  }

  db.update(offers)
    .set({
      name: input.name ?? current.name,
      description: input.description ?? current.description,
      discountType: input.discountType ?? current.discountType,
      discountValue: input.discountValue ?? current.discountValue,
      startsAt: nextStartsAt,
      endsAt: nextEndsAt,
      isActive: input.isActive ?? current.isActive,
    })
    .where(eq(offers.id, id))
    .run();

  if (input.items) {
    if (!input.items.length) throw new ApiError(400, "VALIDATION_ERROR", "An offer needs at least one menu item.");
    replaceOfferItems(id, input.items);
  }

  recordAudit({
    branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.OFFER_UPDATED,
    entityType: "offer",
    entityId: id,
    oldValue: current,
    newValue: input,
  });

  return getOffer(id);
}

/**
 * Offers are never hard-deleted — a past bill can carry a `offerId`
 * reference (spec: bills.offerId), so removing one just flips isActive
 * off. It stops showing up anywhere it matters (Manager's active list,
 * Cashier's picker) but historical bills that used it keep working.
 */
export function deactivateOffer(id: string, branchId: string, actingUserId: string) {
  const current = getOffer(id);
  db.update(offers).set({ isActive: false }).where(eq(offers.id, id)).run();
  recordAudit({
    branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.OFFER_DELETED,
    entityType: "offer",
    entityId: id,
    oldValue: current,
  });
  return getOffer(id);
}
