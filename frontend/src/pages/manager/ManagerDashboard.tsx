import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { menuApi, tablesApi, formatMoney } from "../../api/ros";
import type { MenuItem } from "../../api/ros";
import { managerApi } from "../../api/manager";
import { offersApi, combosApi } from "../../api/offers";
import type { Offer, Combo, OfferComboItem } from "../../api/offers";
import { useAuthStore } from "../../store/authStore";
import { ApiClientError } from "../../api/client";

type Tab = "menu" | "tables" | "offers";

function Shell({ tab, setTab, children }: { tab: Tab; setTab: (t: Tab) => void; children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-lg text-paper">Manager</h1>
          <nav className="flex gap-1">
            {(["menu", "tables", "offers"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`tap-target px-3 rounded-md text-sm font-medium capitalize ${
                  tab === t ? "bg-ember text-slate-950" : "bg-slate-800 text-slate-600"
                }`}
              >
                {t === "offers" ? "Offers & Combos" : t}
              </button>
            ))}
          </nav>
        </div>
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
      <main className="flex-1 p-4 max-w-4xl mx-auto w-full">{children}</main>
    </div>
  );
}

// ---------------------------------------------------------------------
// Menu management (categories + items, incl. delete, incl. out-of-stock mirror)
// ---------------------------------------------------------------------

function OutOfStockPanel({ items }: { items: MenuItem[] }) {
  const outOfStock = items.filter((i) => !i.kitchenAvailable);
  if (outOfStock.length === 0) return null;
  return (
    <section className="docket docket-urgent p-4">
      <h2 className="font-display text-lg text-paper mb-1">Out of Stock ({outOfStock.length})</h2>
      <p className="text-slate-600 text-sm mb-3">
        Marked unavailable by Kitchen. This is read-only here — Kitchen turns items back on from their screen.
      </p>
      <div className="space-y-1.5">
        {outOfStock.map((item) => (
          <div key={item.id} className="flex items-center justify-between bg-slate-900/60 rounded-md px-3 py-2">
            <span className="text-paper text-sm font-medium">{item.name}</span>
            <span className="text-brick text-xs">86'd</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MenuManagement() {
  const queryClient = useQueryClient();
  const { data: categories } = useQuery({ queryKey: ["menu", "categories"], queryFn: menuApi.categories });
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const effectiveCategoryId = selectedCategoryId ?? categories?.[0]?.id;
  const { data: items } = useQuery({
    queryKey: ["menu", "items", effectiveCategoryId],
    queryFn: () => menuApi.items(effectiveCategoryId),
    enabled: !!effectiveCategoryId,
  });
  const { data: allItems } = useQuery({ queryKey: ["menu", "items", "all"], queryFn: () => menuApi.items() });

  const [newCategoryName, setNewCategoryName] = useState("");
  const createCategoryMutation = useMutation({
    mutationFn: () => managerApi.createCategory(newCategoryName),
    onSuccess: () => {
      setNewCategoryName("");
      queryClient.invalidateQueries({ queryKey: ["menu", "categories"] });
    },
  });

  const [categoryDeleteError, setCategoryDeleteError] = useState<string | null>(null);
  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => managerApi.deleteCategory(id),
    onSuccess: () => {
      setCategoryDeleteError(null);
      if (selectedCategoryId) setSelectedCategoryId(undefined);
      queryClient.invalidateQueries({ queryKey: ["menu", "categories"] });
    },
    onError: (err) => setCategoryDeleteError(err instanceof ApiClientError ? err.message : "Could not delete category."),
  });

  function handleDeleteCategory(id: string, name: string) {
    if (!window.confirm(`Permanently delete category "${name}"? This cannot be undone.`)) return;
    deleteCategoryMutation.mutate(id);
  }

  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const createItemMutation = useMutation({
    mutationFn: () =>
      managerApi.createMenuItem({
        categoryId: effectiveCategoryId!,
        name: newItemName,
        basePriceMinor: Math.round(parseFloat(newItemPrice) * 100),
      }),
    onSuccess: () => {
      setNewItemName("");
      setNewItemPrice("");
      queryClient.invalidateQueries({ queryKey: ["menu", "items"] });
    },
  });

  const [editingPriceFor, setEditingPriceFor] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState("");
  const updatePriceMutation = useMutation({
    mutationFn: (itemId: string) =>
      managerApi.updateMenuItem(itemId, { basePriceMinor: Math.round(parseFloat(editPriceValue) * 100) }),
    onSuccess: () => {
      setEditingPriceFor(null);
      queryClient.invalidateQueries({ queryKey: ["menu", "items"] });
    },
  });

  const [itemDeleteError, setItemDeleteError] = useState<string | null>(null);
  const deleteItemMutation = useMutation({
    mutationFn: (id: string) => managerApi.deleteMenuItem(id),
    onSuccess: () => {
      setItemDeleteError(null);
      queryClient.invalidateQueries({ queryKey: ["menu", "items"] });
    },
    onError: (err) =>
      setItemDeleteError(
        err instanceof ApiClientError ? err.message : "Could not delete item."
      ),
  });

  function handleDeleteItem(id: string, name: string) {
    if (!window.confirm(`Permanently delete "${name}"? This cannot be undone.`)) return;
    setItemDeleteError(null);
    deleteItemMutation.mutate(id);
  }

  return (
    <div className="space-y-6">
      {allItems && <OutOfStockPanel items={allItems} />}

      <section className="docket docket-neutral p-4">
        <h2 className="font-display text-lg text-paper mb-3">Categories</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {categories?.map((cat) => (
            <div
              key={cat.id}
              className={`flex items-center gap-1 rounded-md text-sm ${
                effectiveCategoryId === cat.id ? "bg-ember text-slate-950" : "bg-slate-800 text-slate-400"
              }`}
            >
              <button onClick={() => setSelectedCategoryId(cat.id)} className="tap-target pl-3 pr-1">
                {cat.name}
              </button>
              <button
                onClick={() => handleDeleteCategory(cat.id, cat.name)}
                title="Delete category"
                className="tap-target px-2 hover:text-brick"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {categoryDeleteError && <p className="text-brick text-sm mb-2">{categoryDeleteError}</p>}
        <div className="flex gap-2">
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="New category name"
            className="flex-1 tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper"
          />
          <button
            onClick={() => createCategoryMutation.mutate()}
            disabled={!newCategoryName || createCategoryMutation.isPending}
            className="tap-target px-4 bg-sage hover:bg-sage-dark disabled:opacity-40 text-slate-950 font-semibold rounded-md"
          >
            Add
          </button>
        </div>
      </section>

      <section className="docket docket-neutral p-4">
        <h2 className="font-display text-lg text-paper mb-3">Items</h2>
        {itemDeleteError && <p className="text-brick text-sm mb-2">{itemDeleteError}</p>}
        <div className="space-y-2 mb-4">
          {items?.map((item) => (
            <div key={item.id} className="flex items-center justify-between bg-slate-900/60 rounded-md p-3 gap-2">
              <div className="min-w-0">
                <div className="text-paper font-medium truncate">{item.name}</div>
                {!item.kitchenAvailable && <span className="text-brick text-xs">Marked unavailable by kitchen</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {editingPriceFor === item.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      type="number"
                      step="0.01"
                      value={editPriceValue}
                      onChange={(e) => setEditPriceValue(e.target.value)}
                      className="w-24 tap-target bg-slate-800 border border-slate-700 rounded px-2 font-mono text-sm"
                    />
                    <button
                      onClick={() => updatePriceMutation.mutate(item.id)}
                      className="tap-target px-3 bg-sage text-slate-950 rounded-md text-sm font-medium"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingPriceFor(item.id);
                      setEditPriceValue((item.basePriceMinor / 100).toFixed(2));
                    }}
                    className="font-mono text-ember tap-target px-2"
                  >
                    {formatMoney(item.basePriceMinor)}
                  </button>
                )}
                <button
                  onClick={() => handleDeleteItem(item.id, item.name)}
                  disabled={deleteItemMutation.isPending}
                  title="Delete item"
                  className="tap-target px-2 text-slate-600 hover:text-brick disabled:opacity-40"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
        {effectiveCategoryId && (
          <div className="flex gap-2 border-t border-slate-800 pt-3">
            <input
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="New item name"
              className="flex-1 tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper"
            />
            <input
              type="number"
              step="0.01"
              value={newItemPrice}
              onChange={(e) => setNewItemPrice(e.target.value)}
              placeholder="Price"
              className="w-28 tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper font-mono"
            />
            <button
              onClick={() => createItemMutation.mutate()}
              disabled={!newItemName || !newItemPrice || createItemMutation.isPending}
              className="tap-target px-4 bg-sage hover:bg-sage-dark disabled:opacity-40 text-slate-950 font-semibold rounded-md"
            >
              Add
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
// Tables (unchanged)
// ---------------------------------------------------------------------

function TableManagement() {
  const queryClient = useQueryClient();
  const { data: tables } = useQuery({ queryKey: ["tables"], queryFn: tablesApi.list });
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableCapacity, setNewTableCapacity] = useState("4");

  const createMutation = useMutation({
    mutationFn: () => managerApi.createTable(newTableNumber, parseInt(newTableCapacity, 10)),
    onSuccess: () => {
      setNewTableNumber("");
      queryClient.invalidateQueries({ queryKey: ["tables"] });
    },
  });

  return (
    <div className="docket docket-neutral p-4">
      <h2 className="font-display text-lg text-paper mb-3">Tables</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {tables?.map((table) => (
          <div key={table.id} className="bg-slate-900/60 rounded-md p-3 text-center">
            <div className="font-display text-xl text-paper">{table.tableNumber}</div>
            <div className="text-xs text-slate-600">{table.capacity} seats · {table.status}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-slate-800 pt-3">
        <input
          value={newTableNumber}
          onChange={(e) => setNewTableNumber(e.target.value)}
          placeholder="Table number, e.g. 09"
          className="flex-1 tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper"
        />
        <input
          type="number"
          value={newTableCapacity}
          onChange={(e) => setNewTableCapacity(e.target.value)}
          className="w-20 tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper"
        />
        <button
          onClick={() => createMutation.mutate()}
          disabled={!newTableNumber || createMutation.isPending}
          className="tap-target px-4 bg-sage hover:bg-sage-dark disabled:opacity-40 text-slate-950 font-semibold rounded-md"
        >
          Add Table
        </button>
      </div>
      {createMutation.isError && <p className="text-brick text-sm mt-2">{(createMutation.error as any)?.message}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------
// Offers & Combos
// ---------------------------------------------------------------------

/** <input type="datetime-local"> works in local-time strings; convert to/from epoch seconds. */
function epochToLocalInput(epoch: number | null): string {
  if (!epoch) return "";
  const d = new Date(epoch * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToEpoch(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}
void epochToLocalInput; // reserved for a future "edit offer" form

function windowLabel(startsAt: number | null, endsAt: number | null): string {
  if (!startsAt && !endsAt) return "No time limit";
  const fmt = (e: number) => new Date(e * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  if (startsAt && endsAt) return `${fmt(startsAt)} → ${fmt(endsAt)}`;
  if (endsAt) return `Until ${fmt(endsAt)}`;
  return `From ${fmt(startsAt!)}`;
}

function isExpired(endsAt: number | null): boolean {
  return !!endsAt && endsAt <= Math.floor(Date.now() / 1000);
}

function ItemPicker({
  allItems,
  selected,
  onChange,
}: {
  allItems: MenuItem[];
  selected: OfferComboItem[];
  onChange: (items: OfferComboItem[]) => void;
}) {
  function toggle(menuItemId: string) {
    const exists = selected.find((i) => i.menuItemId === menuItemId);
    if (exists) onChange(selected.filter((i) => i.menuItemId !== menuItemId));
    else onChange([...selected, { menuItemId, quantity: 1 }]);
  }
  function setQty(menuItemId: string, quantity: number) {
    onChange(selected.map((i) => (i.menuItemId === menuItemId ? { ...i, quantity: Math.max(1, quantity) } : i)));
  }

  return (
    <div className="max-h-48 overflow-y-auto border border-slate-700 rounded-md divide-y divide-slate-800">
      {allItems.map((item) => {
        const picked = selected.find((i) => i.menuItemId === item.id);
        return (
          <div key={item.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
              <input type="checkbox" checked={!!picked} onChange={() => toggle(item.id)} className="shrink-0" />
              <span className="text-paper truncate">{item.name}</span>
            </label>
            {picked && (
              <input
                type="number"
                min={1}
                value={picked.quantity}
                onChange={(e) => setQty(item.id, parseInt(e.target.value, 10) || 1)}
                className="w-14 bg-slate-800 border border-slate-700 rounded px-1 text-center font-mono text-xs"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function OfferCreateForm({ allItems, onDone }: { allItems: MenuItem[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED_AMOUNT">("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [items, setItems] = useState<OfferComboItem[]>([]);

  const mutation = useMutation({
    mutationFn: () =>
      offersApi.create({
        name,
        description: description || undefined,
        discountType,
        // percentage stored as value*100 (e.g. 15% -> 1500); fixed amount stored as minor units
        discountValue: Math.round(parseFloat(discountValue) * 100),
        startsAt: localInputToEpoch(startsAt),
        endsAt: localInputToEpoch(endsAt),
        items,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      onDone();
    },
  });

  return (
    <div className="space-y-2 border-t border-slate-800 pt-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Offer name, e.g. Weekend 15% Off"
        className="w-full tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper"
      />
      <div className="flex gap-2">
        <select
          value={discountType}
          onChange={(e) => setDiscountType(e.target.value as "PERCENTAGE" | "FIXED_AMOUNT")}
          className="tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper"
        >
          <option value="PERCENTAGE">% off</option>
          <option value="FIXED_AMOUNT">Flat amount off</option>
        </select>
        <input
          type="number"
          step="0.01"
          value={discountValue}
          onChange={(e) => setDiscountValue(e.target.value)}
          placeholder={discountType === "PERCENTAGE" ? "e.g. 15" : "e.g. 100.00"}
          className="flex-1 tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper font-mono"
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-slate-600 mb-1">Starts (optional)</label>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="w-full tap-target bg-slate-900 border border-slate-700 rounded-md px-2 text-paper text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-slate-600 mb-1">Ends (optional)</label>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="w-full tap-target bg-slate-900 border border-slate-700 rounded-md px-2 text-paper text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">Applies to which items</label>
        <ItemPicker allItems={allItems} selected={items} onChange={setItems} />
      </div>
      {mutation.isError && (
        <p className="text-brick text-sm">{mutation.error instanceof ApiClientError ? mutation.error.message : "Could not create offer."}</p>
      )}
      <button
        onClick={() => mutation.mutate()}
        disabled={!name || !discountValue || items.length === 0 || mutation.isPending}
        className="w-full tap-target bg-sage hover:bg-sage-dark disabled:opacity-40 text-slate-950 font-semibold rounded-md"
      >
        {mutation.isPending ? "Creating…" : "Create Offer"}
      </button>
    </div>
  );
}

function OffersList({ offers }: { offers: Offer[] }) {
  const queryClient = useQueryClient();
  const removeMutation = useMutation({
    mutationFn: (id: string) => offersApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["offers"] }),
  });

  if (offers.length === 0) return <p className="text-slate-600 text-sm">No offers yet.</p>;

  return (
    <div className="space-y-2">
      {offers.map((offer) => {
        const expired = isExpired(offer.endsAt);
        const inactive = !offer.isActive || expired;
        return (
          <div key={offer.id} className="bg-slate-900/60 rounded-md p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-paper font-medium flex items-center gap-2">
                  {offer.name}
                  {inactive && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                      {expired ? "Expired" : "Inactive"}
                    </span>
                  )}
                </div>
                <div className="text-ember text-sm font-mono">
                  {offer.discountType === "PERCENTAGE" ? `${offer.discountValue / 100}% off` : formatMoney(offer.discountValue) + " off"}
                </div>
                <div className="text-slate-600 text-xs mt-0.5">{windowLabel(offer.startsAt, offer.endsAt)}</div>
                <div className="text-slate-600 text-xs">{offer.items.length} item{offer.items.length === 1 ? "" : "s"}</div>
              </div>
              {offer.isActive && (
                <button
                  onClick={() => window.confirm(`Remove offer "${offer.name}"?`) && removeMutation.mutate(offer.id)}
                  className="tap-target px-2 text-slate-600 hover:text-brick shrink-0"
                  title="Remove offer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ComboCreateForm({ allItems, onDone }: { allItems: MenuItem[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [items, setItems] = useState<OfferComboItem[]>([]);

  const mutation = useMutation({
    mutationFn: () =>
      combosApi.create({
        name,
        description: description || undefined,
        priceMinor: Math.round(parseFloat(price) * 100),
        startsAt: localInputToEpoch(startsAt),
        endsAt: localInputToEpoch(endsAt),
        items,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["combos"] });
      onDone();
    },
  });

  return (
    <div className="space-y-2 border-t border-slate-800 pt-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Combo name, e.g. Family Feast"
        className="w-full tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper"
      />
      <input
        type="number"
        step="0.01"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Combo price, e.g. 499.00"
        className="w-full tap-target bg-slate-900 border border-slate-700 rounded-md px-3 text-paper font-mono"
      />
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-slate-600 mb-1">Starts (optional)</label>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="w-full tap-target bg-slate-900 border border-slate-700 rounded-md px-2 text-paper text-sm"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-slate-600 mb-1">Ends (optional)</label>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="w-full tap-target bg-slate-900 border border-slate-700 rounded-md px-2 text-paper text-sm"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">Items in this combo</label>
        <ItemPicker allItems={allItems} selected={items} onChange={setItems} />
      </div>
      {mutation.isError && (
        <p className="text-brick text-sm">{mutation.error instanceof ApiClientError ? mutation.error.message : "Could not create combo."}</p>
      )}
      <button
        onClick={() => mutation.mutate()}
        disabled={!name || !price || items.length === 0 || mutation.isPending}
        className="w-full tap-target bg-sage hover:bg-sage-dark disabled:opacity-40 text-slate-950 font-semibold rounded-md"
      >
        {mutation.isPending ? "Creating…" : "Create Combo"}
      </button>
    </div>
  );
}

function CombosList({ combos }: { combos: Combo[] }) {
  const queryClient = useQueryClient();
  const removeMutation = useMutation({
    mutationFn: (id: string) => combosApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["combos"] }),
  });

  if (combos.length === 0) return <p className="text-slate-600 text-sm">No combos yet.</p>;

  return (
    <div className="space-y-2">
      {combos.map((combo) => {
        const expired = isExpired(combo.endsAt);
        const inactive = !combo.isActive || expired;
        return (
          <div key={combo.id} className="bg-slate-900/60 rounded-md p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-paper font-medium flex items-center gap-2">
                  {combo.name}
                  {inactive && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
                      {expired ? "Expired" : "Inactive"}
                    </span>
                  )}
                </div>
                <div className="text-ember text-sm font-mono">{formatMoney(combo.priceMinor)}</div>
                <div className="text-slate-600 text-xs mt-0.5">{windowLabel(combo.startsAt, combo.endsAt)}</div>
                <div className="text-slate-600 text-xs">{combo.items.length} item{combo.items.length === 1 ? "" : "s"}</div>
              </div>
              {combo.isActive && (
                <button
                  onClick={() => window.confirm(`Remove combo "${combo.name}"?`) && removeMutation.mutate(combo.id)}
                  className="tap-target px-2 text-slate-600 hover:text-brick shrink-0"
                  title="Remove combo"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function OffersAndCombosManagement() {
  const { data: allItems } = useQuery({ queryKey: ["menu", "items", "all"], queryFn: () => menuApi.items() });
  const { data: offers } = useQuery({ queryKey: ["offers"], queryFn: () => offersApi.list(false) });
  const { data: combos } = useQuery({ queryKey: ["combos"], queryFn: () => combosApi.list(false) });
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [showComboForm, setShowComboForm] = useState(false);

  return (
    <div className="space-y-6">
      <section className="docket docket-neutral p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg text-paper">Offers</h2>
          <button
            onClick={() => setShowOfferForm((s) => !s)}
            className="tap-target px-3 bg-ember hover:bg-ember-dark text-slate-950 font-semibold rounded-md text-sm"
          >
            {showOfferForm ? "Cancel" : "+ New Offer"}
          </button>
        </div>
        <OffersList offers={offers ?? []} />
        {showOfferForm && allItems && <OfferCreateForm allItems={allItems} onDone={() => setShowOfferForm(false)} />}
      </section>

      <section className="docket docket-neutral p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg text-paper">Combos</h2>
          <button
            onClick={() => setShowComboForm((s) => !s)}
            className="tap-target px-3 bg-ember hover:bg-ember-dark text-slate-950 font-semibold rounded-md text-sm"
          >
            {showComboForm ? "Cancel" : "+ New Combo"}
          </button>
        </div>
        <CombosList combos={combos ?? []} />
        {showComboForm && allItems && <ComboCreateForm allItems={allItems} onDone={() => setShowComboForm(false)} />}
      </section>
    </div>
  );
}

export default function ManagerDashboard() {
  const [tab, setTab] = useState<Tab>("menu");
  return (
    <Shell tab={tab} setTab={setTab}>
      {tab === "menu" ? <MenuManagement /> : tab === "tables" ? <TableManagement /> : <OffersAndCombosManagement />}
    </Shell>
  );
}
