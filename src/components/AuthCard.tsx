"use client";
import { useEffect, useRef, useState } from "react";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";
import { ForgotForm } from "./ForgotForm";

/**
 * One card with two faces. The front is sign in. Register and Forgot password share the back,
 * so clicking either link flips the same card instead of opening a new page.
 */
export function AuthCard({
  departments,
  signupCodeRequired,
}: {
  departments: string[];
  signupCodeRequired: boolean;
}) {
  const [flipped, setFlipped] = useState(false);
  const [backView, setBackView] = useState<"register" | "forgot">("register");
  const [height, setHeight] = useState<number | null>(null);
  const front = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLDivElement>(null);

  // The card is as tall as whichever face is showing, and follows it as it grows or shrinks.
  useEffect(() => {
    const el = (flipped ? back : front).current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [flipped]);

  function flipTo(next: "signin" | "register" | "forgot") {
    if (next === "signin") {
      setFlipped(false);
    } else {
      setBackView(next);
      setFlipped(true);
    }
    // Move the cursor into the face that is now showing (skipped on touch screens so the keyboard doesn't jump up).
    if (window.matchMedia("(pointer: fine)").matches) {
      window.setTimeout(() => {
        (next === "signin" ? front : back).current?.querySelector<HTMLElement>("input, select")?.focus({ preventScroll: true });
      }, 350);
    }
  }

  return (
    <div className="auth-flip">
      <div
        className={`auth-flip-inner${flipped ? " is-flipped" : ""}${height !== null ? " is-ready" : ""}`}
        style={height !== null ? { height } : undefined}
      >
        <div className="auth-face auth-face-front" ref={front} inert={flipped} aria-hidden={flipped}>
          <div className="auth-card">
            <h1 className="login-title">Sign in</h1>
            <p className="login-lead">FraudGuard flags unusual purchases for a person to review. It never accuses anyone.</p>
            <LoginForm onForgot={() => flipTo("forgot")} onRegister={() => flipTo("register")} />
          </div>
        </div>
        <div className="auth-face auth-face-back" ref={back} inert={!flipped} aria-hidden={!flipped}>
          <div className="auth-card">
            {backView === "forgot" ? (
              <ForgotForm onBack={() => flipTo("signin")} />
            ) : (
              <RegisterForm departments={departments} signupCodeRequired={signupCodeRequired} onBack={() => flipTo("signin")} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
