import { requirePage } from "@/lib/auth";
import { listAudit } from "@/lib/queries";
import { fmtDateTime } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { Empty, PageHeader, Panel } from "@/components/ui";

function label(action: string) {
  const s = action.replace(/[._]/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function detail(d: Record<string, unknown>): string {
  return Object.entries(d)
    .filter(([, v]) => v !== "" && v !== null && v !== undefined)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(", ");
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePage("/audit");
  const { q = "" } = await searchParams;
  const rows = await listAudit(q.trim());

  return (
    <>
      <PageHeader
        title="Audit trail"
        subtitle="Who did what, and when. Entries are only ever added, never changed or deleted."
        actions={
          <form method="get" className="flex gap-2">
            <input className="input !w-[260px]" name="q" defaultValue={q} placeholder="Search person, action or reference" aria-label="Search the audit trail" />
            <button className="btn">Search</button>
          </form>
        }
      />
      <Panel flush>
        {rows.length === 0 ? (
          <Empty title="No matching entries" />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Reference</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="num whitespace-nowrap text-mute">{fmtDateTime(r.at)}</td>
                    <td className="whitespace-nowrap">
                      <div>{r.user_name}</div>
                      <div className="text-[13px] text-mute">{ROLE_LABEL[r.user_role as Role] ?? r.user_role}</div>
                    </td>
                    <td className="whitespace-nowrap font-medium">{label(r.action)}</td>
                    <td className="num">{r.entity_ref ?? "-"}</td>
                    <td className="max-w-[420px] text-[14px] text-mute">{detail(r.details)}</td>
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
