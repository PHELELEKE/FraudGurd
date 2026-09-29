"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { post, useAction, ErrorNote } from "./api";
import { Field, Panel, RiskTag, Tag } from "./ui";
import { matchInvoice, type Reason } from "@/lib/rules";
import { rand } from "@/lib/format";
import { round2 } from "@/lib/money";
import { COMPANIES, COMPANY_LABEL, type Company } from "@/lib/companies";

export interface CaptureOrder {
  id: number;
  ref: string;
  supplier: string;
  supplierStatus: "pending" | "approved";
  item: string;
  quantity: number;
  unitPrice: number;
  total: number;
  received: number;
  status: string;
  company: Company;
  bank: { bankName: string; accountHolder: string; accountNumber: string; branchCode: string };
}

interface Result {
  invoiceRef: string;
  alertId: number | null;
  outcome: "approved" | "held";
  result: { score: number; band: string; reasons: Reason[] };
}

export function InvoiceCapture({ orders, today, defaultPoId }: { orders: CaptureOrder[]; today: string; defaultPoId?: number }) {
  const first = orders.find((o) => o.id === defaultPoId) ?? orders[0];
  const [poId, setPoId] = useState<number>(first?.id ?? 0);
  const po = useMemo(() => orders.find((o) => o.id === poId), [orders, poId]);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [quantity, setQuantity] = useState(String(first ? first.received || first.quantity : ""));
  const [unitPrice, setUnitPrice] = useState(String(first?.unitPrice ?? ""));
  const [bank, setBank] = useState(first?.bank ?? { bankName: "", accountHolder: "", accountNumber: "", branchCode: "" });
  const [company, setCompany] = useState<Company>(first?.company ?? "small_civils");
  const [result, setResult] = useState<Result | null>(null);
  const { run, busy, error } = useAction();
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (result) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  function pickPo(id: number) {
    const o = orders.find((x) => x.id === id);
    setPoId(id);
    if (o) {
      setQuantity(String(o.received || o.quantity));
      setUnitPrice(String(o.unitPrice));
      setBank(o.bank);
      setCompany(o.company);
    }
  }
  const setB = (k: keyof typeof bank) => (e: React.ChangeEvent<HTMLInputElement>) => setBank((p) => ({ ...p, [k]: e.target.value }));

  if (!po) {
    return (
      <Panel title="No purchase orders to invoice">
        <p className="text-mute">Purchase orders show up here once Procurement has created them.</p>
      </Panel>
    );
  }

  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  const total = Math.round(qty * price * 100) / 100;
  const m = matchInvoice({ po: { quantity: po.quantity, unitPrice: po.unitPrice }, receivedQty: po.received, invoice: { quantity: qty, unitPrice: price } });
  const bankDiffers = bank.accountNumber.trim() !== po.bank.accountNumber;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    const out = await run(() =>
      post<Result>("/api/invoices", { poId, invoiceNumber, invoiceDate, quantity: qty, unitPrice: price, company, ...bank })
    );
    if (out) setResult(out);
  }

  return (
    <div className="space-y-4">
      {result && (
        <div ref={resultRef} className="scroll-mt-24">
          <ResultPanel r={result} onAgain={() => { setResult(null); setInvoiceNumber(""); }} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Invoice details" subtitle="Type in what is printed on the supplier's invoice">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Purchase order">
              <select className="input" value={poId} onChange={(e) => pickPo(Number(e.target.value))}>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.ref}: {o.supplier}, {o.item}
                  </option>
                ))}
              </select>
            </Field>

            <div className="panel-raised px-4 py-3 text-[14px]">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{po.supplier}</span>
                {po.supplierStatus === "pending" ? <Tag tone="mid">Not verified</Tag> : <Tag tone="low">Verified</Tag>}
              </div>
              <div className="num mt-1 text-mute">
                {po.quantity} units ordered at {rand(po.unitPrice)}, {po.received} received
              </div>
            </div>

            <Field label="Company this invoice belongs to">
              <select className="input" value={company} onChange={(e) => setCompany(e.target.value as Company)}>
                {COMPANIES.map((c) => (
                  <option key={c} value={c}>
                    {COMPANY_LABEL[c]}
                    {c === po.company ? " (as ordered)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            {company !== po.company && (
              <p className="text-[13px] text-mid">
                This purchase order was raised under {COMPANY_LABEL[po.company]}. The invoice will be recorded under {COMPANY_LABEL[company]} instead.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Invoice number">
                <input className="input num" required value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="For example: INV-90432" />
              </Field>
              <Field label="Invoice date">
                <input className="input num" type="date" required value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </Field>
              <Field label="Quantity billed">
                <input className="input num" type="number" min={1} step={1} required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </Field>
              <Field label="Unit price billed (R, incl. VAT)">
                <input className="input num" type="number" min={0.01} step="0.01" required value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
              </Field>
            </div>

            <div className="flex items-baseline justify-between rounded-[10px] border border-line px-4 py-3">
              <div>
                <span className="text-mute">Invoice total (incl. VAT)</span>
                <div className="num text-[13px] text-mute">of which VAT: {rand(round2(total - total / 1.15))}</div>
              </div>
              <span className={`num text-xl font-semibold ${m.variance !== 0 ? "text-high" : ""}`}>{rand(total)}</span>
            </div>

            <fieldset className="space-y-3">
              <legend className="label !mb-1">Bank details on the invoice</legend>
              <p className="text-[13px] text-mute">Filled in from the supplier record. Only change these if the invoice shows different details.</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bank">
                  <input className="input" required value={bank.bankName} onChange={setB("bankName")} />
                </Field>
                <Field label="Account holder">
                  <input className="input" required value={bank.accountHolder} onChange={setB("accountHolder")} />
                </Field>
                <Field label="Account number">
                  <input className={`input num ${bankDiffers ? "input-error" : ""}`} required inputMode="numeric" value={bank.accountNumber} onChange={setB("accountNumber")} />
                </Field>
                <Field label="Branch code">
                  <input className="input num" required inputMode="numeric" value={bank.branchCode} onChange={setB("branchCode")} />
                </Field>
              </div>
              {bankDiffers && <p className="text-[14px] text-high">This account is not the one on file for {po.supplier}.</p>}
            </fieldset>

            <button className="btn btn-primary w-full" disabled={busy}>
              {busy ? "Checking..." : "Check and capture invoice"}
            </button>
            <ErrorNote message={error} />
          </form>
        </Panel>

        <Panel title="Three-way match" subtitle="The invoice must agree with the purchase order and what was delivered">
          <div className={`mb-4 rounded-[10px] border px-4 py-3 text-[14px] ${m.ok ? "border-low/40 bg-low/10 text-low" : "border-high/40 bg-high/10 text-high"}`}>
            {m.ok ? "All three documents agree." : m.issues.join(" ")}
          </div>
          <div className="space-y-3">
            <MatchCard title="1. Purchase order" ref_={po.ref} rows={[["Quantity", String(po.quantity), true], ["Unit price", rand(po.unitPrice), true], ["Total", rand(po.total), true]]} />
            <MatchCard
              title="2. Goods received"
              ref_={po.received ? `${po.received} of ${po.quantity} units` : "Nothing received"}
              rows={[["Quantity received", String(po.received), po.received > 0], ["Value at PO price", rand(m.expectedTotal), true]]}
            />
            <MatchCard
              title="3. This invoice"
              ref_={invoiceNumber || "Not entered yet"}
              rows={[
                ["Quantity billed", String(qty), m.qty.ok],
                ["Unit price billed", rand(price), m.price.ok],
                ["Total billed", rand(total), m.variance === 0],
              ]}
              note={m.variance !== 0 ? `${m.variance > 0 ? "+" : "-"}${rand(Math.abs(m.variance))} compared with goods received at the PO price` : undefined}
            />
          </div>
          <p className="mt-4 text-[13px] text-mute">The full fraud check runs when you capture the invoice. It also looks at the bank account, duplicates and the amount.</p>
        </Panel>
      </div>
    </div>
  );
}

function MatchCard({ title, ref_, rows, note }: { title: string; ref_: string; rows: [string, string, boolean][]; note?: string }) {
  return (
    <div className="panel-raised p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="font-medium">{title}</h3>
        <span className="num text-[13px] text-mute">{ref_}</span>
      </div>
      <dl className="space-y-1.5 text-[15px]">
        {rows.map(([k, val, ok]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-mute">{k}</dt>
            <dd className={`num ${ok ? "" : "font-medium text-high"}`}>{val}</dd>
          </div>
        ))}
      </dl>
      {note && <p className="mt-2 text-[13px] text-high">{note}</p>}
    </div>
  );
}

function ResultPanel({ r, onAgain }: { r: Result; onAgain: () => void }) {
  const ok = r.outcome === "approved";
  return (
    <section className={`panel border-2 p-4 sm:p-6 ${ok ? "border-low/60" : r.result.band === "high" ? "border-high/60" : "border-mid/60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {ok ? `${r.invoiceRef} is cleared for payment` : `${r.invoiceRef} is held for review`}
          </h2>
          <p className="mt-1 text-mute">
            {ok
              ? "No rules fired strongly enough to stop it. It has been posted to the ledger and the Accountant can pay it."
              : "Payment is blocked until the Finance Manager reviews the alert. This does not mean anyone did something wrong."}
          </p>
        </div>
        <RiskTag score={r.result.score} band={r.result.band} />
      </div>

      {r.result.reasons.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-[10px] border border-line">
          {r.result.reasons.map((x) => (
            <li key={x.code} className="flex items-start justify-between gap-4 px-4 py-3">
              <div>
                <div className="font-medium">{x.title}</div>
                <div className="text-[14px] text-mute">{x.detail}</div>
              </div>
              <span className="tag tag-neutral num">+{x.points}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {r.alertId ? (
          <Link className="btn btn-primary" href={`/alerts/${r.alertId}`}>
            Open the alert
          </Link>
        ) : (
          <Link className="btn btn-primary" href="/invoices">
            Go to invoices to pay it
          </Link>
        )}
        <button className="btn" onClick={onAgain}>
          Capture another invoice
        </button>
      </div>
    </section>
  );
}
