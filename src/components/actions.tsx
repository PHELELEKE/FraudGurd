"use client";
import { useState } from "react";
import { post, useAction, ErrorNote } from "./api";
import { Field } from "./ui";
import { addVat, splitVat } from "@/lib/money";
import { rand } from "@/lib/format";
import { COMPANIES, COMPANY_LABEL, type Company } from "@/lib/companies";

/* ---------- purchase orders ---------- */

export function CreateOrderRow({
  requestId,
  quantity,
  estimatedUnit,
  suppliers,
  requestCompany,
}: {
  requestId: number;
  quantity: number;
  estimatedUnit: number;
  suppliers: { id: number; name: string; status: string }[];
  requestCompany: Company;
}) {
  const [supplierId, setSupplierId] = useState(String(suppliers[0]?.id ?? ""));
  const [unitPrice, setUnitPrice] = useState(String(addVat(estimatedUnit).total));
  const [company, setCompany] = useState<Company>(requestCompany);
  const { run, busy, error } = useAction();
  const total = Math.round(quantity * Number(unitPrice || 0) * 100) / 100;
  const { vat } = splitVat(total);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="label">Supplier</label>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.status === "pending" ? " (not verified)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="w-[150px]">
          <label className="label">Unit price (R, incl. VAT)</label>
          <input className="input num" type="number" min={0.01} step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
        </div>
        <div className="w-[170px]">
          <label className="label">Company</label>
          <select className="input" value={company} onChange={(e) => setCompany(e.target.value as Company)}>
            {COMPANIES.map((c) => (
              <option key={c} value={c}>
                {COMPANY_LABEL[c]}
                {c === requestCompany ? " (as requested)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="num pb-2 text-[15px]">
          <span className="text-mute">Total </span>
          {rand(total)}
          <span className="ml-1 text-[13px] text-mute">(incl. VAT {rand(vat)})</span>
        </div>
        <button
          className="btn btn-primary"
          disabled={busy || !supplierId || !(Number(unitPrice) > 0)}
          onClick={() => run(() => post("/api/orders", { requestId, supplierId: Number(supplierId), unitPrice: Number(unitPrice), company }))}
        >
          Create purchase order
        </button>
      </div>
      {company !== requestCompany && (
        <p className="mt-2 text-[13px] text-mid">
          This order will move to {COMPANY_LABEL[company]}, even though the request was made under {COMPANY_LABEL[requestCompany]}.
        </p>
      )}
      <ErrorNote message={error} />
    </div>
  );
}

export function ReceiveGoodsForm({ poId, remaining }: { poId: number; remaining: number }) {
  const [qty, setQty] = useState(String(remaining));
  const { run, busy, error } = useAction();
  return (
    <div>
      <div className="flex items-center justify-end gap-2">
        <input className="input num !h-8 !w-[72px]" type="number" min={1} max={remaining} value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Quantity received" />
        <button className="btn btn-sm" disabled={busy || !(Number(qty) >= 1)} onClick={() => run(() => post(`/api/orders/${poId}/receive`, { quantity: Number(qty) }))}>
          Record delivery
        </button>
      </div>
      <ErrorNote message={error} />
    </div>
  );
}

/* ---------- suppliers ---------- */

const emptyBank = { bankName: "", accountHolder: "", accountNumber: "", branchCode: "" };

function BankFields({ v, set }: { v: typeof emptyBank; set: (k: keyof typeof emptyBank, val: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Bank">
        <input className="input" required value={v.bankName} onChange={(e) => set("bankName", e.target.value)} placeholder="For example: First National Bank" />
      </Field>
      <Field label="Account holder">
        <input className="input" required value={v.accountHolder} onChange={(e) => set("accountHolder", e.target.value)} />
      </Field>
      <Field label="Account number" hint="6 to 16 digits">
        <input className="input num" required inputMode="numeric" value={v.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
      </Field>
      <Field label="Branch code" hint="5 or 6 digits">
        <input className="input num" required inputMode="numeric" value={v.branchCode} onChange={(e) => set("branchCode", e.target.value)} />
      </Field>
    </div>
  );
}

export function AddSupplierForm() {
  const [name, setName] = useState("");
  const [bank, setBank] = useState(emptyBank);
  const [done, setDone] = useState<string | null>(null);
  const { run, busy, error } = useAction();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setDone(null);
        const ok = await run(() => post("/api/suppliers", { name, ...bank }));
        if (ok) {
          setDone(`${name} was added. The Finance Manager has to verify them before invoices from them look normal.`);
          setName("");
          setBank(emptyBank);
        }
      }}
    >
      <Field label="Supplier name">
        <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <BankFields v={bank} set={(k, val) => setBank((p) => ({ ...p, [k]: val }))} />
      <button className="btn btn-primary" disabled={busy}>
        Add supplier
      </button>
      {done && <p className="text-[14px] text-low">{done}</p>}
      <ErrorNote message={error} />
    </form>
  );
}

export function BankChangeForm({ suppliers }: { suppliers: { id: number; name: string }[] }) {
  const [id, setId] = useState(String(suppliers[0]?.id ?? ""));
  const [bank, setBank] = useState(emptyBank);
  const [done, setDone] = useState<string | null>(null);
  const { run, busy, error } = useAction();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setDone(null);
        const ok = await run(() => post(`/api/suppliers/${id}/bank`, bank));
        if (ok) {
          setDone("Bank details updated. Invoices from this supplier will be flagged for the next 30 days.");
          setBank(emptyBank);
        }
      }}
    >
      <Field label="Supplier">
        <select className="input" value={id} onChange={(e) => setId(e.target.value)}>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <BankFields v={bank} set={(k, val) => setBank((p) => ({ ...p, [k]: val }))} />
      <button className="btn" disabled={busy}>
        Save new bank details
      </button>
      {done && <p className="text-[14px] text-low">{done}</p>}
      <ErrorNote message={error} />
    </form>
  );
}

export function VerifyButton({ id }: { id: number }) {
  const { run, busy, error } = useAction();
  return (
    <div>
      <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run(() => post(`/api/suppliers/${id}/verify`))}>
        Verify supplier
      </button>
      <ErrorNote message={error} />
    </div>
  );
}

/* ---------- payment ---------- */

export function PayButton({ id }: { id: number }) {
  const { run, busy, error } = useAction();
  return (
    <div>
      <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run(() => post(`/api/invoices/${id}/pay`))}>
        {busy ? "Paying..." : "Pay"}
      </button>
      <ErrorNote message={error} />
    </div>
  );
}
