"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post, ErrorNote } from "./api";
import { Field } from "./ui";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: string, p: string) {
    setBusy(true);
    setError(null);
    try {
      const { home } = await post<{ home: string }>("/api/login", { email: e, password: p });
      router.push(home);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          signIn(email, password);
        }}
        className="space-y-4"
      >
        <Field label="Email">
          <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button className="btn btn-primary w-full" disabled={busy} type="submit">
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <ErrorNote message={error} />
    </>
  );
}
