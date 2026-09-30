"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post, ErrorNote } from "./api";
import { Field } from "./ui";
import { PasswordField } from "./PasswordField";

export function RegisterForm({
  departments,
  signupCodeRequired,
  onBack,
}: {
  departments: string[];
  signupCodeRequired: boolean;
  onBack: () => void;
}) {
  const router = useRouter();
  const [f, setF] = useState({ name: "", email: "", phone: "", department: departments[0] ?? "", password: "", confirm: "", signupCode: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.password !== f.confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { home } = await post<{ home: string }>("/api/register", f);
      router.push(home);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account.");
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="login-title">Create your account</h1>
      <p className="login-lead">
        For employees. Managers, procurement, accounting, finance and audit accounts are created by your Manager.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name">
          <input className="input" autoComplete="name" required value={f.name} onChange={(e) => set("name")(e.target.value)} />
        </Field>
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" required value={f.email} onChange={(e) => set("email")(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone number">
            <input className="input" type="tel" autoComplete="tel" required placeholder="082 123 4567" value={f.phone} onChange={(e) => set("phone")(e.target.value)} />
          </Field>
          <Field label="Department">
            <select className="input" required value={f.department} onChange={(e) => set("department")(e.target.value)}>
              {departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <PasswordField label="Password" autoComplete="new-password" value={f.password} onChange={set("password")} />
          <PasswordField label="Confirm password" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} />
        </div>
        <p className="-mt-1 text-[13px] text-[#8f9bb5]">At least 8 characters, with a letter and a number.</p>
        {signupCodeRequired && (
          <Field label="Signup code" hint="Ask your Manager for it.">
            <input className="input" required value={f.signupCode} onChange={(e) => set("signupCode")(e.target.value)} />
          </Field>
        )}
        <button className="btn btn-primary w-full" disabled={busy} type="submit">
          {busy ? "Creating account..." : "Create account"}
        </button>
      </form>
      <ErrorNote message={error} />
      <p className="auth-row">
        <span>Already registered?</span>
        <button type="button" className="auth-link" onClick={onBack}>
          Sign in
        </button>
      </p>
    </>
  );
}
