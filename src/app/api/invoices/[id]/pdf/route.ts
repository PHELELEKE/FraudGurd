import { getCurrentUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { buildPurchasePdf } from "@/lib/pdf";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("You are signed out. Sign in again.", { status: 401, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  if (!["accountant", "finance_manager", "auditor"].includes(user.role)) {
    return new Response("Your role is not allowed to do this.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const { id } = await ctx.params;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId) || invoiceId < 1) {
    return new Response("Invalid id in the URL.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const invoice = await queryOne<{ ref: string }>("select ref from invoices where id = $1", [invoiceId]);
  if (!invoice) return new Response("Invoice not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const pdf = await buildPurchasePdf(invoiceId, user.name);
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="FraudGuard-${invoice.ref}.pdf"`,
    },
  });
}
