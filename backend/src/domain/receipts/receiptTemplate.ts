import type { ReceiptData, KitchenReceiptData } from "./receiptDataService";

const WIDTH = 42; // standard 80mm thermal printer character width at typical font

function center(text: string): string {
  const pad = Math.max(0, Math.floor((WIDTH - text.length) / 2));
  return " ".repeat(pad) + text;
}

function line(char = "-"): string {
  return char.repeat(WIDTH);
}

function twoCol(left: string, right: string): string {
  const space = Math.max(1, WIDTH - left.length - right.length);
  return left + " ".repeat(space) + right;
}

function money(minor: number, curr: ReceiptData["currency"]): string {
  const value = (minor / Math.pow(10, curr.decimalPlaces)).toFixed(curr.decimalPlaces);
  return `${curr.symbol}${value}`;
}

function formatDateTime(epochSeconds: number): { date: string; time: string } {
  const d = new Date(epochSeconds * 1000);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return { date, time };
}

/**
 * Renders the customer receipt as plain text following RECEIPT_SPEC.md's
 * layout hierarchy. This is the "Template" stage of the Order -> Receipt
 * Data Object -> Template -> Printer Renderer pipeline (spec #24/#67) — it
 * never queries the database; it only consumes the already-built
 * ReceiptData object.
 */
export function renderCustomerReceiptText(data: ReceiptData): string {
  const out: string[] = [];
  if (data.restaurant.logoPath) out.push(center("[LOGO]"));
  out.push(center(data.restaurant.name.toUpperCase()));
  if (data.restaurant.address) out.push(center(data.restaurant.address));
  if (data.restaurant.phone) out.push(center(`Tel: ${data.restaurant.phone}`));
  out.push(line());
  out.push(center(`ORDER #${data.orderPublicId}`));
  out.push(line());

  const { date, time } = formatDateTime(data.dateTimeEpochSeconds);
  const leftInfo = data.tableNumber ? `Table: ${data.tableNumber}` : `Type: ${data.orderType}`;
  out.push(twoCol(leftInfo, data.waiterName ? `Waiter: ${data.waiterName}` : ""));
  out.push(twoCol(date, time));
  out.push(line());

  out.push(twoCol("ITEM", "QTY    AMT"));
  out.push(line());
  for (const item of data.items) {
    const nameLine = item.variantName ? `${item.name} (${item.variantName})` : item.name;
    out.push(twoCol(nameLine, `${item.quantity}   ${money(item.lineTotalMinor, data.currency)}`));
    for (const m of item.modifiers) {
      out.push(`  + ${m.name}${m.quantity > 1 ? ` x${m.quantity}` : ""}`);
    }
  }
  out.push(line());

  out.push(twoCol("", `Subtotal  ${money(data.subtotalMinor, data.currency)}`));
  out.push(twoCol("", `Discount  ${money(data.discountMinor, data.currency)}`));
  if (data.taxMinor > 0) out.push(twoCol("", `VAT/Tax   ${money(data.taxMinor, data.currency)}`));
  if (data.serviceChargeMinor > 0) out.push(twoCol("", `Service   ${money(data.serviceChargeMinor, data.currency)}`));
  out.push(line());
  out.push(twoCol("", `TOTAL     ${money(data.totalMinor, data.currency)}`));
  out.push(line());

  out.push("PAYMENT");
  out.push(twoCol("Method:", data.paymentMethod ?? "PENDING"));
  out.push(twoCol("Status:", data.billStatus));
  out.push(twoCol("Cashier:", data.cashierName ?? ""));
  out.push(line());

  out.push(center("THANK YOU!"));
  out.push(center("We hope to see you again."));
  out.push("");
  out.push(center(`ORDER #${data.orderPublicId}`));

  return out.join("\n");
}

/**
 * Kitchen receipt — operational information only, no prices (spec #25).
 * Order ID and items are rendered large/prominent per spec intent; this
 * text form is the printer-agnostic template, actual font sizing is a
 * concern of the physical printer renderer layer.
 */
export function renderKitchenReceiptText(data: KitchenReceiptData): string {
  const out: string[] = [];
  out.push(center(`ORDER #${data.orderPublicId}`));
  out.push(center(data.tableNumber ? `Table ${data.tableNumber}` : data.orderType));
  const { date, time } = formatDateTime(data.createdAtEpochSeconds);
  out.push(center(`${date} ${time}`));
  out.push(line("="));

  for (const item of data.items) {
    const nameLine = item.variantName ? `${item.name} (${item.variantName})` : item.name;
    out.push(`${item.quantity}x  ${nameLine}`);
    for (const m of item.modifiers) {
      out.push(`     + ${m.name}${m.quantity > 1 ? ` x${m.quantity}` : ""}`);
    }
    if (item.notes) out.push(`     NOTE: ${item.notes}`);
  }
  out.push(line("="));
  return out.join("\n");
}
