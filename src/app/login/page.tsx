import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { homeFor } from "@/lib/roles";
import { Logo } from "@/components/ui";
import { LoginForm } from "@/components/LoginForm";
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
          <h1 className="login-title">Sign in</h1>
          <p className="login-lead">
            FraudGuard flags unusual purchases for a person to review. It never accuses anyone.
          </p>
          <LoginForm />
        </section>

        <footer className="login-foot">Fraud monitoring for Small Civils and VZ Coatings</footer>
      </div>
    </main>
  );
}
