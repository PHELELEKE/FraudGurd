import Link from "next/link";
import { Logo } from "@/components/ui";
import { ResetLinkForm } from "@/components/ResetLinkForm";
import { resetLinkIsValid } from "@/lib/people";
import "../login/login.css";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const valid = await resetLinkIsValid(token);

  return (
    <main className="login-shell">
      <div className="login-inner">
        <header className="login-brand">
          <Logo size={36} />
          <span>FraudGuard</span>
        </header>
        <section className="login-main">
          <div className="auth-card">
            {valid ? (
              <>
                <h1 className="login-title">Choose a new password</h1>
                <p className="login-lead">This link works once.</p>
                <ResetLinkForm token={token} />
              </>
            ) : (
              <>
                <h1 className="login-title">Link expired</h1>
                <p className="login-lead">This reset link is invalid, has already been used, or is older than 30 minutes.</p>
                <Link href="/login" className="btn btn-primary w-full">
                  Back to sign in
                </Link>
              </>
            )}
          </div>
        </section>
        <footer className="login-foot">Fraud monitoring for Small Civils and VZ Coatings</footer>
      </div>
    </main>
  );
}
