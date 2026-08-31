import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth";
import { PERMISSIONS } from "../../domain/identity/permissions";
import { createCustomer, listCustomers } from "../../domain/customers/customerService";

export const customerRoutes = Router();
customerRoutes.use(authenticate);

customerRoutes.get("/", requirePermission(PERMISSIONS.CUSTOMER_MANAGE), (req, res) => {
  res.json(listCustomers(req.session!.branchId));
});

const CreateCustomerSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

customerRoutes.post("/", requirePermission(PERMISSIONS.CUSTOMER_MANAGE), (req, res) => {
  const parsed = CreateCustomerSchema.parse(req.body);
  res.status(201).json(createCustomer({ branchId: req.session!.branchId, ...parsed }));
});
