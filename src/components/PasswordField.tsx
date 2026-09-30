"use client";
import { useState } from "react";
import { Field } from "./ui";

/** A password box with a Show / Hide button, so people can check what they typed. */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <span className="relative block">
        <input
          className="input pw-input"
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="pw-toggle" aria-pressed={show} onClick={() => setShow((s) => !s)}>
          {show ? "Hide" : "Show"}
        </button>
      </span>
    </Field>
  );
}

/** A readable temporary password with no look-alike characters (no 0/O, 1/l/I). */
export function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const pw = Array.from(bytes, (b) => chars[b % chars.length]).join("");
    if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) return pw;
  }
}
