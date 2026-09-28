import Link from "next/link";
import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getTasks } from "@/lib/attention";
import { NAV_BY_ROLE, ROLE_COLOR, ROLE_LABEL, homeFor } from "@/lib/roles";
import { initials } from "@/lib/format";
import { Logo } from "@/components/ui";
import { NavLinks, SignOutButton } from "@/components/Nav";
import { AttentionProvider, TaskStrip } from "@/components/Attention";

export const dynamic = "force-dynamic";

function greetingFor(name: string): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", hour: "numeric", hourCycle: "h23" }).format(new Date())
  );
  const word = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${word}, ${name.split(" ")[0]}`;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const tasks = await getTasks(user);
  const color = ROLE_COLOR[user.role];

  return (
    <div className="min-h-screen" style={{ "--role": color } as CSSProperties}>
      <AttentionProvider initial={tasks}>
        <header className="app-bar sticky top-0 z-20">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 md:h-16 md:flex-nowrap md:px-6 md:py-0">
            <Link href="/" className="flex items-center gap-2.5">
              <Logo />
              <span className="text-lg font-semibold tracking-tight">FraudGuard</span>
            </Link>
            <NavLinks items={NAV_BY_ROLE[user.role]} />
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <div className="text-[14px] leading-tight font-medium">{user.name}</div>
                <div className="text-[13px] leading-tight font-medium" style={{ color }}>
                  {ROLE_LABEL[user.role]}
                </div>
              </div>
              <div className="avatar grid h-9 w-9 place-items-center rounded-full text-[13px] font-bold">{initials(user.name)}</div>
              <SignOutButton />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1280px] px-4 py-6 md:px-6 md:py-8">
          <TaskStrip greeting={greetingFor(user.name)} home={homeFor(user.role)} />
          {children}
        </main>
      </AttentionProvider>
    </div>
  );
}
