import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ordersApi, tablesApi, formatMoney } from "../../api/ros";
import type { OrderView } from "../../api/ros";
import { api } from "../../api/client";
import { WaiterShell } from "./WaiterShell";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
  SENT_TO_KITCHEN: "Sent to kitchen",
  PREPARING: "Preparing",
  READY: "Ready to serve",
  SERVED: "Served",
  BILL_REQUESTED: "Bill requested",
  BILLED: "Billed",
  PAID: "Paid",
  COMPLETED: "Completed",
};

function statusDocketClass(status: string): string {
  if (status === "READY") return "docket-ready";
  if (status === "BILL_REQUESTED") return "docket-urgent";
  if (status === "SENT_TO_KITCHEN" || status === "PREPARING") return "docket-pending";
  return "docket-neutral";
}

function OrderCard({ order }: { order: OrderView }) {
  const { data: tables } = useQuery({ queryKey: ["tables"], queryFn: tablesApi.list });
  const table = tables?.find((t) => t.id === order.tableId);
  const queryClient = useQueryClient();

  const requestBillMutation = useMutation({
    mutationFn: () => ordersApi.requestBill(order.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["tables"] });
    },
  });

  const markServedMutation = useMutation({
    mutationFn: () => api.post(`/orders/${order.id}/status`, { status: "SERVED" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  const canMarkServed = order.status === "READY";
  const canRequestBill = order.status === "SERVED";
  const readyCount = order.items.filter((i) => i.kitchenStatus === "READY" || i.kitchenStatus === "SERVED").length;

  return (
    <div className={`docket ${statusDocketClass(order.status)} p-4`}>
      <div className="flex justify-between items-start">
        <div>
          <div className="font-mono text-sm text-slate-600">ORDER #{order.publicOrderId}</div>
          <div className="font-display text-xl text-paper">{table ? `Table ${table.tableNumber}` : order.orderType}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-paper">{STATUS_LABEL[order.status] ?? order.status}</div>
          <div className="font-mono text-ember">{formatMoney(order.subtotalMinor)}</div>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm">
            <span className="text-slate-600">
              {item.quantity}x item
              {item.kitchenStatus === "READY" && <span className="text-sage ml-2">● ready</span>}
              {item.kitchenStatus === "PREPARING" && <span className="text-ember ml-2">● preparing</span>}
              {item.kitchenStatus === "PENDING" && <span className="text-slate-600 ml-2">● pending</span>}
            </span>
          </div>
        ))}
      </div>

      {order.status === "PREPARING" && (
        <p className="text-xs text-slate-600 mt-2">
          {readyCount}/{order.items.length} items ready
        </p>
      )}

      {canMarkServed && (
        <button
          onClick={() => markServedMutation.mutate()}
          disabled={markServedMutation.isPending}
          className="mt-3 w-full tap-target bg-sage hover:bg-sage-dark disabled:opacity-40 text-slate-950 font-semibold rounded-md"
        >
          {markServedMutation.isPending ? "Marking…" : "Mark Served"}
        </button>
      )}
      {canRequestBill && (
        <button
          onClick={() => requestBillMutation.mutate()}
          disabled={requestBillMutation.isPending}
          className="mt-3 w-full tap-target bg-ember hover:bg-ember-dark disabled:opacity-40 text-slate-950 font-semibold rounded-md"
        >
          {requestBillMutation.isPending ? "Requesting…" : "Request Bill"}
        </button>
      )}
      {order.status === "BILL_REQUESTED" && (
        <p className="text-center text-sm text-brick mt-3 font-medium">Waiting for cashier…</p>
      )}
    </div>
  );
}

export default function WaiterOrdersPage() {
  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders", "active"],
    queryFn: ordersApi.active,
    refetchInterval: 10000,
  });

  return (
    <WaiterShell title="My Orders">
      <div className="p-4">
        {isLoading && <p className="text-slate-600">Loading orders…</p>}
        {orders?.length === 0 && !isLoading && (
          <p className="text-slate-600">No active orders. Head to Tables to start one.</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {orders?.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      </div>
    </WaiterShell>
  );
}
