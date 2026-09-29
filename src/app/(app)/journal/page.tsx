import { requirePage } from "@/lib/auth";
import { getJournal } from "@/lib/queries";
import { fmtDateTime, rand } from "@/lib/format";
import { CompanyTag, Empty, PageHeader, Panel, Tag } from "@/components/ui";
import { CompanyFilterBar } from "@/components/CompanyFilter";
import { parseCompanyFilter } from "@/lib/companies";

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  await requirePage("/journal");
  const { company } = await searchParams;
  const companyFilter = parseCompanyFilter(company);
  const { entries, balances } = await getJournal(companyFilter);
  const totalDebit = balances.reduce((s, b) => s + b.debit, 0);
  const totalCredit = balances.reduce((s, b) => s + b.credit, 0);
  const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100);

  return (
    <>
      <PageHeader
        title="Journal"
        subtitle="Entries are posted automatically. Invoices are VAT-inclusive, so each one splits into the cost, VAT Input and Accounts Payable."
      />
      <div className="mb-4">
        <CompanyFilterBar current={companyFilter} basePath="/journal" />
      </div>
      <div className="space-y-4">
        <Panel
          title="Account totals"
          action={<Tag tone={balanced ? "low" : "high"}>{balanced ? "Debits equal credits" : "Out of balance"}</Tag>}
          flush
        >
          {balances.length === 0 ? (
            <Empty title="Nothing posted yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th className="r">Debits</th>
                    <th className="r">Credits</th>
                    <th className="r">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b) => {
                    const bal = b.debit - b.credit;
                    return (
                      <tr key={b.account}>
                        <td>{b.account}</td>
                        <td className="num r">{b.debit ? rand(b.debit) : "-"}</td>
                        <td className="num r">{b.credit ? rand(b.credit) : "-"}</td>
                        <td className="num r">{rand(Math.abs(bal))} {bal >= 0 ? "Dr" : "Cr"}</td>
                      </tr>
                    );
                  })}
                  <tr className="font-semibold">
                    <td>Total</td>
                    <td className="num r">{rand(totalDebit)}</td>
                    <td className="num r">{rand(totalCredit)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Latest entries" subtitle="The 40 most recent journal entries" flush>
          {entries.length === 0 ? (
            <Empty title="No journal entries yet" />
          ) : (
            <ul className="divide-y divide-line">
              {entries.map((e) => (
                <li key={e.id} className="px-6 py-4">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="num font-medium">{e.ref}</span>
                      {e.company && <CompanyTag company={e.company} />}
                      <span>{e.description}</span>
                    </div>
                    <div className="num text-[13px] text-mute">
                      {fmtDateTime(e.posted_at)}
                      {e.posted_by ? `, ${e.posted_by}` : ""}
                    </div>
                  </div>
                  <table className="table">
                    <tbody>
                      {e.lines.map((l, i) => (
                        <tr key={i}>
                          <td className={l.credit > 0 ? "pl-10 text-mute" : ""}>{l.account}</td>
                          <td className="num r w-[160px]">{l.debit > 0 ? rand(l.debit) : ""}</td>
                          <td className="num r w-[160px]">{l.credit > 0 ? rand(l.credit) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
