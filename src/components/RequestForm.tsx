"use client";
import { useState } from "react";
import { post, useAction, ErrorNote } from "./api";
import { Field } from "./ui";

export function RequestForm({
  categories,
  departments,
  defaultDepartment,
}: {
  categories: string[];
  departments: string[];
  defaultDepartment: string;
}) {
  const empty = { item: "", category: categories[0] ?? "", quantity: "1", estimatedCost: "", department: defaultDepartment, reason: "" };
  const [f, setF] = useState(empty);
  const [done, setDone] = useState<string | null>(null);
  const { run, busy, error } = useAction();
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setDone(null);
        const out = await run(() => post<{ ref: string }>("/api/requests", f));
        if (out) {
          setDone(`${out.ref} was sent for approval.`);
          setF(empty);
        }
      }}
    >
      <Field label="What do you need?">
        <input className="input" required maxLength={120} placeholder="For example: 10 x Laptops" value={f.item} onChange={set("item")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantity">
          <input className="input num" type="number" min={1} step={1} required value={f.quantity} onChange={set("quantity")} />
        </Field>
        <Field label="Estimated cost (R)">
          <input className="input num" type="number" min={0.01} step="0.01" required value={f.estimatedCost} onChange={set("estimatedCost")} />
        </Field>
      </div>
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
      {done && <p className="text-[14px] text-low">{done}</p>}
      <ErrorNote message={error} />
    </form>
  );
}
