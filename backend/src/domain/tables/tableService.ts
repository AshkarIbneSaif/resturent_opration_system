import { eq, and } from "drizzle-orm";
import { db } from "../../infra/db/client";
import { restaurantTables } from "../../infra/db/schema";
import { createId } from "../shared/id";
import { recordAudit } from "../audit/auditService";
import { AUDIT_ACTIONS } from "../audit/actions";
import { ApiError } from "../../api/middleware/errorHandler";

export const TABLE_STATUSES = ["AVAILABLE", "OCCUPIED", "RESERVED", "BILL_REQUESTED", "OUT_OF_SERVICE"] as const;
export type TableStatusValue = (typeof TABLE_STATUSES)[number];

export interface CreateTableInput {
  branchId: string;
  tableNumber: string;
  capacity: number;
}

export function listTables(branchId: string) {
  return db.select().from(restaurantTables).where(eq(restaurantTables.branchId, branchId)).all();
}

export function getTable(id: string) {
  const table = db.select().from(restaurantTables).where(eq(restaurantTables.id, id)).get();
  if (!table) throw new ApiError(404, "NOT_FOUND", "Table not found.");
  return table;
}

export function createTable(input: CreateTableInput, actingUserId: string) {
  const existing = db
    .select()
    .from(restaurantTables)
    .where(and(eq(restaurantTables.branchId, input.branchId), eq(restaurantTables.tableNumber, input.tableNumber)))
    .get();
  if (existing) throw new ApiError(409, "CONFLICT", `Table ${input.tableNumber} already exists.`);

  const id = createId();
  db.insert(restaurantTables)
    .values({ id, branchId: input.branchId, tableNumber: input.tableNumber, capacity: input.capacity })
    .run();

  recordAudit({
    branchId: input.branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.TABLE_CREATED,
    entityType: "restaurant_table",
    entityId: id,
    newValue: input,
  });

  return getTable(id);
}

export interface UpdateTableInput {
  capacity?: number;
  isActive?: boolean;
}

export function updateTable(id: string, input: UpdateTableInput, actingUserId: string) {
  const current = getTable(id);
  db.update(restaurantTables)
    .set({ capacity: input.capacity ?? current.capacity, isActive: input.isActive ?? current.isActive })
    .where(eq(restaurantTables.id, id))
    .run();

  recordAudit({
    branchId: current.branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.TABLE_UPDATED,
    entityType: "restaurant_table",
    entityId: id,
    oldValue: current,
    newValue: input,
  });

  return getTable(id);
}

/**
 * Table status changes go through a single choke point (mirrors the order
 * state-transition service design in spec #39) so future rules — e.g.
 * blocking BILL_REQUESTED -> AVAILABLE without a paid order — have one
 * place to live instead of being scattered across callers.
 */
const ALLOWED_TABLE_TRANSITIONS: Record<TableStatusValue, TableStatusValue[]> = {
  AVAILABLE: ["OCCUPIED", "RESERVED", "OUT_OF_SERVICE"],
  OCCUPIED: ["BILL_REQUESTED", "AVAILABLE", "OUT_OF_SERVICE"],
  RESERVED: ["OCCUPIED", "AVAILABLE", "OUT_OF_SERVICE"],
  BILL_REQUESTED: ["AVAILABLE", "OCCUPIED", "OUT_OF_SERVICE"],
  OUT_OF_SERVICE: ["AVAILABLE"],
};

export function changeTableStatus(id: string, newStatus: TableStatusValue, actingUserId: string) {
  const current = getTable(id);
  const allowed = ALLOWED_TABLE_TRANSITIONS[current.status as TableStatusValue];
  if (!allowed.includes(newStatus)) {
    throw new ApiError(
      409,
      "INVALID_TRANSITION",
      `Cannot move table ${current.tableNumber} from ${current.status} to ${newStatus}.`
    );
  }

  db.update(restaurantTables).set({ status: newStatus }).where(eq(restaurantTables.id, id)).run();

  recordAudit({
    branchId: current.branchId,
    userId: actingUserId,
    action: AUDIT_ACTIONS.TABLE_STATUS_CHANGED,
    entityType: "restaurant_table",
    entityId: id,
    oldValue: { status: current.status },
    newValue: { status: newStatus },
  });

  return getTable(id);
}
