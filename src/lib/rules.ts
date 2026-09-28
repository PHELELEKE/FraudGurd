/**
 * FraudGuard rules engine.
 *
 * Pure functions only (no database, no network) so the same code can run on the
 * server when an invoice is captured and in the browser for the live match preview.
 *
 * Every rule that fires adds points. The points are added up (capped at 100)
 * and mapped to a band. The system never accuses anyone: a medium or high band
 * only means "a person must review this before it is paid".
 */

export type Band = "low" | "medium" | "high";
export type RuleCode =
  | "new_supplier"
  | "bank_changed"
  | "three_way_mismatch"
  | "duplicate_invoice"
  | "above_normal"
  | "frequent_invoices";

export const RULE_POINTS: Record<RuleCode, number> = {
  new_supplier: 30,
  bank_changed: 30,
  three_way_mismatch: 40,
  duplicate_invoice: 35,
  above_normal: 20,
  frequent_invoices: 15,
};

export const RULE_TITLE: Record<RuleCode, string> = {
  new_supplier: "Supplier not verified yet",
  bank_changed: "Supplier bank details changed",
  three_way_mismatch: "Purchase order, goods received and invoice do not match",
  duplicate_invoice: "Possible duplicate invoice",
  above_normal: "Amount above normal for this category",
  frequent_invoices: "Several invoices from the same supplier in a short time",
};

/** Low: 0 to 24. Medium: 25 to 59. High: 60 and above. */
export const BAND_MEDIUM_FROM = 25;
export const BAND_HIGH_FROM = 60;

export const BANK_CHANGE_WINDOW_DAYS = 30;
export const FREQUENT_WINDOW_DAYS = 7;
export const FREQUENT_MIN_INVOICES = 3;
export const DUPLICATE_AMOUNT_WINDOW_DAYS = 30;

export function bandFor(score: number): Band {
  if (score >= BAND_HIGH_FROM) return "high";
  if (score >= BAND_MEDIUM_FROM) return "medium";
  return "low";
}

const rand = (n: number) =>
  `R${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const last4 = (s: string) => s.slice(-4);

export interface MatchInput {
  po: { quantity: number; unitPrice: number };
  receivedQty: number;
  invoice: { quantity: number; unitPrice: number };
}

export interface MatchDetail {
  ok: boolean;
  qty: { po: number; received: number; invoice: number; ok: boolean };
  price: { po: number; invoice: number; ok: boolean };
  /** What the invoice total should be: goods received x PO unit price. */
  expectedTotal: number;
  invoiceTotal: number;
  /** invoiceTotal minus expectedTotal (positive means the supplier is billing too much). */
  variance: number;
  issues: string[];
}

export function matchInvoice({ po, receivedQty, invoice }: MatchInput): MatchDetail {
  const qtyOk = invoice.quantity === receivedQty && invoice.quantity <= po.quantity;
  const priceOk = Math.abs(invoice.unitPrice - po.unitPrice) < 0.005;
  const expectedTotal = Math.round(receivedQty * po.unitPrice * 100) / 100;
  const invoiceTotal = Math.round(invoice.quantity * invoice.unitPrice * 100) / 100;
  const variance = Math.round((invoiceTotal - expectedTotal) * 100) / 100;

  const issues: string[] = [];
  if (invoice.quantity > receivedQty) {
    issues.push(
      receivedQty === 0
        ? `The invoice bills ${invoice.quantity} units but no goods have been received.`
        : `The invoice bills ${invoice.quantity} units but only ${receivedQty} were received.`
    );
  } else if (invoice.quantity < receivedQty) {
    issues.push(`The invoice bills ${invoice.quantity} units but ${receivedQty} were received.`);
  }
  if (invoice.quantity > po.quantity) {
    issues.push(`The invoice bills ${invoice.quantity} units but the purchase order is for ${po.quantity}.`);
  }
  if (!priceOk) {
    issues.push(
      `The unit price is ${rand(invoice.unitPrice)} on the invoice but ${rand(po.unitPrice)} on the purchase order.`
    );
  }

  return {
    ok: qtyOk && priceOk,
    qty: { po: po.quantity, received: receivedQty, invoice: invoice.quantity, ok: qtyOk },
    price: { po: po.unitPrice, invoice: invoice.unitPrice, ok: priceOk },
    expectedTotal,
    invoiceTotal,
    variance,
    issues,
  };
}

export interface RuleInput extends MatchInput {
  supplier: {
    name: string;
    status: "pending" | "approved";
    accountNumber: string;
    bankChangedAt: Date | null;
  };
  invoice: MatchInput["invoice"] & {
    number: string;
    total: number;
    accountNumber: string;
  };
  category: string;
  categoryNormalMax: number | null;
  /** Earlier invoices from this supplier (not rejected) with the same invoice number. */
  sameNumber: { ref: string; number: string }[];
  /** Earlier invoices from this supplier with the same total within the last 30 days. */
  sameAmount: { ref: string; number: string }[];
  /** Invoices from this supplier in the last 7 days, including the one being checked. */
  recentInvoiceCount: number;
  now: Date;
}

export interface Reason {
  code: RuleCode;
  title: string;
  detail: string;
  points: number;
}

export interface RuleResult {
  score: number;
  band: Band;
  reasons: Reason[];
  match: MatchDetail;
}

export function scoreInvoice(input: RuleInput): RuleResult {
  const reasons: Reason[] = [];
  const add = (code: RuleCode, detail: string) =>
    reasons.push({ code, title: RULE_TITLE[code], detail, points: RULE_POINTS[code] });

  const match = matchInvoice(input);

  // 1. Supplier has not been verified by the Finance Manager
  if (input.supplier.status === "pending") {
    add("new_supplier", `${input.supplier.name} was added recently and has not been verified by the Finance Manager.`);
  }

  // 2. Bank details differ from the supplier record, or were changed recently
  const accountDiffers = input.invoice.accountNumber.trim() !== input.supplier.accountNumber.trim();
  const changedDays = input.supplier.bankChangedAt
    ? Math.floor((input.now.getTime() - input.supplier.bankChangedAt.getTime()) / 86_400_000)
    : null;
  const changedRecently = changedDays !== null && changedDays <= BANK_CHANGE_WINDOW_DAYS;
  if (accountDiffers || changedRecently) {
    const bits: string[] = [];
    if (accountDiffers) {
      bits.push(
        `The account on the invoice (ending ${last4(input.invoice.accountNumber)}) is not the account on file (ending ${last4(input.supplier.accountNumber)}).`
      );
    }
    if (changedRecently) {
      bits.push(
        changedDays === 0
          ? "The supplier's bank details on file were changed today."
          : `The supplier's bank details on file were changed ${changedDays} day${changedDays === 1 ? "" : "s"} ago.`
      );
    }
    add("bank_changed", bits.join(" "));
  }

  // 3. Three-way match
  if (!match.ok) add("three_way_mismatch", match.issues.join(" "));

  // 4. Duplicate invoice
  if (input.sameNumber.length > 0) {
    const first = input.sameNumber[0]!;
    add("duplicate_invoice", `Invoice number ${first.number} from this supplier was already captured (${first.ref}).`);
  } else if (input.sameAmount.length > 0) {
    const first = input.sameAmount[0]!;
    add(
      "duplicate_invoice",
      `${first.ref} (invoice ${first.number}) from this supplier has the same amount of ${rand(input.invoice.total)} and was captured in the last ${DUPLICATE_AMOUNT_WINDOW_DAYS} days.`
    );
  }

  // 5. Above the normal spending level for the category
  if (input.categoryNormalMax !== null && input.invoice.total > input.categoryNormalMax) {
    const over = input.invoice.total - input.categoryNormalMax;
    const pct = (over / input.categoryNormalMax) * 100;
    add(
      "above_normal",
      `${rand(input.invoice.total)} is ${rand(over)} (${pct.toFixed(1)}%) above the normal maximum of ${rand(input.categoryNormalMax)} for ${input.category}.`
    );
  }

  // 6. Many invoices from the same supplier in a short time
  if (input.recentInvoiceCount >= FREQUENT_MIN_INVOICES) {
    add(
      "frequent_invoices",
      `${input.recentInvoiceCount} invoices from this supplier in the last ${FREQUENT_WINDOW_DAYS} days.`
    );
  }

  const score = Math.min(100, reasons.reduce((sum, r) => sum + r.points, 0));
  return { score, band: bandFor(score), reasons, match };
}
