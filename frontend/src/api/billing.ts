import { api } from "./client";
import type { OrderView } from "./ros";

export interface Bill {
  id: string;
  orderId: string;
  billNumber: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  serviceChargeMinor: number;
  totalMinor: number;
  status: "UNPAID" | "PARTIALLY_PAID" | "PAID" | "VOIDED";
  generatedBy: string;
  generatedAt: number;
  discountReason: string | null;
  offerId: string | null;
}

export interface Payment {
  id: string;
  billId: string;
  paymentMethod: "CASH" | "CARD" | "MOBILE" | "OTHER";
  amountMinor: number;
  reference: string | null;
  receivedBy: string;
  paidAt: number;
}

export const billingApi = {
  generateBill: (
    orderId: string,
    discountMinor?: number,
    taxMinor?: number,
    serviceChargeMinor?: number,
    discountReason?: string,
    offerId?: string
  ) => api.post<Bill>("/bills", { orderId, discountMinor, taxMinor, serviceChargeMinor, discountReason, offerId }),
  getBillForOrder: (orderId: string) => api.get<Bill>(`/bills/by-order/${orderId}`),
  recordPayment: (billId: string, paymentMethod: Payment["paymentMethod"], amountMinor: number, reference?: string) =>
    api.post<{ payment: Payment; bill: Bill }>("/payments", { billId, paymentMethod, amountMinor, reference }),
  listPayments: (billId: string) => api.get<Payment[]>(`/bills/${billId}/payments`),
  completeOrder: (orderId: string) => api.post<OrderView>(`/orders/${orderId}/complete`),
  findByPublicOrderId: (publicOrderId: string) => api.get<OrderView>(`/orders/by-public-id/${publicOrderId}`),
};

export interface ReceiptItem {
  name: string;
  variantName: string | null;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  modifiers: { name: string; quantity: number }[];
}

export interface ReceiptData {
  restaurant: { name: string; logoPath: string | null; address: string | null; phone: string | null };
  orderPublicId: string;
  tableNumber: string | null;
  orderType: string;
  waiterName: string | null;
  cashierName: string | null;
  dateTimeEpochSeconds: number;
  items: ReceiptItem[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  serviceChargeMinor: number;
  totalMinor: number;
  paymentMethod: string | null;
  billStatus: string;
  billNumber: string;
  currency: { code: string; symbol: string; decimalPlaces: number };
}

export const receiptsApi = {
  customerText: (orderId: string) => api.getText(`/receipts/customer/${orderId}/text`),
  customerData: (orderId: string) => api.get<ReceiptData>(`/receipts/customer/${orderId}/data`),
};
