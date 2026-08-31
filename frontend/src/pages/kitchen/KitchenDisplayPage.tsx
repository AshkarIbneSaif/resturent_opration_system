import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ordersApi, menuApi } from "../../api/ros";
import type { OrderView, OrderItemView, MenuItem, Category } from "../../api/ros";
import { useAuthStore } from "../../store/authStore";
import { useRealtimeSync } from "../../lib/useRealtimeSync";
import { useNavigate } from "react-router-dom";

function elapsedMinutes(createdAtEpochSeconds: number): number {
  return Math.floor((Date.now() / 1000 - createdAtEpochSeconds) / 60);
}

function NextStatusButton({ item }: { item: OrderItemView }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (status: OrderItemView["kitchenStatus"]) => ordersApi.setItemStatus(item.id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  if (item.kitchenStatus === "PENDING") {
    return (
      <button
        onClick={() => mutation.mutate("PREPARING")}
        disabled={mutation.isPending}
        className="tap-target w-full bg-ember hover:bg-ember-dark disabled:opacity-40 text-slate-950 font-semibold rounded-md text-sm"
      >
        Start
      </button>
    );
  }
  if (item.kitchenStatus === "PREPARING") {
    return (
      <button
        onClick={() => mutation.mutate("READY")}
        disabled={mutation.isPending}
        className="tap-target w-full bg-sage hover:bg-sage-dark disabled:opacity-40 text-slate-950 font-semibold rounded-md text-sm"
      >
        Mark Ready
      </button>
    );
  }
  if (item.kitchenStatus === "READY") {
    return <div className="text-center text-sage font-medium text-sm py-2">✓ Ready</div>;
  }
  return <div className="text-center text-slate-600 text-sm py-2">{item.kitchenStatus}</div>;
}

function KitchenOrderCard({ order, itemNameById }: { order: OrderView; itemNameById: Map<string, string> }) {
  const minutes = elapsedMinutes(order.createdAt);
  const urgent = minutes >= 15;
  const allReady = order.items.every((i) => i.kitchenStatus === "READY" || i.kitchenStatus === "SERVED");

  return (
    <div className={`docket ${urgent ? "docket-urgent" : allReady ? "docket-ready" : "docket-pending"} p-4 flex flex-col`}>
      <div className="flex justify-between items-start mb-1">
        <div className="font-mono text-lg font-semibold text-paper">#{order.publicOrderId}</div>
        <div className={`font-mono text-sm ${urgent ? "text-brick" : "text-slate-600"}`}>{minutes}m</div>
      </div>
      <div className="text-sm text-slate-600 mb-3">{order.orderType === "DINE_IN" ? "Dine-in" : order.orderType}</div>

      <div className="space-y-2 flex-1">
        {order.items.map((item) => (
          <div key={item.id} className="bg-slate-900/60 rounded-md p-2">
            <div className="flex justify-between items-baseline mb-1">
              <span className="font-medium text-paper text-sm">
                {item.quantity}x {itemNameById.get(item.menuItemId) ?? "item"}
              </span>
              {item.comboName && <span className="text-xs text-sage shrink-0 ml-2">· {item.comboName}</span>}
            </div>
            {item.notes && <p className="text-xs text-ember italic mb-1">Note: {item.notes}</p>}
          <NextStatusButton item={item} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AvailabilityRow({ item }: { item: MenuItem }) {
  const queryClient = useQueryClient();
  const [showReasonFor, setShowReasonFor] = useState(false);
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: (input: { available: boolean; reason?: string }) =>
      menuApi.setAvailability(item.id, input.available, input.reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["menu", "items"] });
      setShowReasonFor(false);
      setReason("");
    },
  });

  function markUnavailable() {
    if (!showReasonFor) {
      setShowReasonFor(true);
      return;
    }
    mutation.mutate({ available: false, reason: reason.trim() || undefined });
  }

  return (
    <div className="bg-slate-900/60 rounded-md p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-paper font-medium">{item.name}</div>
          <div className={`text-xs ${item.kitchenAvailable ? "text-sage" : "text-brick"}`}>
            {item.kitchenAvailable ? "Available" : "86'd — out of stock"}
          </div>
        </div>
        {item.kitchenAvailable ? (
          <button
            onClick={markUnavailable}
            disabled={mutation.isPending}
            className="tap-target px-3 bg-brick hover:bg-brick/80 disabled:opacity-40 text-paper font-semibold rounded-md text-sm shrink-0"
          >
            Mark Unavailable
          </button>
        ) : (
          <button
            onClick={() => mutation.mutate({ available: true })}
            disabled={mutation.isPending}
            className="tap-target px-3 bg-sage hover:bg-sage-dark disabled:opacity-40 text-slate-950 font-semibold rounded-md text-sm shrink-0"
          >
            Turn Back On
          </button>
        )}
      </div>
      {showReasonFor && (
        <div className="flex gap-2 mt-2">
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && markUnavailable()}
            placeholder="Reason (optional) — e.g. ran out of chicken"
            className="flex-1 tap-target bg-slate-800 border border-slate-700 rounded-md px-3 text-paper text-sm"
          />
          <button
            onClick={markUnavailable}
            disabled={mutation.isPending}
            className="tap-target px-3 bg-brick hover:bg-brick/80 disabled:opacity-40 text-paper font-semibold rounded-md text-sm"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

function AvailabilityModal({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState("");
  const { data: categories } = useQuery({ queryKey: ["menu", "categories"], queryFn: menuApi.categories });
  const { data: items, isLoading } = useQuery({ queryKey: ["menu", "items", "all"], queryFn: () => menuApi.items() });

  const categoryNameById = new Map((categories ?? []).map((c: Category) => [c.id, c.name]));
  const filtered = (items ?? []).filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
  const outOfStockCount = (items ?? []).filter((i) => !i.kitchenAvailable).length;

  return (
    <div className="fixed inset-0 z-20 bg-slate-950/80 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="docket docket-neutral w-full max-w-lg p-4 my-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-lg text-paper">Item Availability</h2>
          <button onClick={onClose} className="tap-target px-3 rounded-md bg-slate-800 hover:bg-slate-700 text-sm">
            Close
          </button>
        </div>
        <p className="text-slate-600 text-sm mb-3">
          Mark an item unavailable to stop waiters and takeout from ordering it while you're out of stock.
          {outOfStockCount > 0 && <span className="text-brick"> {outOfStockCount} item{outOfStockCount === 1 ? "" : "s"} currently 86'd.</span>}
        </p>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items…"
          className="w-full tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper mb-3"
        />
        {isLoading && <p className="text-slate-600 text-sm">Loading items…</p>}
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {filtered.map((item) => (
            <div key={item.id}>
              <div className="text-xs text-slate-600 mb-0.5">{categoryNameById.get(item.categoryId) ?? ""}</div>
              <AvailabilityRow item={item} />
            </div>
          ))}
          {!isLoading && filtered.length === 0 && <p className="text-slate-600 text-sm">No items match.</p>}
        </div>
      </div>
    </div>
  );
}

export default function KitchenDisplayPage() {
  useRealtimeSync();
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [showAvailability, setShowAvailability] = useState(false);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders", "kitchen-queue"],
    queryFn: ordersApi.kitchenQueue,
    refetchInterval: 8000,
  });

  const { data: allItemsForNames } = useQuery({ queryKey: ["menu", "items", "all"], queryFn: () => menuApi.items() });
  const itemNameById = new Map((allItemsForNames ?? []).map((i) => [i.id, i.name]));

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <h1 className="font-display text-lg text-paper">Kitchen Display</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAvailability(true)}
            className="tap-target px-3 rounded-md bg-ember hover:bg-ember-dark text-slate-950 font-semibold text-sm"
          >
            Item Availability
          </button>
          <span className="text-sm text-slate-600">{session?.user.displayName}</span>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="tap-target px-3 rounded-md bg-slate-800 hover:bg-slate-700 text-sm"
          >
            Log out
          </button>
        </div>
      </header>
      <main className="flex-1 p-4">
        {isLoading && <p className="text-slate-600">Loading queue…</p>}
        {orders?.length === 0 && !isLoading && <p className="text-slate-600 text-lg">No active orders. Kitchen is clear.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {orders?.map((order) => (
            <KitchenOrderCard key={order.id} order={order} itemNameById={itemNameById} />
          ))}
        </div>
      </main>
      {showAvailability && <AvailabilityModal onClose={() => setShowAvailability(false)} />}
    </div>
  );
}
