import { api } from "./client";
import type { Category, MenuItem, RestaurantTable } from "./ros";

export const managerApi = {
  createCategory: (name: string, sortOrder = 0) => api.post<Category>("/menu/categories", { name, sortOrder }),
  updateCategory: (id: string, input: Partial<Pick<Category, "name" | "sortOrder" | "isActive">>) =>
    api.patch<Category>(`/menu/categories/${id}`, input),

  deleteCategory: (id: string) => api.delete<{ deleted: true; id: string }>(`/menu/categories/${id}`),

  createMenuItem: (input: { categoryId: string; name: string; description?: string; basePriceMinor: number }) =>
    api.post<MenuItem>("/menu/items", input),
  updateMenuItem: (id: string, input: Partial<{ name: string; description: string; basePriceMinor: number; isActive: boolean }>) =>
    api.patch<MenuItem>(`/menu/items/${id}`, input),
  deleteMenuItem: (id: string) => api.delete<{ deleted: true; id: string }>(`/menu/items/${id}`),

  createTable: (tableNumber: string, capacity: number) =>
    api.post<RestaurantTable>("/tables", { tableNumber, capacity }),
  updateTable: (id: string, input: Partial<{ capacity: number; isActive: boolean }>) =>
    api.patch<RestaurantTable>(`/tables/${id}`, input),
};
