import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { homeFor } from "@/lib/roles";
import { DEPARTMENTS } from "@/lib/queries";
import { Logo } from "@/components/ui";
import { AuthCard } from "@/components/AuthCard";
import "./login.css";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return (
    <main className="login-shell">
      <div className="login-inner">
        <header className="login-brand">
          <Logo size={36} />
          <span>FraudGuard</span>
        </header>

        <section className="login-main">
          <AuthCard
            departments={[...DEPARTMENTS]}
            signupCodeRequired={Boolean(process.env.SIGNUP_CODE)}
          />
        </section>

        <footer className="login-foot">Fraud monitoring for Small Civils and VZ Coatings</footer>
      </div>
    </main>
  );
}
