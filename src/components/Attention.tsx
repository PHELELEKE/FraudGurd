"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export interface Task {
  key: string;
  navHref: string;
  href: string;
  count: number;
  text: string;
  tone: "high" | "mid" | "accent";
  badge: boolean;
}

interface Toast {
  id: number;
  task: Task;
}

const Ctx = createContext<Task[]>([]);
export const useTasks = () => useContext(Ctx);

const POLL_MS = 30_000;

/**
 * Keeps the list of things that need this person's attention up to date, without reloading the page.
 * It checks every 30 seconds while the tab is open, when you come back to the tab, and right after you do something.
 * When a count changes because of someone else, the page data refreshes and a notice pops up for new items.
 */
export function AttentionProvider({ initial, children }: { initial: Task[]; children: React.ReactNode }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initial);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const before = useRef<Record<string, number>>(Object.fromEntries(initial.map((t) => [t.key, t.count])));
  const nextId = useRef(1);

  const load = useCallback(
    async (own: boolean) => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/attention", { cache: "no-store" });
        if (!res.ok) return;
        const { tasks: next } = (await res.json()) as { tasks: Task[] };
        const prev = before.current;
        const grew = next.filter((t) => t.count > (prev[t.key] ?? 0));
        const changed = next.length !== Object.keys(prev).length || next.some((t) => t.count !== (prev[t.key] ?? 0));
        before.current = Object.fromEntries(next.map((t) => [t.key, t.count]));
        setTasks(next);
        if (own) return; // the page already refreshed itself after your own action
        if (grew.length) {
          setToasts((cur) => [...cur, ...grew.map((task) => ({ id: nextId.current++, task }))].slice(-3));
        }
        if (changed) router.refresh();
      } catch {
        /* offline or server restarting: try again next time */
      }
    },
    [router]
  );

  useEffect(() => {
    const tick = setInterval(() => load(false), POLL_MS);
    const back = () => load(false);
    const mine = () => load(true);
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    window.addEventListener("fg:changed", mine);
    return () => {
      clearInterval(tick);
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("fg:changed", mine);
    };
  }, [load]);

  // Notices go away by themselves after 9 seconds.
  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setTimeout(() => setToasts((cur) => cur.slice(1)), 9000);
    return () => clearTimeout(t);
  }, [toasts]);

  const toneBar = { high: "var(--color-high)", mid: "var(--color-mid)", accent: "var(--role, var(--color-accent))" };

  return (
    <Ctx.Provider value={tasks}>
      {children}
      <div className="fixed right-4 bottom-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map(({ id, task }) => (
          <div key={id} className="panel flex items-start gap-3 p-4" style={{ borderLeft: `4px solid ${toneBar[task.tone]}` }}>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-mute">New</div>
              <Link href={task.href} className="font-medium hover:underline" onClick={() => setToasts((c) => c.filter((x) => x.id !== id))}>
                {task.text}
              </Link>
            </div>
            <button className="btn btn-sm" onClick={() => setToasts((c) => c.filter((x) => x.id !== id))} aria-label="Dismiss">
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** The bar at the top of each page: greeting on the home page, and a button for everything that needs you. */
export function TaskStrip({ greeting, home }: { greeting: string; home: string }) {
  const tasks = useTasks();
  const path = usePathname();
  const onHome = path === home;
  const total = tasks.filter((t) => t.badge).reduce((s, t) => s + t.count, 0);

  if (tasks.length === 0 && !onHome) return null;

  const btn = { high: "task-high", mid: "task-mid", accent: "task-accent" };

  return (
    <div className="panel mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4" style={{ borderLeft: "4px solid var(--role, var(--color-accent))" }}>
      <div>
        {onHome && <p className="text-lg font-semibold tracking-tight">{greeting}</p>}
        <p className={onHome ? "text-mute" : "font-medium"}>
          {tasks.length === 0
            ? "You are all caught up. New work shows up here by itself."
            : total > 0
              ? `${total} thing${total === 1 ? "" : "s"} need${total === 1 ? "s" : ""} you right now.`
              : "Here is what is going on."}
        </p>
      </div>
      {tasks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tasks.map((t) => (
            <Link key={t.key} href={t.href} className={`task ${btn[t.tone]}`}>
              <span className="task-count num">{t.count}</span>
              {t.text}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
