import { api } from "./client";

export interface OfferComboItem {
  menuItemId: string;
  quantity: number;
}

export interface Offer {
  id: string;
  branchId: string;
  name: string;
  description: string | null;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  startsAt: number | null;
  endsAt: number | null;
  isActive: boolean;
  createdBy: string | null;
  items: OfferComboItem[];
}

export interface Combo {
  id: string;
  branchId: string;
  name: string;
  description: string | null;
  priceMinor: number;
  startsAt: number | null;
  endsAt: number | null;
  isActive: boolean;
  createdBy: string | null;
  items: OfferComboItem[];
}

export interface OfferInput {
  name: string;
  description?: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  startsAt?: number | null;
  endsAt?: number | null;
  items: OfferComboItem[];
}

export interface ComboInput {
  name: string;
  description?: string;
  priceMinor: number;
  startsAt?: number | null;
  endsAt?: number | null;
  items: OfferComboItem[];
}

export const offersApi = {
  list: (activeOnly = false) => api.get<Offer[]>(`/offers${activeOnly ? "?activeOnly=true" : ""}`),
  get: (id: string) => api.get<Offer>(`/offers/${id}`),
  create: (input: OfferInput) => api.post<Offer>("/offers", input),
  update: (id: string, input: Partial<OfferInput> & { isActive?: boolean }) => api.patch<Offer>(`/offers/${id}`, input),
  remove: (id: string) => api.delete<Offer>(`/offers/${id}`),
};

export const combosApi = {
  list: (activeOnly = false) => api.get<Combo[]>(`/combos${activeOnly ? "?activeOnly=true" : ""}`),
  create: (input: ComboInput) => api.post<Combo>("/combos", input),
  update: (id: string, input: Partial<ComboInput> & { isActive?: boolean }) => api.patch<Combo>(`/combos/${id}`, input),
  remove: (id: string) => api.delete<Combo>(`/combos/${id}`),
};
