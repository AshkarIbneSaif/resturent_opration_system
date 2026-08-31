import { eq } from "drizzle-orm";
import { db } from "../../infra/db/client";
import { customers } from "../../infra/db/schema";
import { createId } from "../shared/id";
import { ApiError } from "../../api/middleware/errorHandler";

export interface CreateCustomerInput {
  branchId: string;
  name?: string;
  phone?: string;
  email?: string;
}

/** Customer info is optional for dine-in and used mainly by takeout (spec #19). */
export function createCustomer(input: CreateCustomerInput) {
  const id = createId();
  db.insert(customers)
    .values({ id, branchId: input.branchId, name: input.name ?? null, phone: input.phone ?? null, email: input.email ?? null })
    .run();
  return db.select().from(customers).where(eq(customers.id, id)).get()!;
}

export function getCustomer(id: string) {
  const customer = db.select().from(customers).where(eq(customers.id, id)).get();
  if (!customer) throw new ApiError(404, "NOT_FOUND", "Customer not found.");
  return customer;
}

export function listCustomers(branchId: string) {
  return db.select().from(customers).where(eq(customers.branchId, branchId)).all();
}
