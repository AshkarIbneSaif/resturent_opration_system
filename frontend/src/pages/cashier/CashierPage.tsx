import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { formatMoney, ordersApi } from "../../api/ros";
import type { OrderView } from "../../api/ros";
import { billingApi, receiptsApi } from "../../api/billing";
import { offersApi } from "../../api/offers";
import type { Offer } from "../../api/offers";
import { ApiClientError } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { useRealtimeSync } from "../../lib/useRealtimeSync";
import { Receipt80mm } from "./Receipt80mm";

function Shell({ children }: { children: React.ReactNode }) {
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  useRealtimeSync();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <h1 className="font-display text-lg text-paper">Cashier</h1>
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
      <main className="flex-1 p-4 max-w-2xl mx-auto w-full print:hidden">{children}</main>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  BILL_REQUESTED: "Awaiting bill",
  BILLED: "Awaiting payment",
};

/**
 * Extra discount at billing time — fully open amount, left entirely to
 * the cashier's judgement (product decision). A short note is mandatory
 * whenever an amount is entered so there's a paper trail an Owner can
 * review later (enforced server-side too — this is just the UI half).
 * Active pre-defined Offers are shown for reference only; picking one
 * just fills the amount/note fields, it doesn't change how the discount
 * is applied.
 */
function DiscountPanel({
  order,
  onApply,
  isPending,
  error,
}: {
  order: OrderView;
  onApply: (discountMinor: number, reason: string, offerId?: string) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(!!order.offerId);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [selectedOfferId, setSelectedOfferId] = useState<string | undefined>(undefined);
  const [prefilledForOrderId, setPrefilledForOrderId] = useState<string | undefined>(undefined);

  const { data: activeOffers } = useQuery({
    queryKey: ["offers", "active"],
    queryFn: () => offersApi.list(true),
    enabled: open,
  });

  // The waiter may have tagged this order with an Offer already (Waiter's
  // "Offers" section — see WaiterMenuPage). Pre-fill the amount and note
  // from it automatically so the Cashier just has to glance and confirm —
  // that's the "without hassle" hand-off from order-time to billing-time.
  // Guarded by prefilledForOrderId so it only runs once per order, not on
  // every render (the Cashier is still free to edit or clear it after).
  const { data: attachedOffer } = useQuery({
    queryKey: ["offers", order.offerId],
    queryFn: () => offersApi.get(order.offerId!),
    enabled: !!order.offerId && prefilledForOrderId !== order.id,
  });

  useEffect(() => {
    if (!attachedOffer || prefilledForOrderId === order.id) return;
    const matchedSubtotal = order.items
      .filter((oi) => attachedOffer.items.some((ai) => ai.menuItemId === oi.menuItemId))
      .reduce((sum, oi) => sum + oi.lineTotalMinor, 0);
    const suggested =
      attachedOffer.discountType === "PERCENTAGE"
        ? Math.round((matchedSubtotal * attachedOffer.discountValue) / 10000)
        : Math.min(attachedOffer.discountValue, matchedSubtotal);
    if (suggested > 0) {
      setAmount((suggested / 100).toFixed(2));
      setReason(`Offer: ${attachedOffer.name}`);
      setSelectedOfferId(attachedOffer.id);
      setOpen(true);
    }
    setPrefilledForOrderId(order.id);
  }, [attachedOffer, order.id, order.items, prefilledForOrderId]);

  function pickOffer(offer: Offer) {
    setSelectedOfferId(offer.id);
    setReason(`Offer: ${offer.name}`);
  }

  function submit() {
    const discountMinor = Math.round(parseFloat(amount || "0") * 100);
    if (!discountMinor || discountMinor <= 0) return;
    onApply(discountMinor, reason.trim(), selectedOfferId);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full tap-target bg-slate-800 hover:bg-slate-700 text-paper font-medium rounded-md text-sm mb-2"
      >
        + Apply Discount
      </button>
    );
  }

  return (
    <div className="bg-slate-900/60 rounded-md p-3 space-y-2 mb-2">
      <div className="flex items-center justify-between">
        <span className="text-paper text-sm font-medium">Apply Discount</span>
        <button onClick={() => setOpen(false)} className="tap-target px-2 text-slate-600 hover:text-paper text-sm">
          Cancel
        </button>
      </div>

      {attachedOffer && selectedOfferId === attachedOffer.id && (
        <p className="text-ember text-xs">Pre-filled from the offer the waiter tagged — review before applying.</p>
      )}

      {activeOffers && activeOffers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeOffers.map((offer) => (
            <button
              key={offer.id}
              onClick={() => pickOffer(offer)}
              className={`tap-target px-2 rounded-md text-xs font-medium ${
                selectedOfferId === offer.id ? "bg-ember text-slate-950" : "bg-slate-800 text-slate-400"
              }`}
            >
              {offer.name} ({offer.discountType === "PERCENTAGE" ? `${offer.discountValue / 100}%` : formatMoney(offer.discountValue)})
            </button>
          ))}
        </div>
      )}

      <input
        type="number"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Discount amount"
        className="w-full tap-target bg-slate-800 border border-slate-700 rounded-md px-3 text-paper font-mono text-sm"
      />
      <input
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          setSelectedOfferId(undefined);
        }}
        placeholder="Note — required, e.g. regular customer"
        className="w-full tap-target bg-slate-800 border border-slate-700 rounded-md px-3 text-paper text-sm"
      />
      {error && <p className="text-brick text-sm">{error}</p>}
      <button
        onClick={submit}
        disabled={!amount || !reason.trim() || isPending}
        className="w-full tap-target bg-sage hover:bg-sage-dark disabled:opacity-40 text-slate-950 font-semibold rounded-md text-sm"
      >
        {isPending ? "Applying…" : "Apply & Generate Bill"}
      </button>
    </div>
  );
}

function BillingQueue({ onSelect, selectedOrderId }: { onSelect: (order: OrderView) => void; selectedOrderId?: string }) {
  const { data: activeOrders, isLoading } = useQuery({
    queryKey: ["orders", "active"],
    queryFn: ordersApi.active,
    refetchInterval: 8000,
  });

  const queue = (activeOrders ?? []).filter((o) => o.status === "BILL_REQUESTED" || o.status === "BILLED");

  return (
    <div className="docket docket-neutral p-4 mb-4">
      <h2 className="font-display text-lg text-paper mb-1">Orders Awaiting Billing</h2>
      <p className="text-slate-600 text-sm mb-3">
        Every order a waiter has requested a bill for shows up here automatically — no need to know the Order ID.
      </p>
      {isLoading && <p className="text-slate-600 text-sm">Loading…</p>}
      {!isLoading && queue.length === 0 && <p className="text-slate-600 text-sm">Nothing waiting right now.</p>}
      <div className="space-y-2">
        {queue.map((order) => (
          <button
            key={order.id}
            onClick={() => onSelect(order)}
            className={`w-full tap-target flex items-center justify-between rounded-md px-3 text-left ${
              selectedOrderId === order.id ? "bg-ember text-slate-950" : "bg-slate-900/60 hover:bg-slate-900 text-paper"
            }`}
          >
            <span className="font-mono font-semibold">#{order.publicOrderId}</span>
            <span className="text-sm">{STATUS_LABEL[order.status] ?? order.status}</span>
            <span className="font-mono text-sm">{formatMoney(order.subtotalMinor)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CashierPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [order, setOrder] = useState<OrderView | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: bill, refetch: refetchBill } = useQuery({
    queryKey: ["bill", order?.id],
    queryFn: () => billingApi.getBillForOrder(order!.id),
    enabled: !!order && (order.status === "BILLED" || order.status === "PAID" || order.status === "COMPLETED"),
    retry: false,
  });

  const { data: receiptData } = useQuery({
    queryKey: ["receipt", order?.id],
    queryFn: () => receiptsApi.customerData(order!.id),
    enabled: !!order && (order.status === "PAID" || order.status === "COMPLETED"),
    retry: false,
  });

  async function handleSearch() {
    setSearchError(null);
    setOrder(null);
    try {
      const found = await billingApi.findByPublicOrderId(searchTerm.trim());
      setOrder(found);
    } catch (err) {
      setSearchError(err instanceof ApiClientError ? err.message : "Order not found.");
    }
  }

  function selectFromQueue(o: OrderView) {
    setSearchError(null);
    setSearchTerm(o.publicOrderId);
    setOrder(o);
  }

  async function refreshOrder() {
    if (!order) return;
    const fresh = await ordersApi.get(order.id);
    setOrder(fresh);
    queryClient.invalidateQueries({ queryKey: ["bill", order.id] });
    queryClient.invalidateQueries({ queryKey: ["orders", "active"] });
  }

  const generateBillMutation = useMutation({
    mutationFn: (discount?: { discountMinor: number; reason: string; offerId?: string }) =>
      billingApi.generateBill(order!.id, discount?.discountMinor, undefined, undefined, discount?.reason, discount?.offerId),
    onSuccess: async () => {
      await refreshOrder();
      refetchBill();
    },
  });

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "MOBILE" | "OTHER">("CASH");

  const paymentMutation = useMutation({
    mutationFn: () => {
      const amountMinor = Math.round(parseFloat(paymentAmount) * 100);
      return billingApi.recordPayment(bill!.id, paymentMethod, amountMinor);
    },
    onSuccess: async () => {
      setPaymentAmount("");
      await refreshOrder();
      refetchBill();
    },
  });

  const completeMutation = useMutation({
    mutationFn: () => billingApi.completeOrder(order!.id),
    onSuccess: refreshOrder,
  });

  const remainingMinor = bill ? bill.totalMinor : 0;

  return (
    <>
      <Shell>
        <BillingQueue onSelect={selectFromQueue} selectedOrderId={order?.id} />

        <div className="docket docket-neutral p-4 mb-4">
          <label className="block text-sm text-slate-600 mb-1.5">Or search by Order ID directly</label>
          <div className="flex gap-2">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="e.g. 10452"
              className="flex-1 tap-target bg-slate-900 border border-slate-700 rounded-md px-4 text-paper text-lg font-mono focus-visible:border-ember"
            />
            <button
              onClick={handleSearch}
              className="tap-target px-6 bg-ember hover:bg-ember-dark text-slate-950 font-semibold rounded-md"
            >
              Search
            </button>
          </div>
          {searchError && <p className="text-brick text-sm mt-2">{searchError}</p>}
        </div>

        {order && (
          <div className="docket docket-pending p-4 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-mono text-sm text-slate-600">ORDER #{order.publicOrderId}</div>
                <div className="font-display text-xl text-paper">{order.status}</div>
              </div>
              <div className="font-mono text-lg text-ember">{formatMoney(order.subtotalMinor)}</div>
            </div>

            {order.status !== "BILL_REQUESTED" && order.status !== "BILLED" && order.status !== "PAID" && order.status !== "COMPLETED" && (
              <p className="text-slate-600 text-sm">
                This order isn't ready for billing yet (customer hasn't requested the bill).
              </p>
            )}

            {order.status === "BILL_REQUESTED" && (
              <>
                <DiscountPanel
                  order={order}
                  onApply={(discountMinor, reason, offerId) => generateBillMutation.mutate({ discountMinor, reason, offerId })}
                  isPending={generateBillMutation.isPending}
                  error={
                    generateBillMutation.isError
                      ? generateBillMutation.error instanceof ApiClientError
                        ? generateBillMutation.error.message
                        : "Could not apply discount."
                      : null
                  }
                />
                <button
                  onClick={() => generateBillMutation.mutate(undefined)}
                  disabled={generateBillMutation.isPending}
                  className="w-full tap-target bg-ember hover:bg-ember-dark disabled:opacity-40 text-slate-950 font-semibold rounded-md"
                >
                  {generateBillMutation.isPending ? "Generating…" : "Generate Bill (no discount)"}
                </button>
              </>
            )}

            {bill && (
              <div className="bg-slate-900/60 rounded-md p-3 space-y-1 text-sm font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-600">Subtotal</span>
                  <span>{formatMoney(bill.subtotalMinor)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Discount</span>
                  <span>{formatMoney(bill.discountMinor)}</span>
                </div>
                {bill.discountReason && (
                  <div className="flex justify-between text-xs text-slate-600 italic">
                    <span>Reason</span>
                    <span className="text-right">{bill.discountReason}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600">Tax</span>
                  <span>{formatMoney(bill.taxMinor)}</span>
                </div>
                <div className="flex justify-between font-semibold text-paper border-t border-slate-700 pt-1 mt-1">
                  <span>Total</span>
                  <span>{formatMoney(bill.totalMinor)}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-600">Status</span>
                  <span className={bill.status === "PAID" ? "text-sage" : "text-ember"}>{bill.status}</span>
                </div>
              </div>
            )}

            {bill && bill.status !== "PAID" && bill.status !== "VOIDED" && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  {(["CASH", "CARD", "MOBILE", "OTHER"] as const).map((method) => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`tap-target flex-1 rounded-md text-sm font-medium ${
                        paymentMethod === method ? "bg-ember text-slate-950" : "bg-slate-800 text-slate-600"
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder={`Amount (max ${formatMoney(remainingMinor)})`}
                    className="flex-1 tap-target bg-slate-900 border border-slate-700 rounded-md px-4 text-paper font-mono focus-visible:border-ember"
                  />
                  <button
                    onClick={() => paymentMutation.mutate()}
                    disabled={!paymentAmount || paymentMutation.isPending}
                    className="tap-target px-6 bg-sage hover:bg-sage-dark disabled:opacity-40 text-slate-950 font-semibold rounded-md"
                  >
                    {paymentMutation.isPending ? "Recording…" : "Record Payment"}
                  </button>
                </div>
                {paymentMutation.isError && (
                  <p className="text-brick text-sm">{(paymentMutation.error as any)?.message}</p>
                )}
              </div>
            )}

            {order.status === "PAID" && (
              <button
                onClick={() => completeMutation.mutate()}
                disabled={completeMutation.isPending}
                className="w-full tap-target bg-sage hover:bg-sage-dark disabled:opacity-40 text-slate-950 font-semibold rounded-md"
              >
                {completeMutation.isPending ? "Completing…" : "Mark Completed"}
              </button>
            )}

            {receiptData && (
              <div className="space-y-3">
                <button
                  onClick={() => window.print()}
                  className="w-full tap-target bg-paper hover:bg-white text-slate-950 font-semibold rounded-md flex items-center justify-center gap-2"
                >
                  🖨 Print Receipt (80mm)
                </button>
                <div className="bg-slate-700 rounded-md overflow-hidden">
                  <div className="text-center text-xs text-slate-400 py-1 bg-slate-800">Print preview</div>
                  <div className="overflow-x-auto py-2">
                    <Receipt80mm data={receiptData} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Shell>

      {/* Rendered off-screen at all times so window.print() has something
          to isolate via the #print-receipt-root CSS rules in index.css —
          not just when the on-screen preview above happens to be visible. */}
      {receiptData && (
        <div id="print-receipt-root" className="hidden print:block">
          <Receipt80mm data={receiptData} />
        </div>
      )}
    </>
  );
}
