"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { post } from "./api";
import { useTasks } from "./Attention";

const RANK = { high: 3, mid: 2, accent: 1 } as const;

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  const tasks = useTasks();

  return (
    <nav className="order-last flex w-full min-w-0 gap-1.5 overflow-x-auto pb-1 md:order-none md:w-auto md:pb-0" aria-label="Main">
      {items.map((i) => {
        const active = path === i.href || path.startsWith(i.href + "/");
        const mine = tasks.filter((t) => t.badge && t.navHref === i.href);
        const count = mine.reduce((s, t) => s + t.count, 0);
        const tone = mine.reduce<"high" | "mid" | "accent">((best, t) => (RANK[t.tone] > RANK[best] ? t.tone : best), "accent");
        return (
          <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className="nav-link">
            {i.label}
            {count > 0 && (
              <span className={`nav-badge nav-badge-${tone}`} aria-label={`${count} need attention`}>
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="btn btn-sm"
      onClick={async () => {
        await post("/api/logout");
        router.push("/login");
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
