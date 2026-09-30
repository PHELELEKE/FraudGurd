/**
 * Sends email through Brevo or Resend when a key is set (BREVO_API_KEY or RESEND_API_KEY).
 * With no key, mailConfigured() is false and the app shows the reset link on screen in demo mode instead.
 * MAIL_FROM is the sender, for example: FraudGuard <you@example.com>
 */
export function mailConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY);
}

function parseFrom(raw: string): { name: string; email: string } {
  const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || "FraudGuard", email: m[2]! } : { name: "FraudGuard", email: raw.trim() };
}

export async function sendMail(opts: { to: string; subject: string; text: string; html: string }): Promise<void> {
  const fromRaw = process.env.MAIL_FROM;
  if (!fromRaw) throw new Error("MAIL_FROM is not set.");
  const from = parseFrom(fromRaw);

  if (process.env.BREVO_API_KEY) {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: from, to: [{ email: opts.to }], subject: opts.subject, htmlContent: opts.html, textContent: opts.text }),
    });
    if (!res.ok) throw new Error(`Brevo rejected the email (${res.status}): ${await res.text()}`);
    return;
  }

  if (process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: fromRaw, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
    });
    if (!res.ok) throw new Error(`Resend rejected the email (${res.status}): ${await res.text()}`);
    return;
  }

  throw new Error("No email service is configured.");
}
