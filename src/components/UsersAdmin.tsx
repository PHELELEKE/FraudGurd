"use client";
import { useState } from "react";
import { post, useAction, ErrorNote } from "./api";
import { Field } from "./ui";
import { generatePassword } from "./PasswordField";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked: the text is on screen to copy by hand */
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function CreateUserForm({ roles, departments }: { roles: { value: string; label: string }[]; departments: string[] }) {
  const { run, busy, error, setError } = useAction();
  const [f, setF] = useState({ name: "", email: "", phone: "", role: roles[0]?.value ?? "", department: departments[0] ?? "", password: "" });
  const [created, setCreated] = useState<{ name: string; email: string; password: string; mustChange: boolean } | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setCreated(null);
    const out = await run(() => post<{ mustChange: boolean }>("/api/users", f));
    if (out) {
      setCreated({ name: f.name, email: f.email.trim().toLowerCase(), password: f.password, mustChange: out.mustChange });
      setF((s) => ({ ...s, name: "", email: "", phone: "", password: "" }));
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name">
          <input className="input" required value={f.name} onChange={(e) => set("name")(e.target.value)} />
        </Field>
        <Field label="Email (their sign-in)">
          <input className="input" type="email" required value={f.email} onChange={(e) => set("email")(e.target.value)} />
        </Field>
        <Field label="Phone number (optional)">
          <input className="input" type="tel" value={f.phone} onChange={(e) => set("phone")(e.target.value)} />
        </Field>
        <Field label="Role">
          <select className="input" value={f.role} onChange={(e) => set("role")(e.target.value)}>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Department">
          <select className="input" value={f.department} onChange={(e) => set("department")(e.target.value)}>
            {departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </Field>
        <Field label="Starting password" hint="At least 8 characters, with a letter and a number.">
          <span className="flex gap-2">
            <input className="input min-w-0 flex-1" required value={f.password} onChange={(e) => set("password")(e.target.value)} autoComplete="off" />
            <button type="button" className="btn" onClick={() => set("password")(generatePassword())}>
              Generate
            </button>
          </span>
        </Field>
      </div>
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy ? "Creating..." : "Create user"}
      </button>
      <ErrorNote message={error} />
      {created && (
        <div role="status" className="rounded-[10px] border border-low/40 bg-low/10 px-3 py-3 text-[14px]">
          <p className="font-medium text-low">{created.name} can now sign in.</p>
          <p className="mt-1 break-all text-mute">
            Email: <span className="text-ink">{created.email}</span>
            <br />
            Password: <span className="text-ink">{created.password}</span>
          </p>
          <p className="mt-1 text-mute">
            {created.mustChange ? "They will be asked to choose their own password the first time they sign in." : "Give them these details. They cannot change the password themselves, so contact you to reset it."}
          </p>
          <div className="mt-2">
            <CopyButton text={`Email: ${created.email}\nPassword: ${created.password}`} />
          </div>
        </div>
      )}
    </form>
  );
}

export function ResetPasswordControl({ userId, name }: { userId: number; name: string }) {
  const { run, busy, error, setError } = useAction();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [done, setDone] = useState<{ password: string; mustChange: boolean } | null>(null);

  function start() {
    setPw(generatePassword());
    setDone(null);
    setError(null);
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const out = await run(() => post<{ mustChange: boolean }>(`/api/users/${userId}/reset-password`, { password: pw }));
    if (out) {
      setDone({ password: pw, mustChange: out.mustChange });
      setOpen(false);
    }
  }

  if (done) {
    return (
      <div className="min-w-[220px] text-[14px]">
        <p className="font-medium text-low">Password reset for {name}.</p>
        <p className="mt-1 break-all text-mute">
          New password: <span className="text-ink">{done.password}</span>
        </p>
        <p className="mt-1 text-mute">{done.mustChange ? "They will choose a new one when they sign in." : "Give it to them. They cannot change it themselves."}</p>
        <div className="mt-2 flex gap-2">
          <CopyButton text={done.password} />
          <button type="button" className="btn btn-sm" onClick={() => setDone(null)}>
            Done
          </button>
        </div>
      </div>
    );
  }
  if (!open) {
    return (
      <button type="button" className="btn btn-sm" onClick={start}>
        Reset password
      </button>
    );
  }
  return (
    <form onSubmit={save} className="min-w-[240px] space-y-2">
      <input className="input" aria-label={`New password for ${name}`} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? "Saving..." : "Save"}
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setPw(generatePassword())}>
          Generate
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <ErrorNote message={error} />
    </form>
  );
}
