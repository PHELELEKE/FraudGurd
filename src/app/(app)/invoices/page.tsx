import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { listInvoices, listReadyToInvoice, type InvoiceRow } from "@/lib/queries";
import { can } from "@/lib/roles";
import { fmtDate, rand } from "@/lib/format";
import { parseCompanyFilter } from "@/lib/companies";
import { AmountVat, CompanyTag, Empty, PageHeader, Panel, RiskTag, StatusTag } from "@/components/ui";
import { CompanyFilterBar } from "@/components/CompanyFilter";
import { PayButton } from "@/components/actions";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const user = await requirePage("/invoices");
  const { company } = await searchParams;
  const companyFilter = parseCompanyFilter(company);
  const canCapture = can(user.role, "invoice.capture");
  const canPay = can(user.role, "invoice.pay");
  const invoices = await listInvoices(100, companyFilter);

  if (!canCapture) {
    // Finance Manager and Auditor: a plain read-only list of every invoice.
    return (
      <>
        <PageHeader title="Supplier invoices" subtitle="Low-risk invoices are approved automatically. Everything else is held until the Finance Manager decides." />
        <div className="mb-4">
          <CompanyFilterBar current={companyFilter} basePath="/invoices" />
        </div>
        <Panel flush>
          <InvoiceTable rows={invoices} />
        </Panel>
      </>
    );
  }

  // Accountant: a work list, in the order the work happens.
  const ready = await listReadyToInvoice(companyFilter);
  const toPay = invoices.filter((i) => i.status === "approved");
  const held = invoices.filter((i) => i.status === "held");
  const history = invoices.filter((i) => i.status === "paid" || i.status === "rejected").slice(0, 15);
  const payTotal = toPay.reduce((s, i) => s + i.total, 0);

  return (
    <>
      <PageHeader
        title="Invoices and payments"
        subtitle="You capture supplier invoices and you make the payments. Nothing is paid until the fraud check has cleared it."
        actions={
          <Link href="/invoices/new" className="btn btn-primary">
            Capture invoice
          </Link>
        }
      />

      <div className="mb-4">
        <CompanyFilterBar current={companyFilter} basePath="/invoices" />
      </div>

      <div className="space-y-4">
        <Panel
          title="Ready to pay"
          subtitle={toPay.length ? `${toPay.length} invoice${toPay.length === 1 ? "" : "s"}, ${rand(payTotal)} in total. These passed the fraud check.` : "Invoices that passed the fraud check show up here."}
          flush
        >
          {toPay.length === 0 ? (
            <Empty title="Nothing to pay right now" />
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Company</th>
                    <th>Supplier</th>
                    <th>Purchase order</th>
                    <th className="r">Amount</th>
                    <th>Risk</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {toPay.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <div className="num font-medium">{i.invoice_number}</div>
                        <div className="num text-[13px] text-mute">{i.ref}</div>
                      </td>
                      <td>
                        <CompanyTag company={i.company} />
                      </td>
                      <td>{i.supplier}</td>
                      <td className="num">{i.po_ref}</td>
                      <td className="r">
                        <AmountVat value={i.total} className="font-medium" />
                      </td>
                      <td>
                        <RiskTag score={i.risk_score} band={i.risk_band} />
                      </td>
                      <td className="r">{canPay && <div className="flex justify-end"><PayButton id={i.id} /></div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Delivered, waiting for an invoice" subtitle="When the supplier's invoice arrives, capture it here to run the three-way match and the fraud check." flush>
          {ready.length === 0 ? (
            <Empty title="No deliveries are waiting for an invoice" />
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Purchase order</th>
                    <th>Company</th>
                    <th>Supplier</th>
                    <th>Delivered</th>
                    <th className="r">Expected amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {ready.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="font-medium">{p.item}</div>
                        <div className="num text-[13px] text-mute">{p.ref}</div>
                      </td>
                      <td>
                        <CompanyTag company={p.company} />
                      </td>
                      <td>{p.supplier}</td>
                      <td className="num">
                        {p.received} of {p.quantity} units, {fmtDate(p.delivered_at)}
                      </td>
                      <td className="r">
                        <AmountVat value={p.received * p.unit_price} />
                      </td>
                      <td className="r">
                        <Link href={`/invoices/new?po=${p.id}`} className="btn btn-sm btn-primary">
                          Capture invoice
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {held.length > 0 && (
          <Panel title="Held for review" subtitle="Payment is blocked until the Finance Manager decides. Nothing for you to do here." flush>
            <InvoiceTable rows={held} />
          </Panel>
        )}

        <Panel title="Recently finished" subtitle="Paid and rejected invoices" flush>
          <InvoiceTable rows={history} />
        </Panel>
      </div>
    </>
  );
}

function InvoiceTable({ rows }: { rows: InvoiceRow[] }) {
  if (rows.length === 0) return <Empty title="No invoices yet" />;
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Company</th>
            <th>Supplier</th>
            <th>Purchase order</th>
            <th className="r">Amount</th>
            <th>Risk</th>
            <th>Status</th>
            <th>Captured</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id}>
              <td>
                <div className="num font-medium">{i.invoice_number}</div>
                <div className="num text-[13px] text-mute">
                  {i.ref}, dated {fmtDate(i.invoice_date)}
                </div>
              </td>
              <td>
                <CompanyTag company={i.company} />
              </td>
              <td>{i.supplier}</td>
              <td className="num">{i.po_ref}</td>
              <td className="r">
                <AmountVat value={i.total} />
              </td>
              <td>
                <RiskTag score={i.risk_score} band={i.risk_band} />
              </td>
              <td>
                <StatusTag status={i.status} label={i.status === "approved" ? "Ready to pay" : undefined} />
              </td>
              <td>
                <div className="num">{fmtDate(i.captured_at)}</div>
                <div className="text-[13px] text-mute">{i.captured_by_name}</div>
              </td>
              <td className="r">
                {i.alert_id && (
                  <Link href={`/alerts/${i.alert_id}`} className="btn btn-sm">
                    {i.status === "held" ? "Review" : "Alert"}
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
