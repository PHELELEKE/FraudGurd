"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export async function post<T = any>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "The request failed. Try again.");
  window.dispatchEvent(new Event("fg:changed")); // lets the nav badges update straight away
  return data as T;
}

/** Runs an async action, tracks busy/error state, and refreshes the page data when it succeeds. */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(fn: () => Promise<T>, opts: { refresh?: boolean } = {}): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      const out = await fn();
      if (opts.refresh !== false) router.refresh();
      return out;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy, error, setError };
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 rounded-[10px] border border-high/40 bg-high/10 px-3 py-2 text-[14px] text-high">
      {message}
    </p>
  );
}
