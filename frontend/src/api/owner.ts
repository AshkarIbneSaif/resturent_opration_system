import { api } from "./client";

export interface Restaurant {
  id: string;
  name: string;
  logoPath: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export interface StaffUser {
  id: string;
  username: string;
  displayName: string;
  roleId: string;
  isActive: boolean;
  lastLoginAt: number | null;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userId: string | null;
  createdAt: number;
  oldValueJson: string | null;
  newValueJson: string | null;
}

export interface SalesReport {
  transactionCount: number;
  paidOrderCount: number;
  totalRevenueMinor: number;
  paymentMethodBreakdown: Record<string, number>;
}

export const ownerApi = {
  getRestaurant: () => api.get<Restaurant>("/restaurant"),
  updateRestaurant: (input: Partial<Pick<Restaurant, "name" | "address" | "phone" | "email">>, criticalConfirmation: string) =>
    api.patch<Restaurant>("/restaurant", { ...input, criticalConfirmation }),

  listUsers: () => api.get<StaffUser[]>("/users"),
  createUser: (input: { username: string; displayName: string; roleName: string; password: string }) =>
    api.post<StaffUser>("/users", input),
  disableUser: (id: string) => api.post<StaffUser>(`/users/${id}/disable`),
  enableUser: (id: string) => api.post<StaffUser>(`/users/${id}/enable`),

  listAuditLogs: () => api.get<AuditLogEntry[]>("/audit"),
  salesReport: () => api.get<SalesReport>("/reports/sales"),
};
