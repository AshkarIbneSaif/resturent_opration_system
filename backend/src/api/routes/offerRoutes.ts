import { Router } from "express";
import { z } from "zod";
import { authenticate, requirePermission } from "../middleware/auth";
import { PERMISSIONS } from "../../domain/identity/permissions";
import * as offerService from "../../domain/offers/offerService";
import * as comboService from "../../domain/combos/comboService";

export const offerRoutes = Router();
offerRoutes.use(authenticate);

const ItemSchema = z.object({ menuItemId: z.string(), quantity: z.number().int().positive().default(1) });

// --- Offers ---
offerRoutes.get("/offers", requirePermission(PERMISSIONS.OFFER_VIEW), (req, res) => {
  const activeOnly = req.query.activeOnly === "true";
  res.json(offerService.listOffers(req.session!.branchId, activeOnly));
});

offerRoutes.get("/offers/:id", requirePermission(PERMISSIONS.OFFER_VIEW), (req, res) => {
  res.json(offerService.getOffer(String(req.params.id)));
});

const CreateOfferSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  discountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
  discountValue: z.number().int().positive(),
  startsAt: z.number().int().nullable().optional(),
  endsAt: z.number().int().nullable().optional(),
  items: z.array(ItemSchema).min(1),
});
offerRoutes.post("/offers", requirePermission(PERMISSIONS.OFFER_MANAGE), (req, res) => {
  const parsed = CreateOfferSchema.parse(req.body);
  res.status(201).json(offerService.createOffer(req.session!.branchId, parsed, req.session!.userId));
});

const UpdateOfferSchema = CreateOfferSchema.partial().extend({ isActive: z.boolean().optional() });
offerRoutes.patch("/offers/:id", requirePermission(PERMISSIONS.OFFER_MANAGE), (req, res) => {
  const parsed = UpdateOfferSchema.parse(req.body);
  res.json(offerService.updateOffer(String(req.params.id), req.session!.branchId, parsed, req.session!.userId));
});

offerRoutes.delete("/offers/:id", requirePermission(PERMISSIONS.OFFER_MANAGE), (req, res) => {
  res.json(offerService.deactivateOffer(String(req.params.id), req.session!.branchId, req.session!.userId));
});

// --- Combos ---
offerRoutes.get("/combos", requirePermission(PERMISSIONS.OFFER_VIEW), (req, res) => {
  const activeOnly = req.query.activeOnly === "true";
  res.json(comboService.listCombos(req.session!.branchId, activeOnly));
});

offerRoutes.get("/combos/:id", requirePermission(PERMISSIONS.OFFER_VIEW), (req, res) => {
  res.json(comboService.getCombo(String(req.params.id)));
});

const CreateComboSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  priceMinor: z.number().int().nonnegative(),
  startsAt: z.number().int().nullable().optional(),
  endsAt: z.number().int().nullable().optional(),
  items: z.array(ItemSchema).min(1),
});
offerRoutes.post("/combos", requirePermission(PERMISSIONS.COMBO_MANAGE), (req, res) => {
  const parsed = CreateComboSchema.parse(req.body);
  res.status(201).json(comboService.createCombo(req.session!.branchId, parsed, req.session!.userId));
});

const UpdateComboSchema = CreateComboSchema.partial().extend({ isActive: z.boolean().optional() });
offerRoutes.patch("/combos/:id", requirePermission(PERMISSIONS.COMBO_MANAGE), (req, res) => {
  const parsed = UpdateComboSchema.parse(req.body);
  res.json(comboService.updateCombo(String(req.params.id), req.session!.branchId, parsed, req.session!.userId));
});

offerRoutes.delete("/combos/:id", requirePermission(PERMISSIONS.COMBO_MANAGE), (req, res) => {
  res.json(comboService.deactivateCombo(String(req.params.id), req.session!.branchId, req.session!.userId));
});
