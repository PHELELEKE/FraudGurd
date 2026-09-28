import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { listOrders } from "@/lib/queries";
import { todayIso } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { InvoiceCapture } from "@/components/InvoiceCapture";
import { can } from "@/lib/roles";
import { redirect } from "next/navigation";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ po?: string }> }) {
  const user = await requirePage("/invoices");
  if (!can(user.role, "invoice.capture")) redirect("/invoices");
  const { po } = await searchParams;
  const orders = (await listOrders()).filter((o) => o.status !== "paid");

  return (
    <>
      <nav className="mb-4 text-[14px] text-mute" aria-label="Breadcrumb">
        <Link href="/invoices" className="link">
          Invoices
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink">Capture invoice</span>
      </nav>
      <PageHeader title="Capture supplier invoice" subtitle="Enter the invoice, check the three-way match, and let FraudGuard run the rules." />
      <InvoiceCapture
        today={todayIso()}
        defaultPoId={po ? Number(po) : undefined}
        orders={orders.map((o) => ({
          id: o.id,
          ref: o.ref,
          supplier: o.supplier,
          supplierStatus: o.supplier_status,
          item: o.item,
          quantity: o.quantity,
          unitPrice: o.unit_price,
          total: o.total,
          received: o.received,
          status: o.status,
          bank: { bankName: o.bank_name, accountHolder: o.account_holder, accountNumber: o.account_number, branchCode: o.branch_code },
        }))}
      />
    </>
  );
}
