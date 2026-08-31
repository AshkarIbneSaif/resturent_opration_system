import { api } from "./client";

export interface Customer {
  id: string;
  branchId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}

export const customersApi = {
  list: () => api.get<Customer[]>("/customers"),
  create: (input: { name?: string; phone?: string; email?: string }) => api.post<Customer>("/customers", input),
};
