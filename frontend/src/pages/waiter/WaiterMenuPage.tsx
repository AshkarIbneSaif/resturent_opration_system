import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { menuApi, ordersApi, tablesApi, formatMoney } from "../../api/ros";
import type { MenuItem } from "../../api/ros";
import { offersApi, combosApi } from "../../api/offers";
import type { Offer, Combo } from "../../api/offers";
import { WaiterShell } from "./WaiterShell";

interface ItemCartLine {
  type: "item";
  key: string;
  menuItem: MenuItem;
  unitPriceMinor: number;
  quantity: number;
  notes?: string;
}

interface ComboCartLine {
  type: "combo";
  key: string;
  combo: Combo;
  quantity: number;
}

type CartLine = ItemCartLine | ComboCartLine;

/** Combos & offers already come from the `activeOnly=true` list, but that filter is computed once per request — double-check the window client-side too so a card doesn't linger visibly stale for the few seconds between refetches. */
function isCurrentlyActive(startsAt: number | null, endsAt: number | null): boolean {
  const now = Math.floor(Date.now() / 1000);
  if (startsAt && startsAt > now) return false;
  if (endsAt && endsAt <= now) return false;
  return true;
}

export default function WaiterMenuPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: tables } = useQuery({ queryKey: ["tables"], queryFn: tablesApi.list });
  const table = tables?.find((t) => t.id === tableId);

  const { data: categories } = useQuery({ queryKey: ["menu", "categories"], queryFn: menuApi.categories });
  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(undefined);
  const effectiveCategoryId = activeCategoryId ?? categories?.[0]?.id;

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: ["menu", "items", effectiveCategoryId],
    queryFn: () => menuApi.items(effectiveCategoryId),
    enabled: !!effectiveCategoryId,
  });
  const { data: allItems } = useQuery({ queryKey: ["menu", "items", "all"], queryFn: () => menuApi.items() });
  const itemById = useMemo(() => new Map((allItems ?? []).map((i) => [i.id, i])), [allItems]);

  // Fetched unconditionally (not gated behind a separate tab) so the Combos
  // & Offers strip is always visible together with whichever category the
  // waiter is browsing — one tap adds it, no navigating away first.
  const { data: combos, isError: combosError } = useQuery({ queryKey: ["combos", "active"], queryFn: () => combosApi.list(true) });
  const { data: offers, isError: offersError } = useQuery({ queryKey: ["offers", "active"], queryFn: () => offersApi.list(true) });
  const activeCombos = (combos ?? []).filter((c) => c.isActive && isCurrentlyActive(c.startsAt, c.endsAt));
  const activeOffers = (offers ?? []).filter((o) => o.isActive && isCurrentlyActive(o.startsAt, o.endsAt));

  const [cart, setCart] = useState<CartLine[]>([]);
  const [notesDraftFor, setNotesDraftFor] = useState<string | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<Offer | undefined>(undefined);
  const [justAddedKey, setJustAddedKey] = useState<string | null>(null);

  function flashAdded(key: string) {
    setJustAddedKey(key);
    setTimeout(() => setJustAddedKey((cur) => (cur === key ? null : cur)), 700);
  }

  function addToCart(item: MenuItem, quantity = 1) {
    if (!item.kitchenAvailable || !item.isActive) return;
    setCart((prev) => {
      const key = `item:${item.id}`;
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l));
      }
      const line: ItemCartLine = { type: "item", key, menuItem: item, unitPriceMinor: item.basePriceMinor, quantity };
      return [...prev, line];
    });
    flashAdded(`item:${item.id}`);
  }

  function addComboToCart(combo: Combo) {
    setCart((prev) => {
      const key = `combo:${combo.id}`;
      const existing = prev.find((l) => l.key === key);
      if (existing) return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      const line: ComboCartLine = { type: "combo", key, combo, quantity: 1 };
      return [...prev, line];
    });
    flashAdded(`combo:${combo.id}`);
  }

  function applyOffer(offer: Offer) {
    for (const oi of offer.items) {
      const menuItem = itemById.get(oi.menuItemId);
      if (menuItem) addToCart(menuItem, oi.quantity);
    }
    setSelectedOffer(offer);
    flashAdded(`offer:${offer.id}`);
  }

  function changeQuantity(key: string, delta: number) {
    setCart((prev) =>
      prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0)
    );
  }

  function setNotes(key: string, notes: string) {
    setCart((prev) => prev.map((l) => (l.type === "item" && l.key === key ? { ...l, notes } : l)));
  }

  const cartTotalMinor = useMemo(
    () =>
      cart.reduce((sum, l) => sum + (l.type === "item" ? l.unitPriceMinor * l.quantity : l.combo.priceMinor * l.quantity), 0),
    [cart]
  );
  const cartCount = useMemo(() => cart.reduce((sum, l) => sum + (l.type === "item" ? l.quantity : 1), 0), [cart]);

  const idempotencyKeyRef = useState(() => `waiter-${tableId}-${Date.now()}-${Math.random()}`)[0];

  const createOrderMutation = useMutation({
    mutationFn: () =>
      ordersApi.create({
        source: "WAITER",
        orderType: "DINE_IN",
        tableId,
        items: cart
          .filter((l): l is ItemCartLine => l.type === "item")
          .map((l) => ({ menuItemId: l.menuItem.id, quantity: l.quantity, notes: l.notes })),
        combos: cart
          .filter((l): l is ComboCartLine => l.type === "combo")
          .map((l) => ({ comboId: l.combo.id, quantity: l.quantity })),
        offerId: selectedOffer?.id,
        idempotencyKey: idempotencyKeyRef,
      }),
    onSuccess: async (order) => {
      await ordersApi.sendToKitchen(order.id);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["tables"] });
      navigate("/waiter/orders");
    },
  });

  return (
    <WaiterShell title={table ? `Table ${table.tableNumber}` : "Menu"}>
      <div className="flex flex-col lg:flex-row h-[calc(100vh-56px)]">
        {/* Category rail */}
        <nav className="flex lg:flex-col overflow-x-auto lg:overflow-visible lg:w-48 border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0">
          {categories?.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategoryId(cat.id)}
              className={`tap-target px-4 py-3 text-left whitespace-nowrap text-sm font-medium border-b-2 lg:border-b-0 lg:border-l-4 transition-colors ${
                effectiveCategoryId === cat.id ? "border-ember text-paper bg-slate-800" : "border-transparent text-slate-600 hover:text-paper"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </nav>

        {/* Combos & Offers strip + Item grid, together in the same scroll area */}
        <div className="flex-1 overflow-y-auto p-4">
          {(activeCombos.length > 0 || activeOffers.length > 0) && (
            <div className="mb-5 space-y-3">
              {activeCombos.length > 0 && (
                <div>
                  <h3 className="text-sage text-xs font-semibold uppercase tracking-wide mb-2">Combos — one tap to add</h3>
                  <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
                    {activeCombos.map((combo) => {
                      const key = `combo:${combo.id}`;
                      return (
                        <button
                          key={combo.id}
                          onClick={() => addComboToCart(combo)}
                          className={`docket docket-neutral border-l-4 border-sage p-3 text-left tap-target active:scale-[0.98] transition-transform shrink-0 w-64 ${
                            justAddedKey === key ? "ring-2 ring-sage" : ""
                          }`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <span className="font-medium text-paper leading-snug">{combo.name}</span>
                            <span className="text-sage font-mono text-sm shrink-0">{formatMoney(combo.priceMinor)}</span>
                          </div>
                          {combo.description && <div className="text-slate-600 text-xs mt-0.5">{combo.description}</div>}
                          <div className="text-slate-600 text-xs mt-1.5">
                            {combo.items.map((ci) => `${ci.quantity}x ${itemById.get(ci.menuItemId)?.name ?? "item"}`).join(" + ")}
                          </div>
                          {justAddedKey === key && <div className="text-sage text-xs font-medium mt-1.5">Added ✓</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeOffers.length > 0 && (
                <div>
                  <h3 className="text-ember text-xs font-semibold uppercase tracking-wide mb-2">Offers — one tap to add</h3>
                  <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
                    {activeOffers.map((offer) => {
                      const key = `offer:${offer.id}`;
                      return (
                        <button
                          key={offer.id}
                          onClick={() => applyOffer(offer)}
                          className={`docket docket-neutral border-l-4 border-ember p-3 text-left tap-target active:scale-[0.98] transition-transform shrink-0 w-64 ${
                            justAddedKey === key ? "ring-2 ring-ember" : ""
                          }`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <span className="font-medium text-paper leading-snug">{offer.name}</span>
                            <span className="text-ember font-mono text-sm shrink-0">
                              {offer.discountType === "PERCENTAGE" ? `${offer.discountValue / 100}% off` : `${formatMoney(offer.discountValue)} off`}
                            </span>
                          </div>
                          {offer.description && <div className="text-slate-600 text-xs mt-0.5">{offer.description}</div>}
                          <div className="text-slate-600 text-xs mt-1.5">
                            {offer.items.map((oi) => `${oi.quantity}x ${itemById.get(oi.menuItemId)?.name ?? "item"}`).join(" + ")}
                          </div>
                          {justAddedKey === key && <div className="text-ember text-xs font-medium mt-1.5">Added ✓</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {(combosError || offersError) && (
            <p className="text-brick text-xs mb-3">Couldn't load combos/offers — check your connection and try again.</p>
          )}

          {itemsLoading && <p className="text-slate-600">Loading menu…</p>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items?.map((item) => {
              const unavailable = !item.kitchenAvailable || !item.isActive;
              const key = `item:${item.id}`;
              return (
                <button
                  key={item.id}
                  disabled={unavailable}
                  onClick={() => addToCart(item)}
                  className={`docket ${unavailable ? "docket-urgent opacity-60" : "docket-neutral"} p-3 text-left tap-target active:scale-[0.98] transition-transform disabled:cursor-not-allowed ${
                    justAddedKey === key ? "ring-2 ring-ember" : ""
                  }`}
                >
                  <div className="font-medium text-paper leading-snug">{item.name}</div>
                  <div className="text-ember font-mono text-sm mt-1">{formatMoney(item.basePriceMinor)}</div>
                  {unavailable && <div className="text-brick text-xs mt-1 font-medium">Unavailable</div>}
                  {justAddedKey === key && <div className="text-ember text-xs font-medium mt-1">Added ✓</div>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Cart */}
        <aside className="lg:w-96 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col bg-slate-900">
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            <h2 className="font-display text-lg text-paper mb-2">Current Order</h2>

            {selectedOffer && (
              <div className="flex items-center justify-between bg-ember/10 border border-ember/40 rounded-md px-3 py-2 mb-2">
                <span className="text-ember text-xs font-medium">Offer tagged: {selectedOffer.name}</span>
                <button onClick={() => setSelectedOffer(undefined)} className="text-slate-600 hover:text-brick text-xs">
                  Remove
                </button>
              </div>
            )}

            {cart.length === 0 && <p className="text-slate-600 text-sm">Tap items, combos, or offers to add them.</p>}

            {cart.map((line) =>
              line.type === "combo" ? (
                <div key={line.key} className="docket docket-pending p-3 border-l-4 border-sage">
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-paper">{line.combo.name} (combo)</span>
                    <span className="font-mono text-sm text-sage">{formatMoney(line.combo.priceMinor * line.quantity)}</span>
                  </div>
                  <div className="text-slate-600 text-xs mt-1">
                    {line.combo.items.map((ci) => `${ci.quantity}x ${itemById.get(ci.menuItemId)?.name ?? "item"}`).join(", ")}
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => changeQuantity(line.key, -1)}
                      className="tap-target w-8 h-8 flex items-center justify-center bg-slate-700 rounded-md text-lg"
                    >
                      −
                    </button>
                    <span className="w-6 text-center">{line.quantity}</span>
                    <button
                      onClick={() => changeQuantity(line.key, 1)}
                      className="tap-target w-8 h-8 flex items-center justify-center bg-slate-700 rounded-md text-lg"
                    >
                      +
                    </button>
                  </div>
                </div>
              ) : (
                <div key={line.key} className="docket docket-pending p-3">
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-paper">{line.menuItem.name}</span>
                    <span className="font-mono text-sm text-ember">{formatMoney(line.unitPriceMinor * line.quantity)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => changeQuantity(line.key, -1)}
                        className="tap-target w-8 h-8 flex items-center justify-center bg-slate-700 rounded-md text-lg"
                      >
                        −
                      </button>
                      <span className="w-6 text-center">{line.quantity}</span>
                      <button
                        onClick={() => changeQuantity(line.key, 1)}
                        className="tap-target w-8 h-8 flex items-center justify-center bg-slate-700 rounded-md text-lg"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => setNotesDraftFor(notesDraftFor === line.key ? null : line.key)}
                      className="text-xs text-slate-600 hover:text-paper underline"
                    >
                      {line.notes ? "Edit note" : "Add note"}
                    </button>
                  </div>
                  {notesDraftFor === line.key && (
                    <input
                      autoFocus
                      value={line.notes ?? ""}
                      onChange={(e) => setNotes(line.key, e.target.value)}
                      onBlur={() => setNotesDraftFor(null)}
                      placeholder="e.g. no onion"
                      className="w-full mt-2 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm"
                    />
                  )}
                  {line.notes && notesDraftFor !== line.key && <p className="text-xs text-slate-600 mt-1 italic">“{line.notes}”</p>}
                </div>
              )
            )}
          </div>

          <div className="border-t border-slate-800 p-4 space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-slate-600 text-sm">Subtotal ({cartCount} items)</span>
              <span className="font-mono text-lg text-paper">{formatMoney(cartTotalMinor)}</span>
            </div>
            {createOrderMutation.isError && (
              <p className="text-brick text-sm">{(createOrderMutation.error as any)?.message ?? "Could not send order."}</p>
            )}
            <button
              disabled={cart.length === 0 || createOrderMutation.isPending}
              onClick={() => createOrderMutation.mutate()}
              className="w-full tap-target bg-ember hover:bg-ember-dark disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-semibold rounded-md"
            >
              {createOrderMutation.isPending ? "Sending…" : "Send to Kitchen"}
            </button>
          </div>
        </aside>
      </div>
    </WaiterShell>
  );
}
