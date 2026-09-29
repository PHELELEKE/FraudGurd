import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { listAlerts } from "@/lib/queries";
import { fmtDateTime } from "@/lib/format";
import { Amount, CompanyTag, Empty, PageHeader, Panel, RiskTag, StatusTag } from "@/components/ui";
import { CompanyFilterBar } from "@/components/CompanyFilter";
import { parseCompanyFilter } from "@/lib/companies";

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ show?: string; company?: string }> }) {
  const user = await requirePage("/alerts");
  const { show, company } = await searchParams;
  const filter = show === "all" ? "all" : "active";
  const companyFilter = parseCompanyFilter(company);
  const alerts = await listAlerts(filter, companyFilter);

  return (
    <>
      <PageHeader
        title="Alerts"
        subtitle="Invoices the rules held back. Nothing here is proven fraud, it just needs a person to check."
        actions={
          <div className="flex gap-1 rounded-[10px] border border-line bg-panel p-1">
            <Link href={{ pathname: "/alerts", query: companyFilter !== "all" ? { company: companyFilter } : {} }} className={`rounded-lg px-3 py-1.5 text-[14px] ${filter === "active" ? "bg-raised font-medium" : "text-mute"}`}>
              Needs review
            </Link>
            <Link href={{ pathname: "/alerts", query: { show: "all", ...(companyFilter !== "all" ? { company: companyFilter } : {}) } }} className={`rounded-lg px-3 py-1.5 text-[14px] ${filter === "all" ? "bg-raised font-medium" : "text-mute"}`}>
              All alerts
            </Link>
          </div>
        }
      />
      <div className="mb-4">
        <CompanyFilterBar current={companyFilter} basePath="/alerts" extraQuery={filter === "all" ? { show: "all" } : {}} />
      </div>
      <Panel flush>
        {alerts.length === 0 ? (
          <Empty title={filter === "active" ? "Nothing needs review" : "No alerts yet"}>
            {filter === "active"
              ? "When an invoice scores 25 or more, it appears here and its payment is held."
              : "Alerts appear when the rules hold back an invoice."}
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Alert</th>
                  <th>Company</th>
                  <th>Invoice</th>
                  <th>Supplier</th>
                  <th className="r">Amount</th>
                  <th>Risk</th>
                  <th>Why it was flagged</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <div className="num font-medium">{a.ref}</div>
                      <div className="num text-[13px] text-mute">{fmtDateTime(a.created_at)}</div>
                    </td>
                    <td>
                      <CompanyTag company={a.company} />
                    </td>
                    <td className="num">{a.invoice_number}</td>
                    <td>{a.supplier}</td>
                    <td className="r">
                      <Amount value={a.total} />
                    </td>
                    <td>
                      <RiskTag score={a.score} band={a.band} />
                    </td>
                    <td className="max-w-[280px] text-[14px] text-mute">{a.reasons.map((r) => r.title).join("; ")}</td>
                    <td>
                      <StatusTag status={a.status} />
                    </td>
                    <td className="r">
                      <Link href={`/alerts/${a.id}`} className={`btn btn-sm ${user.role === "finance_manager" && (a.status === "open" || a.status === "escalated") ? "btn-primary" : ""}`}>
                        {user.role === "finance_manager" && (a.status === "open" || a.status === "escalated") ? "Review" : "Details"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
