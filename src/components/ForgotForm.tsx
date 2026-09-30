"use client";
import { useState } from "react";
import { post, ErrorNote } from "./api";
import { Field } from "./ui";

export function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; demoLink?: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await post<{ message: string; demoLink?: string }>("/api/password/forgot", { email }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="login-title">Reset your password</h1>
      <p className="login-lead">
        Employees can reset their own password here. Every other role asks the Manager to reset it.
      </p>
      {result ? (
        <div className="space-y-3">
          <p role="status" className="rounded-[10px] border border-low/40 bg-low/10 px-3 py-2 text-[14px] text-low">
            {result.message}
          </p>
          {result.demoLink && (
            <p className="text-[14px] text-[#b7c2d9]">
              Demo mode, so no email is sent.{" "}
              <a className="auth-link" href={result.demoLink}>
                Open your reset link
              </a>{" "}
              (works once, for 30 minutes).
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <button className="btn btn-primary w-full" disabled={busy} type="submit">
            {busy ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}
      <ErrorNote message={error} />
      <p className="auth-row">
        <button type="button" className="auth-link" onClick={onBack}>
          Back to sign in
        </button>
      </p>
    </>
  );
}
