import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { homeFor } from "@/lib/roles";
import { DEMO_ACCOUNTS } from "@/lib/demo";
import { Logo } from "@/components/ui";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  const demo = process.env.DEMO_MODE !== "false";

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-[440px]">
        <div className="mb-8 flex items-center gap-3">
          <Logo size={36} />
          <span className="text-2xl font-semibold tracking-tight">FraudGuard</span>
        </div>
        <div className="panel p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 mb-6 text-mute">
            FraudGuard flags unusual purchases for a person to review. It never accuses anyone.
          </p>
          <LoginForm demo={demo} accounts={[...DEMO_ACCOUNTS]} />
        </div>
      </div>
    </main>
  );
}
