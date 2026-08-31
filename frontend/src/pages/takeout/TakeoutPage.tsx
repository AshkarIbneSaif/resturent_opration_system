import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { menuApi, ordersApi, formatMoney } from "../../api/ros";
import type { MenuItem } from "../../api/ros";
import { customersApi } from "../../api/customers";
import { useAuthStore } from "../../store/authStore";
import { useRealtimeSync } from "../../lib/useRealtimeSync";

interface CartLine {
  menuItem: MenuItem;
  quantity: number;
}

export default function TakeoutPage() {
  useRealtimeSync();
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: categories } = useQuery({ queryKey: ["menu", "categories"], queryFn: menuApi.categories });
  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(undefined);
  const effectiveCategoryId = activeCategoryId ?? categories?.[0]?.id;
  const { data: items } = useQuery({
    queryKey: ["menu", "items", effectiveCategoryId],
    queryFn: () => menuApi.items(effectiveCategoryId),
    enabled: !!effectiveCategoryId,
  });

  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [lastPublicOrderId, setLastPublicOrderId] = useState<string | null>(null);

  function addToCart(item: MenuItem) {
    if (!item.kitchenAvailable || !item.isActive) return;
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItem.id === item.id);
      if (existing) return prev.map((l) => (l.menuItem.id === item.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { menuItem: item, quantity: 1 }];
    });
  }

  function changeQuantity(itemId: string, delta: number) {
    setCart((prev) => prev.map((l) => (l.menuItem.id === itemId ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0));
  }

  const totalMinor = useMemo(() => cart.reduce((sum, l) => sum + l.menuItem.basePriceMinor * l.quantity, 0), [cart]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      let customerId: string | undefined;
      if (customerName || customerPhone) {
        const customer = await customersApi.create({ name: customerName || undefined, phone: customerPhone || undefined });
        customerId = customer.id;
      }
      const order = await ordersApi.create({
        source: "TAKEOUT",
        orderType: "TAKEAWAY",
        customerId,
        items: cart.map((l) => ({ menuItemId: l.menuItem.id, quantity: l.quantity })),
        idempotencyKey: `takeout-${Date.now()}-${Math.random()}`,
      });
      await ordersApi.sendToKitchen(order.id);
      return order;
    },
    onSuccess: (order) => {
      setLastPublicOrderId(order.publicOrderId);
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <h1 className="font-display text-lg text-paper">Takeout</h1>
        <div className="flex items-center gap-3">
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

      <div className="flex flex-col lg:flex-row flex-1">
        <nav className="flex lg:flex-col overflow-x-auto lg:w-48 border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0">
          {categories?.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategoryId(cat.id)}
              className={`tap-target px-4 py-3 text-left whitespace-nowrap text-sm font-medium border-b-2 lg:border-b-0 lg:border-l-4 ${
                effectiveCategoryId === cat.id ? "border-ember text-paper bg-slate-800" : "border-transparent text-slate-600"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </nav>

        <div className="flex-1 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items?.map((item) => {
              const unavailable = !item.kitchenAvailable || !item.isActive;
              return (
                <button
                  key={item.id}
                  disabled={unavailable}
                  onClick={() => addToCart(item)}
                  className={`docket ${unavailable ? "docket-urgent opacity-60" : "docket-neutral"} p-3 text-left tap-target disabled:cursor-not-allowed`}
                >
                  <div className="font-medium text-paper">{item.name}</div>
                  <div className="text-ember font-mono text-sm mt-1">{formatMoney(item.basePriceMinor)}</div>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="lg:w-96 border-t lg:border-t-0 lg:border-l border-slate-800 bg-slate-900 p-4 space-y-3">
          <h2 className="font-display text-lg text-paper">New Takeaway Order</h2>

          <div className="space-y-2">
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name (optional)"
              className="w-full tap-target bg-slate-800 border border-slate-700 rounded-md px-3 text-paper"
            />
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Phone (optional)"
              className="w-full tap-target bg-slate-800 border border-slate-700 rounded-md px-3 text-paper"
            />
          </div>

          <div className="space-y-2">
            {cart.map((line) => (
              <div key={line.menuItem.id} className="docket docket-pending p-2 flex justify-between items-center">
                <span className="text-sm text-paper">{line.menuItem.name}</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => changeQuantity(line.menuItem.id, -1)} className="tap-target w-7 h-7 bg-slate-700 rounded text-sm">
                    −
                  </button>
                  <span className="w-5 text-center text-sm">{line.quantity}</span>
                  <button onClick={() => changeQuantity(line.menuItem.id, 1)} className="tap-target w-7 h-7 bg-slate-700 rounded text-sm">
                    +
                  </button>
                </div>
              </div>
            ))}
            {cart.length === 0 && <p className="text-slate-600 text-sm">Cart is empty.</p>}
          </div>

          <div className="flex justify-between items-baseline border-t border-slate-800 pt-2">
            <span className="text-slate-600 text-sm">Total</span>
            <span className="font-mono text-lg text-paper">{formatMoney(totalMinor)}</span>
          </div>

          <button
            disabled={cart.length === 0 || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
            className="w-full tap-target bg-ember hover:bg-ember-dark disabled:opacity-40 text-slate-950 font-semibold rounded-md"
          >
            {submitMutation.isPending ? "Sending…" : "Send to Kitchen"}
          </button>

          {lastPublicOrderId && (
            <p className="text-sage text-sm text-center">
              Order #{lastPublicOrderId} sent — hand this number to the customer for pickup.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
