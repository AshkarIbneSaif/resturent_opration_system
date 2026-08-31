import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth";
import { PERMISSIONS } from "../../domain/identity/permissions";
import { listUsers, createUser, setUserActive, resetUserPassword, assignRole } from "../../domain/identity/userService";

export const userRoutes = Router();
userRoutes.use(authenticate);

userRoutes.get("/", requirePermission(PERMISSIONS.USER_CREATE), (req, res) => {
  res.json(listUsers(req.session!.branchId));
});

const CreateUserSchema = z.object({
  username: z.string().min(3),
  displayName: z.string().min(1),
  employeeCode: z.string().optional(),
  roleName: z.enum(["OWNER", "MANAGER", "WAITER", "KITCHEN", "CASHIER", "TAKEOUT"]),
  password: z.string().min(8),
});

userRoutes.post("/", requirePermission(PERMISSIONS.USER_CREATE), async (req, res) => {
  const parsed = CreateUserSchema.parse(req.body);
  const user = await createUser({ branchId: req.session!.branchId, ...parsed }, req.session!.userId);
  res.status(201).json(user);
});

userRoutes.post("/:id/disable", requirePermission(PERMISSIONS.USER_DISABLE), (req, res) => {
  res.json(setUserActive(String(req.params.id), false, req.session!.userId));
});

userRoutes.post("/:id/enable", requirePermission(PERMISSIONS.USER_DISABLE), (req, res) => {
  res.json(setUserActive(String(req.params.id), true, req.session!.userId));
});

const ResetPasswordSchema = z.object({ newPassword: z.string().min(8) });

userRoutes.post("/:id/reset-password", requirePermission(PERMISSIONS.USER_RESET), async (req, res) => {
  const { newPassword } = ResetPasswordSchema.parse(req.body);
  res.json(await resetUserPassword(String(req.params.id), newPassword, req.session!.userId));
});

const AssignRoleSchema = z.object({
  roleName: z.enum(["OWNER", "MANAGER", "WAITER", "KITCHEN", "CASHIER", "TAKEOUT"]),
});

userRoutes.post("/:id/role", requirePermission(PERMISSIONS.USER_ASSIGN_ROLE), (req, res) => {
  const { roleName } = AssignRoleSchema.parse(req.body);
  res.json(assignRole(String(req.params.id), roleName, req.session!.userId));
});
