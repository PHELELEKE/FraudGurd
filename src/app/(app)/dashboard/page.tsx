import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { getDashboard, listInvoices } from "@/lib/queries";
import { randCompact, fmtDate } from "@/lib/format";
import { AmountVat, CompanyTag, Empty, Panel, PageHeader, RiskTag, StatusTag } from "@/components/ui";
import { CompanyFilterBar } from "@/components/CompanyFilter";
import { parseCompanyFilter } from "@/lib/companies";
import { RiskDonut, WeeklyBars } from "@/components/Charts";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const user = await requirePage("/dashboard");
  const { company } = await searchParams;
  const companyFilter = parseCompanyFilter(company);
  const [d, recent] = await Promise.all([getDashboard(companyFilter), listInvoices(8, companyFilter)]);
  const pct = (n: number) => (d.total ? Math.round((n / d.total) * 100) : 0);
  const canReview = user.role === "finance_manager" || user.role === "auditor";

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Every supplier invoice is checked against the fraud rules before it can be paid."
        actions={
          canReview && d.awaiting > 0 ? (
            <Link href="/alerts" className="btn btn-primary">
              Review {d.awaiting} alert{d.awaiting === 1 ? "" : "s"}
            </Link>
          ) : undefined
        }
      />

      <div className="mb-4">
        <CompanyFilterBar current={companyFilter} basePath="/dashboard" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Invoices checked" value={d.total} note={`${randCompact(d.paidValue)} paid so far`} color="accent" pct={100} />
        <Kpi label="Low risk" value={d.low} note={`${pct(d.low)}% went straight through`} color="low" pct={pct(d.low)} />
        <Kpi label="Medium risk" value={d.medium} note={`${pct(d.medium)}% held for review`} color="mid" pct={pct(d.medium)} />
        <Kpi label="High risk" value={d.high} note={`${pct(d.high)}% held for review`} color="high" pct={pct(d.high)} />
        <Kpi label="Waiting for review" value={d.awaiting} note={`${randCompact(d.heldValue)} on hold`} color="accent" pct={d.total ? Math.round((d.awaiting / d.total) * 100) : 0} highlight />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel title="Risk levels" subtitle="All invoices checked so far">
          <RiskDonut low={d.low} medium={d.medium} high={d.high} />
          <p className="mt-5 border-t border-line pt-4 text-[14px] text-mute">
            Average time to resolve an alert:{" "}
            <span className="num font-medium text-ink">
              {d.avgResolveHours === null ? "no alerts resolved yet" : `${d.avgResolveHours.toFixed(1)} hours`}
            </span>
          </p>
        </Panel>
        <Panel title="Alerts by week" subtitle="Raised compared with resolved, last 6 weeks">
          <WeeklyBars weeks={d.weeks} />
        </Panel>
      </div>

      <Panel
        className="mt-4"
        title="Recent invoices"
        subtitle="The latest invoices and how the rules scored them"
        flush
        action={
          canReview ? (
            <div className="flex gap-2">
              <Link href="/invoices" className="btn btn-sm">
                All invoices
              </Link>
              <Link href="/journal" className="btn btn-sm">
                Journal
              </Link>
            </div>
          ) : undefined
        }
      >
        {recent.length === 0 ? (
          <Empty title="No invoices yet">Invoices show up here once the Accountant captures the first one.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Captured</th>
                  <th>Company</th>
                  <th>Invoice</th>
                  <th>Supplier</th>
                  <th className="r">Amount</th>
                  <th>Risk</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recent.map((i) => (
                  <tr key={i.id}>
                    <td className="num text-mute">{fmtDate(i.captured_at)}</td>
                    <td>
                      <CompanyTag company={i.company} />
                    </td>
                    <td>
                      <div className="num font-medium">{i.invoice_number}</div>
                      <div className="num text-[13px] text-mute">{i.ref}</div>
                    </td>
                    <td>{i.supplier}</td>
                    <td className="r">
                      <AmountVat value={i.total} />
                    </td>
                    <td>
                      <RiskTag score={i.risk_score} band={i.risk_band} />
                    </td>
                    <td>
                      <StatusTag status={i.status} />
                    </td>
                    <td className="r">
                      {i.alert_id && canReview ? (
                        <Link href={`/alerts/${i.alert_id}`} className="btn btn-sm">
                          {i.status === "held" ? "Review" : "Details"}
                        </Link>
                      ) : null}
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

function Kpi({
  label,
  value,
  note,
  color,
  pct,
  highlight,
}: {
  label: string;
  value: number;
  note: string;
  color: "accent" | "low" | "mid" | "high";
  pct: number;
  highlight?: boolean;
}) {
  const bar = { accent: "bg-accent", low: "bg-low", mid: "bg-mid", high: "bg-high" }[color];
  return (
    <div className="panel p-5">
      <div className="text-[14px] text-mute">{label}</div>
      <div className={`num mt-2 text-[32px] leading-10 font-semibold ${highlight ? "text-accent" : ""}`}>{value}</div>
      <div className="mt-0.5 text-[14px] text-mute">{note}</div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-raised">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(pct, value > 0 ? 3 : 0)}%` }} />
      </div>
    </div>
  );
}
