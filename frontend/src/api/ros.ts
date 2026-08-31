import { api } from "./client";

export interface RestaurantTable {
  id: string;
  branchId: string;
  tableNumber: string;
  capacity: number;
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "BILL_REQUESTED" | "OUT_OF_SERVICE";
  isActive: boolean;
}

export interface Category {
  id: string;
  branchId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  basePriceMinor: number;
  imagePath: string | null;
  isActive: boolean;
  kitchenAvailable: boolean;
}

export interface MenuVariant {
  id: string;
  menuItemId: string;
  name: string;
  priceDeltaMinor: number;
  isActive: boolean;
}

export interface OrderItemModifierView {
  id: string;
  modifierId: string;
  quantity: number;
  unitPriceMinor: number;
}

export interface OrderItemView {
  id: string;
  menuItemId: string;
  variantId: string | null;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  notes: string | null;
  kitchenStatus: "PENDING" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";
  modifiers: OrderItemModifierView[];
  comboId: string | null;
  comboName: string | null;
}

export interface OrderView {
  id: string;
  publicOrderId: string;
  branchId: string;
  source: string;
  orderType: "DINE_IN" | "TAKEAWAY" | "DELIVERY" | "SELF_ORDER";
  tableId: string | null;
  waiterUserId: string | null;
  status: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  serviceChargeMinor: number;
  totalMinor: number;
  offerId: string | null;
  createdAt: number;
  items: OrderItemView[];
}

export const tablesApi = {
  list: () => api.get<RestaurantTable[]>("/tables"),
  setStatus: (id: string, status: RestaurantTable["status"]) =>
    api.post<RestaurantTable>(`/tables/${id}/status`, { status }),
};

export const menuApi = {
  categories: () => api.get<Category[]>("/menu/categories"),
  items: (categoryId?: string) => api.get<MenuItem[]>(`/menu/items${categoryId ? `?categoryId=${categoryId}` : ""}`),
  variants: (menuItemId: string) => api.get<MenuVariant[]>(`/menu/items/${menuItemId}/variants`),
  setAvailability: (menuItemId: string, available: boolean, reason?: string) =>
    api.post<MenuItem>(`/menu/items/${menuItemId}/availability`, { available, reason }),
};

export interface CreateOrderPayload {
  source: "WAITER" | "TAKEOUT" | "SELF_ORDER" | "KIOSK" | "ONLINE";
  orderType: OrderView["orderType"];
  tableId?: string;
  customerId?: string;
  items: { menuItemId: string; variantId?: string; quantity: number; notes?: string }[];
  combos?: { comboId: string; quantity: number }[];
  offerId?: string;
  idempotencyKey: string;
}

export const ordersApi = {
  create: (payload: CreateOrderPayload) => api.post<OrderView>("/orders", payload),
  active: () => api.get<OrderView[]>("/orders/active"),
  kitchenQueue: () => api.get<OrderView[]>("/orders/kitchen-queue"),
  get: (id: string) => api.get<OrderView>(`/orders/${id}`),
  sendToKitchen: (id: string) => api.post<OrderView>(`/orders/${id}/send-to-kitchen`),
  requestBill: (id: string) => api.post<OrderView>(`/orders/${id}/request-bill`),
  setItemStatus: (orderItemId: string, status: OrderItemView["kitchenStatus"]) =>
    api.post<OrderView>(`/orders/items/${orderItemId}/status`, { status }),
};

export function formatMoney(minor: number, symbol = "৳", decimalPlaces = 2): string {
  return `${symbol}${(minor / Math.pow(10, decimalPlaces)).toFixed(decimalPlaces)}`;
}
