import { eq } from "drizzle-orm";
import { db } from "../../infra/db/client";
import { restaurants } from "../../infra/db/schema";
import { recordAudit } from "../audit/auditService";
import { AUDIT_ACTIONS } from "../audit/actions";
import { ApiError } from "../../api/middleware/errorHandler";

export interface UpdateRestaurantInput {
  name?: string;
  logoPath?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export function getRestaurant() {
  const restaurant = db.select().from(restaurants).get();
  if (!restaurant) throw new ApiError(404, "NOT_FOUND", "Restaurant is not configured yet.");
  return restaurant;
}

/**
 * Restaurant identity changes are CRITICAL actions (spec #5/#7, FR-011)
 * — the route layer must apply requireCriticalConfirmation before calling
 * this. This function additionally guarantees the audit event is written
 * in the same call, never left to the caller to remember.
 */
export function updateRestaurant(input: UpdateRestaurantInput, actingUserId: string, branchId: string) {
  const current = getRestaurant();
  const next = { ...current, ...input, updatedAt: Math.floor(Date.now() / 1000) };

  db.update(restaurants)
    .set({
      name: next.name,
      logoPath: next.logoPath,
      address: next.address,
      phone: next.phone,
      email: next.email,
      updatedAt: next.updatedAt,
    })
    .where(eq(restaurants.id, current.id))
    .run();

  recordAudit({
    branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.RESTAURANT_UPDATED,
    entityType: "restaurant",
    entityId: current.id,
    oldValue: current,
    newValue: input,
  });

  return getRestaurant();
}
