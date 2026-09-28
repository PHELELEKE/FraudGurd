import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { getAlert } from "@/lib/queries";
import { can } from "@/lib/roles";
import { daysSince, fmtDate, fmtDateTime, maskAccount, rand } from "@/lib/format";
import { Amount, Panel, RiskTag, StatusTag, Tag } from "@/components/ui";
import { AlertDecision } from "@/components/AlertDecision";

export default async function AlertPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage("/alerts");
  const { id } = await params;
  const alertId = Number(id);
  if (!Number.isInteger(alertId)) notFound();
  const a = await getAlert(alertId);
  if (!a) notFound();

  const { match, bank } = a.snapshot;
  const active = a.status === "open" || a.status === "escalated";
  const scoreColor = a.band === "high" ? "text-high" : "text-mid";
  const sameBank = (k: keyof typeof bank.onFile) => bank.onFile[k] === bank.onInvoice[k];
  const changedDays = bank.changedAt ? daysSince(bank.changedAt) : null;

  return (
    <>
      <nav className="mb-4 text-[14px] text-mute" aria-label="Breadcrumb">
        <Link href="/alerts" className="link">
          Alerts
        </Link>
        <span className="mx-2">/</span>
        <span className="num text-ink">{a.ref}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-9 font-semibold tracking-tight">
            Invoice {a.invoice.number} from {a.supplier}
          </h1>
          <p className="mt-1 text-mute">
            Captured {fmtDateTime(a.created_at)} against {a.po.ref} for {a.po.item}.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[28px] leading-9 font-semibold">
            <Amount value={a.invoice.total} />
          </div>
          <div className="mt-1">
            <StatusTag status={a.status} label={active ? "Payment held" : undefined} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Panel title="Risk score" subtitle="Each rule that fired adds points. 60 or more is high risk.">
            <div className="grid gap-6 sm:grid-cols-[180px_minmax(0,1fr)]">
              <div className="panel-raised flex flex-col items-center justify-center px-4 py-6 text-center">
                <div className={`num text-[56px] leading-none font-semibold ${scoreColor}`}>{a.score}</div>
                <div className="mt-1 text-[14px] text-mute">out of 100</div>
                <div className="mt-3">
                  <RiskTag score={a.score} band={a.band} />
                </div>
              </div>
              <ul className="divide-y divide-line">
                {a.reasons.map((r) => (
                  <li key={r.code} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                    <div>
                      <div className="font-medium">{r.title}</div>
                      <div className="mt-0.5 text-[14px] text-mute">{r.detail}</div>
                    </div>
                    <span className="tag tag-neutral num shrink-0">+{r.points}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel
            title="Supplier bank details"
            subtitle="The account on file compared with the account on this invoice"
            action={changedDays !== null && changedDays <= 30 ? <Tag tone="mid">Changed {changedDays === 0 ? "today" : `${changedDays} day${changedDays === 1 ? "" : "s"} ago`}</Tag> : undefined}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <BankCard title="On file" side={bank.onFile} other={bank.onInvoice} />
              <BankCard title="On this invoice" side={bank.onInvoice} other={bank.onFile} flag={!sameBank("accountNumber")} />
            </div>
          </Panel>

          <Panel title="Three-way match" subtitle="Purchase order, goods received and supplier invoice side by side" flush>
            <div className={`mx-6 mb-4 rounded-[10px] border px-4 py-3 text-[14px] ${match.ok ? "border-low/40 bg-low/10 text-low" : "border-high/40 bg-high/10 text-high"}`}>
              {match.ok ? "The three documents agree." : match.issues.join(" ")}
            </div>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Purchase order</th>
                    <th>Goods received</th>
                    <th>Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="text-mute">Document</td>
                    <td className="num">{a.po.ref}</td>
                    <td className="num">{a.grns.length ? a.grns.map((g) => g.ref).join(", ") : "None recorded"}</td>
                    <td className="num">{a.invoice.number}</td>
                  </tr>
                  <tr>
                    <td className="text-mute">Quantity</td>
                    <td className="num">{match.qty.po}</td>
                    <td className={`num ${match.qty.received === 0 ? "text-high" : ""}`}>{match.qty.received}</td>
                    <td className={`num ${match.qty.ok ? "" : "font-medium text-high"}`}>{match.qty.invoice}</td>
                  </tr>
                  <tr>
                    <td className="text-mute">Unit price</td>
                    <td className="num">{rand(match.price.po)}</td>
                    <td className="text-mute">-</td>
                    <td className={`num ${match.price.ok ? "" : "font-medium text-high"}`}>{rand(match.price.invoice)}</td>
                  </tr>
                  <tr>
                    <td className="text-mute">Total</td>
                    <td className="num">{rand(a.po.total)}</td>
                    <td className="num">{rand(match.expectedTotal)}</td>
                    <td className={`num ${match.variance === 0 ? "" : "font-medium text-high"}`}>
                      {rand(match.invoiceTotal)}
                      {match.variance !== 0 && <div className="text-[13px] font-normal">{match.variance > 0 ? "+" : "-"}{rand(Math.abs(match.variance))} against goods received</div>}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Decision" subtitle={active ? "Only the Finance Manager can decide this alert." : undefined}>
            {active ? (
              <AlertDecision alertId={a.id} canDecide={can(user.role, "alert.decide")} escalated={a.status === "escalated"} previousComment={a.status === "escalated" ? a.comment : null} />
            ) : (
              <div className="space-y-3">
                <StatusTag status={a.status} label={a.status === "cleared" ? "Cleared, payment approved" : "Rejected, no payment"} />
                <p className="text-[14px] text-mute">
                  {a.resolved_by_name} on {fmtDateTime(a.resolved_at)}
                </p>
                {a.comment && <p className="panel-raised px-4 py-3 text-[15px]">{a.comment}</p>}
              </div>
            )}
          </Panel>

          <Panel title="Activity" subtitle="Everything that happened to this purchase">
            <ol className="relative space-y-4 border-l border-line pl-5">
              {a.timeline.map((t, i) => (
                <li key={i} className="relative">
                  <span className="absolute top-[7px] -left-[25px] h-2 w-2 rounded-full bg-mute" />
                  <div className="text-[15px]">{t.what}</div>
                  <div className="text-[13px] text-mute">
                    {t.who}, {fmtDateTime(t.at)}
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          <p className="px-1 text-[13px] text-mute">Invoice date {fmtDate(a.invoice.date)}. Invoice reference {a.invoice.ref}.</p>
        </div>
      </div>
    </>
  );
}

function BankCard({
  title,
  side,
  other,
  flag,
}: {
  title: string;
  side: { bankName: string; accountHolder: string; accountNumber: string; branchCode: string };
  other: { bankName: string; accountHolder: string; accountNumber: string; branchCode: string };
  flag?: boolean;
}) {
  const rows: [string, string, boolean][] = [
    ["Bank", side.bankName, side.bankName !== other.bankName],
    ["Account holder", side.accountHolder, side.accountHolder !== other.accountHolder],
    ["Account number", maskAccount(side.accountNumber), side.accountNumber !== other.accountNumber],
    ["Branch code", side.branchCode, side.branchCode !== other.branchCode],
  ];
  return (
    <div className={`panel-raised p-4 ${flag ? "border-high/50" : ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium">{title}</h3>
        {flag && <Tag tone="high">Different account</Tag>}
      </div>
      <dl className="space-y-2.5 text-[15px]">
        {rows.map(([k, val, diff]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-mute">{k}</dt>
            <dd className={`num text-right ${diff && title !== "On file" ? "font-medium text-high" : ""}`}>{val}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
