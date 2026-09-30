"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post, ErrorNote } from "./api";
import { PasswordField } from "./PasswordField";

/** Used on the Account page, and on its own when a password was just set by someone else. */
export function ChangePasswordForm({ currentLabel = "Current password" }: { currentLabel?: string }) {
  const router = useRouter();
  const [f, setF] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.newPassword !== f.confirm) {
      setError("The two new passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await post("/api/account/password", f);
      setF({ currentPassword: "", newPassword: "", confirm: "" });
      setDone(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4">
      <PasswordField label={currentLabel} autoComplete="current-password" value={f.currentPassword} onChange={set("currentPassword")} />
      <PasswordField
        label="New password"
        autoComplete="new-password"
        value={f.newPassword}
        onChange={set("newPassword")}
        hint="At least 8 characters, with a letter and a number."
      />
      <PasswordField label="Confirm new password" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} />
      <button className="btn btn-primary" disabled={busy} type="submit">
        {busy ? "Saving..." : "Change password"}
      </button>
      <ErrorNote message={error} />
      {done && (
        <p role="status" className="rounded-[10px] border border-low/40 bg-low/10 px-3 py-2 text-[14px] text-low">
          Password changed.
        </p>
      )}
    </form>
  );
}
