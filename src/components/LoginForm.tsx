"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post, ErrorNote } from "./api";
import { Field } from "./ui";

interface Account {
  email: string;
  name: string;
  role: string;
  color: string;
}

export function LoginForm({ demo, accounts }: { demo: boolean; accounts: Account[] }) {
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

      {demo && (
        <div className="mt-8 border-t border-line pt-6">
          <p className="mb-3 text-[14px] text-mute">Demo accounts. Pick a role to sign in as that person.</p>
          <div className="grid gap-2">
            {accounts.map((a) => (
              <button
                key={a.email}
                type="button"
                disabled={busy}
                onClick={() => signIn(a.email, "Password123!")}
                className="panel-raised flex items-center justify-between px-4 py-2.5 text-left hover:border-[#3b414a] disabled:opacity-50"
              >
                <span className="flex items-center gap-3 font-medium">
                  <span className="h-3 w-3 rounded-full" style={{ background: a.color }} />
                  {a.role}
                </span>
                <span className="text-[14px] text-mute">{a.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
