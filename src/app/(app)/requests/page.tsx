import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { DEPARTMENTS, listCategories, listRequests } from "@/lib/queries";
import { can } from "@/lib/roles";
import { fmtDate } from "@/lib/format";
import { COMPANY_LABEL, parseCompanyFilter } from "@/lib/companies";
import { AmountExclVat, CompanyTag, Empty, PageHeader, Panel, StatusTag } from "@/components/ui";
import { CompanyFilterBar } from "@/components/CompanyFilter";
import { RequestForm } from "@/components/RequestForm";
import { RequestActions } from "@/components/RequestActions";

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ show?: string; company?: string }> }) {
  const user = await requirePage("/requests");
  const { show, company } = await searchParams;
  const companyFilter = parseCompanyFilter(company);
  const [all, categories] = await Promise.all([listRequests(user, companyFilter), listCategories()]);
  const canCreate = can(user.role, "request.create");
  const canDecide = can(user.role, "request.decide");

  // Approvers see a queue of what is waiting for them first. Managers approve employees, the Finance Manager approves managers.
  const mine = (r: (typeof all)[number]) =>
    r.status === "pending" &&
    r.requester_id !== user.id &&
    (user.role === "finance_manager" ? r.requester_role !== "employee" : r.requester_role === "employee");
  const view = canDecide && show !== "all" ? "queue" : "all";
  const rows = view === "queue" ? all.filter(mine) : all;
  const queueCount = all.filter(mine).length;
  const extraQuery: Record<string, string> = view === "all" ? { show: "all" } : {};

  const form = (
    <RequestForm
      categories={categories.map((c) => c.category)}
      departments={[...DEPARTMENTS]}
      defaultDepartment={(DEPARTMENTS as readonly string[]).includes(user.department) ? user.department : "Admin"}
      defaultCompany="small_civils"
    />
  );

  return (
    <>
      <PageHeader
        title={user.role === "employee" ? "My requests" : canDecide ? "Requests" : "All requests"}
        subtitle={
          user.role === "employee"
            ? "Ask for what you need. A manager approves it before anything is ordered. Amounts are entered excluding VAT."
            : user.role === "manager"
              ? "Approve or reject what your team asks for. You can never decide your own request."
              : user.role === "finance_manager"
                ? "Managers' requests come to you. You can never decide your own request."
                : "Every purchase starts as a request that is approved before anything is ordered."
        }
        actions={
          canDecide ? (
            <div className="flex gap-1 rounded-[10px] border border-line bg-panel p-1">
              <Link href={{ pathname: "/requests", query: companyFilter !== "all" ? { company: companyFilter } : {} }} className={`rounded-lg px-3 py-1.5 text-[14px] ${view === "queue" ? "bg-raised font-medium" : "text-mute"}`}>
                Waiting for me{queueCount > 0 ? ` (${queueCount})` : ""}
              </Link>
              <Link href={{ pathname: "/requests", query: { show: "all", ...(companyFilter !== "all" ? { company: companyFilter } : {}) } }} className={`rounded-lg px-3 py-1.5 text-[14px] ${view === "all" ? "bg-raised font-medium" : "text-mute"}`}>
                All requests
              </Link>
            </div>
          ) : undefined
        }
      />

      <div className="mb-4">
        <CompanyFilterBar current={companyFilter} basePath="/requests" extraQuery={extraQuery} />
      </div>

      <div className={`grid grid-cols-1 gap-4 ${user.role === "employee" ? "lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]" : ""}`}>
        {user.role === "employee" && (
          <Panel title="New request" subtitle="Tell us what you need, why, and which company it is for.">
            {form}
          </Panel>
        )}

        <div className="space-y-4">
          {user.role === "manager" && (
            <details className="panel group">
              <summary className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
                <span>
                  <span className="text-lg font-semibold tracking-tight">Make a request of your own</span>
                  <span className="mt-0.5 block text-[14px] text-mute">Your own requests are approved by the Finance Manager.</span>
                </span>
                <span className="btn btn-sm">Open form</span>
              </summary>
              <div className="border-t border-line px-4 py-5 sm:px-6">{form}</div>
            </details>
          )}

          <Panel title={view === "queue" ? "Waiting for your decision" : user.role === "employee" ? "Your requests" : "All requests"} flush>
            {rows.length === 0 ? (
              <Empty title={view === "queue" ? "Nothing is waiting for you" : "No requests yet"}>
                {view === "queue"
                  ? "New requests appear here by themselves and a badge shows on the menu."
                  : user.role === "employee"
                    ? "Use the form to make the first one."
                    : "Requests appear here once people make them."}
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Request</th>
                      <th>Company</th>
                      <th className="r">Qty</th>
                      <th className="r">Estimate (excl. VAT)</th>
                      {user.role !== "employee" && <th>Requested by</th>}
                      <th>Status</th>
                      {canDecide && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="max-w-[280px]">
                          <div className="font-medium">{r.item}</div>
                          <div className="num text-[13px] text-mute">
                            {r.ref}, {r.category}, {r.department}, {fmtDate(r.created_at)}
                          </div>
                          {r.status === "pending" && <div className="mt-1 text-[13px] text-mute">Reason: {r.reason}</div>}
                          {r.duplicates.length > 0 && (
                            <div className="mt-2 rounded border border-line bg-panel px-2 py-1 text-[12px] text-ink">
                              <span className="mr-1">⚠</span>
                              Duplicate of {r.duplicates.map((d) => `${COMPANY_LABEL[d.company]}: ${d.requester} (${d.ref})`).join("; ")}
                            </div>
                          )}
                          {user.role !== "employee" && r.possible_duplicates.length > 0 && (
                            <div className="mt-2 rounded border border-mid/40 bg-mid/10 px-2 py-1 text-[12px] text-ink">
                              Possible match suggested by AI; review manually: {r.possible_duplicates.map((d) => `${d.quantity} x ${d.item} (${d.category}, ${COMPANY_LABEL[d.company]}, ${d.ref})`).join("; ")}
                            </div>
                          )}
                          {r.decision_note && <div className="mt-1 text-[13px] text-mute">Note: {r.decision_note}</div>}
                        </td>
                        <td>
                          <CompanyTag company={r.company} />
                        </td>
                        <td className="num r">{r.quantity}</td>
                        <td className="r">
                          <AmountExclVat value={r.estimated_cost} />
                        </td>
                        {user.role !== "employee" && <td>{r.requester}</td>}
                        <td>
                          <StatusTag status={r.status} />
                          {r.decided_by_name && <div className="mt-1 text-[13px] text-mute">by {r.decided_by_name}</div>}
                        </td>
                        {canDecide && (
                          <td className="r">
                            {r.status !== "pending" ? null : r.requester_id === user.id ? (
                              <span className="text-[13px] text-mute">Your own request. Someone else has to decide it.</span>
                            ) : user.role === "manager" && r.requester_role !== "employee" ? (
                              <span className="text-[13px] text-mute">Goes to the Finance Manager.</span>
                            ) : (
                              <RequestActions id={r.id} duplicates={r.duplicates} possibleDuplicates={r.possible_duplicates} />
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
