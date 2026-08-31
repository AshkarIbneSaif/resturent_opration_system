import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth";
import { requireCriticalConfirmation } from "../middleware/criticalAction";
import { getRestaurant, updateRestaurant } from "../../domain/restaurant/restaurantService";
import { PERMISSIONS } from "../../domain/identity/permissions";

export const restaurantRoutes = Router();
restaurantRoutes.use(authenticate);

restaurantRoutes.get("/", requirePermission(PERMISSIONS.SETTINGS_RESTAURANT_UPDATE), (req, res) => {
  res.json(getRestaurant());
});

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  logoPath: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  criticalConfirmation: z.string(),
});

restaurantRoutes.patch(
  "/",
  requirePermission(PERMISSIONS.SETTINGS_RESTAURANT_UPDATE),
  requireCriticalConfirmation,
  (req, res) => {
    const parsed = UpdateSchema.parse(req.body);
    const { criticalConfirmation, ...input } = parsed;
    const updated = updateRestaurant(input, req.session!.userId, req.session!.branchId);
    res.json(updated);
  }
);
