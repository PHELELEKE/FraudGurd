"use client";
import { useState } from "react";
import Link from "next/link";
import { post, ErrorNote } from "./api";
import { PasswordField } from "./PasswordField";

export function ResetLinkForm({ token }: { token: string }) {
  const [f, setF] = useState({ password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.password !== f.confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await post("/api/password/reset", { token, ...f });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the password.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <p role="status" className="rounded-[10px] border border-low/40 bg-low/10 px-3 py-2 text-[14px] text-low">
          Your password has been changed.
        </p>
        <Link href="/login" className="btn btn-primary w-full">
          Sign in
        </Link>
      </div>
    );
  }
  return (
    <>
      <form onSubmit={submit} className="space-y-4">
        <PasswordField
          label="New password"
          autoComplete="new-password"
          value={f.password}
          onChange={(v) => setF((s) => ({ ...s, password: v }))}
          hint="At least 8 characters, with a letter and a number."
        />
        <PasswordField label="Confirm new password" autoComplete="new-password" value={f.confirm} onChange={(v) => setF((s) => ({ ...s, confirm: v }))} />
        <button className="btn btn-primary w-full" disabled={busy} type="submit">
          {busy ? "Saving..." : "Set new password"}
        </button>
      </form>
      <ErrorNote message={error} />
    </>
  );
}
