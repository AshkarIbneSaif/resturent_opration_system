import type { ReceiptData } from "../../api/billing";

function money(minor: number, currency: ReceiptData["currency"]): string {
  return `${currency.symbol}${(minor / Math.pow(10, currency.decimalPlaces)).toFixed(currency.decimalPlaces)}`;
}

function formatDateTime(epochSeconds: number): { date: string; time: string } {
  const d = new Date(epochSeconds * 1000);
  return {
    date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
}

/**
 * Real printable HTML, not a <pre> text dump — this is what actually goes
 * to the thermal printer via the browser print dialog (see the
 * @media print rules in index.css, which isolate this element and set
 * @page { size: 80mm auto }). Any 80mm/58mm thermal printer registered as
 * a normal OS printer (the common case for USB/network POS printers with
 * Windows/Mac drivers) can print this directly — no raw ESC/POS byte
 * stream needed for that setup.
 */
export function Receipt80mm({ data }: { data: ReceiptData }) {
  const { date, time } = formatDateTime(data.dateTimeEpochSeconds);

  return (
    <div className="w-[80mm] bg-white text-black font-mono text-[11px] leading-tight p-2 mx-auto print:mx-0">
      <div className="text-center font-bold text-sm">{data.restaurant.name.toUpperCase()}</div>
      {data.restaurant.address && <div className="text-center">{data.restaurant.address}</div>}
      {data.restaurant.phone && <div className="text-center">Tel: {data.restaurant.phone}</div>}

      <div className="border-t border-dashed border-black my-1.5" />
      <div className="text-center font-bold text-sm">ORDER #{data.orderPublicId}</div>
      <div className="border-t border-dashed border-black my-1.5" />

      <div className="flex justify-between">
        <span>{data.tableNumber ? `Table: ${data.tableNumber}` : `Type: ${data.orderType}`}</span>
        {data.waiterName && <span>Waiter: {data.waiterName}</span>}
      </div>
      <div className="flex justify-between">
        <span>{date}</span>
        <span>{time}</span>
      </div>

      <div className="border-t border-dashed border-black my-1.5" />
      <div className="flex justify-between font-bold">
        <span>ITEM</span>
        <span>QTY&nbsp;&nbsp;&nbsp;AMT</span>
      </div>
      <div className="border-t border-dashed border-black my-1.5" />

      {data.items.map((item, i) => (
        <div key={i} className="mb-0.5">
          <div className="flex justify-between">
            <span>
              {item.name}
              {item.variantName ? ` (${item.variantName})` : ""}
            </span>
            <span>
              {item.quantity}&nbsp;&nbsp;{money(item.lineTotalMinor, data.currency)}
            </span>
          </div>
          {item.modifiers.map((m, mi) => (
            <div key={mi} className="pl-2 text-[10px]">
              + {m.name}
              {m.quantity > 1 ? ` x${m.quantity}` : ""}
            </div>
          ))}
        </div>
      ))}

      <div className="border-t border-dashed border-black my-1.5" />
      <div className="flex justify-between">
        <span>Subtotal</span>
        <span>{money(data.subtotalMinor, data.currency)}</span>
      </div>
      <div className="flex justify-between">
        <span>Discount</span>
        <span>{money(data.discountMinor, data.currency)}</span>
      </div>
      {data.taxMinor > 0 && (
        <div className="flex justify-between">
          <span>VAT/Tax</span>
          <span>{money(data.taxMinor, data.currency)}</span>
        </div>
      )}
      {data.serviceChargeMinor > 0 && (
        <div className="flex justify-between">
          <span>Service</span>
          <span>{money(data.serviceChargeMinor, data.currency)}</span>
        </div>
      )}
      <div className="border-t border-black my-1" />
      <div className="flex justify-between font-bold text-sm">
        <span>TOTAL</span>
        <span>{money(data.totalMinor, data.currency)}</span>
      </div>

      <div className="border-t border-dashed border-black my-1.5" />
      <div className="font-bold">PAYMENT</div>
      <div className="flex justify-between">
        <span>Method:</span>
        <span>{data.paymentMethod ?? "PENDING"}</span>
      </div>
      <div className="flex justify-between">
        <span>Status:</span>
        <span>{data.billStatus}</span>
      </div>
      {data.cashierName && (
        <div className="flex justify-between">
          <span>Cashier:</span>
          <span>{data.cashierName}</span>
        </div>
      )}
      <div className="border-t border-dashed border-black my-1.5" />

      <div className="text-center font-bold mt-2">THANK YOU!</div>
      <div className="text-center">We hope to see you again.</div>
      <div className="text-center mt-2">ORDER #{data.orderPublicId}</div>
    </div>
  );
}
