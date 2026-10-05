"use client";
import { useMemo, useState } from "react";
import { post, useAction, ErrorNote } from "./api";
import { Field } from "./ui";
import { addVat } from "@/lib/money";
import { rand } from "@/lib/format";
import { COMPANIES, COMPANY_LABEL, COMPANY_COLOR, type Company } from "@/lib/companies";

export function RequestForm({
  categories,
  departments,
  defaultDepartment,
  defaultCompany,
}: {
  categories: string[];
  departments: string[];
  defaultDepartment: string;
  defaultCompany: Company;
}) {
  const empty = {
    item: "",
    category: categories[0] ?? "",
    quantity: "1",
    estimatedCost: "",
    department: defaultDepartment,
    reason: "",
    company: defaultCompany as string,
  };
  const [f, setF] = useState(empty);
  const [done, setDone] = useState<{ ref: string; possibleDuplicateCount: number } | null>(null);
  const { run, busy, error } = useAction();
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));
  const vat = useMemo(() => addVat(Number(f.estimatedCost) || 0), [f.estimatedCost]);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setDone(null);
        const out = await run(() => post<{ ref: string; possibleDuplicateCount: number }>("/api/requests", f));
        if (out) {
          setDone({ ref: out.ref, possibleDuplicateCount: out.possibleDuplicateCount ?? 0 });
          setF(empty);
        }
      }}
    >
      <Field label="Company">
        <select className="input" value={f.company} onChange={set("company")}>
          {COMPANIES.map((c) => (
            <option key={c} value={c}>
              {COMPANY_LABEL[c]}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex items-center gap-2 text-[13px] text-mute">
        <span className="company-dot" style={{ background: COMPANY_COLOR[f.company as Company] }} />
        This request will belong to {COMPANY_LABEL[f.company as Company]}.
      </div>

      <Field label="What do you need?">
        <input className="input" required maxLength={120} placeholder="For example: 10 x Laptops" value={f.item} onChange={set("item")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity">
          <input className="input num" type="number" min={1} step={1} required value={f.quantity} onChange={set("quantity")} />
        </Field>
        <Field label="Estimated cost (R, excl. VAT)">
          <input className="input num" type="number" min={0.01} step="0.01" required value={f.estimatedCost} onChange={set("estimatedCost")} />
        </Field>
      </div>
      {Number(f.estimatedCost) > 0 && (
        <p className="num -mt-2 text-[13px] text-mute">
          + VAT {rand(vat.vat)} = {rand(vat.total)} incl. VAT
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select className="input" value={f.category} onChange={set("category")}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Department">
          <select className="input" value={f.department} onChange={set("department")}>
            {departments.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Reason">
        <textarea className="input" rows={3} required maxLength={300} placeholder="Why is this needed?" value={f.reason} onChange={set("reason")} />
      </Field>
      <button className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Sending..." : "Send for approval"}
      </button>
      {done && (
        <p className={`text-[14px] ${done.possibleDuplicateCount ? "text-mid" : "text-low"}`}>
          {done.ref} was sent for approval.
          {done.possibleDuplicateCount > 0 && ` ${done.possibleDuplicateCount} possible similar pending request${done.possibleDuplicateCount === 1 ? " was" : "s were"} flagged for approver review.`}
        </p>
      )}
      <ErrorNote message={error} />
    </form>
  );
}
