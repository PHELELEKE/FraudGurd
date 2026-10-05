/** Read-only queries used by the pages. */
import { query, queryOne } from "./db";
import type { Reason, MatchDetail } from "./rules";
import type { SessionUser } from "./auth";
import type { Company, CompanyFilter } from "./companies";

/** Turns a company filter into a SQL clause fragment and its parameter, for queries that already have other params. */
function companyClause(col: string, filter: CompanyFilter | undefined, paramIndex: number): { sql: string; params: unknown[] } {
  if (!filter || filter === "all") return { sql: "", params: [] };
  return { sql: `${col} = $${paramIndex}`, params: [filter] };
}

/* ---------- reference data ---------- */

export interface Category {
  category: string;
  normal_max: number;
  ledger_account: string;
}
export const listCategories = () =>
  query<Category>("select category, normal_max, ledger_account from category_norms order by category");

export const DEPARTMENTS = ["IT", "Finance", "Sales", "Operations", "HR", "Admin"] as const;

/* ---------- suppliers (shared by both companies) ---------- */

export interface SupplierRow {
  id: number;
  name: string;
  status: "pending" | "approved";
  bank_name: string;
  account_holder: string;
  account_number: string;
  branch_code: string;
  bank_changed_at: Date | null;
  verified_at: Date | null;
}
export const listSuppliers = () =>
  query<SupplierRow>(
    `select id, name, status, bank_name, account_holder, account_number, branch_code, bank_changed_at, verified_at
       from suppliers order by name`
  );

/* ---------- requests ---------- */

export interface RequestDuplicate {
  ref: string;
  company: Company;
  requester: string;
  created_at: Date;
  item: string;
  category: string;
  quantity: number;
}

export interface RequestRow {
  id: number;
  ref: string;
  item: string;
  category: string;
  department: string;
  quantity: number;
  estimated_cost: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "ordered" | "cancelled";
  requester_id: number;
  requester: string;
  requester_role: string;
  company: Company;
  decided_by_name: string | null;
  decided_at: Date | null;
  decision_note: string | null;
  created_at: Date;
  duplicates: RequestDuplicate[];
  possible_duplicates: RequestDuplicate[];
}
export function listRequests(user: SessionUser, companyFilter?: CompanyFilter) {
  const ownOnly = user.role === "employee";
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (ownOnly) {
    params.push(user.id);
    clauses.push(`r.requester_id = $${params.length}`);
  }
  if (companyFilter && companyFilter !== "all") {
    params.push(companyFilter);
    clauses.push(`r.company = $${params.length}`);
  }
  return query<RequestRow>(
    `select r.id, r.ref, r.item, r.category, r.department, r.quantity, r.estimated_cost, r.reason, r.status,
            r.requester_id, u.name as requester, u.role as requester_role, r.company,
            d.name as decided_by_name, r.decided_at, r.decision_note, r.created_at,
            coalesce((
              select json_agg(json_build_object(
                'ref', d2.ref,
                'company', d2.company,
                'requester', du.name,
                'created_at', d2.created_at,
                'item', d2.item,
                'category', d2.category,
                'quantity', d2.quantity
              ) order by d2.created_at)
              from purchase_requests d2
              join users du on du.id = d2.requester_id
              where d2.status = 'pending'
                and d2.id <> r.id
                and lower(trim(d2.item)) = lower(trim(r.item))
            ), '[]'::json) as duplicates,
            coalesce((
              select json_agg(json_build_object(
                'ref', d2.ref,
                'company', d2.company,
                'requester', du.name,
                'created_at', d2.created_at,
                'item', d2.item,
                'category', d2.category,
                'quantity', d2.quantity
              ) order by d2.created_at)
              from unnest(r.possible_duplicate_ids) as suggestion(id)
              join purchase_requests d2 on d2.id = suggestion.id and d2.status = 'pending'
              join users du on du.id = d2.requester_id
              where lower(trim(d2.item)) <> lower(trim(r.item))
            ), '[]'::json) as possible_duplicates
       from purchase_requests r
       join users u on u.id = r.requester_id
       left join users d on d.id = r.decided_by
      ${clauses.length ? "where " + clauses.join(" and ") : ""}
      order by (r.status = 'pending') desc, r.created_at desc
      limit 100`,
    params
  );
}

export function listApprovedRequests(companyFilter?: CompanyFilter) {
  const { sql, params } = companyClause("r.company", companyFilter, 1);
  return query<RequestRow>(
    `select r.id, r.ref, r.item, r.category, r.department, r.quantity, r.estimated_cost, r.reason, r.status,
            r.requester_id, u.name as requester, u.role as requester_role, r.company,
            null::text as decided_by_name, r.decided_at, r.decision_note, r.created_at,
            '[]'::json as duplicates, '[]'::json as possible_duplicates
       from purchase_requests r join users u on u.id = r.requester_id
      where r.status = 'approved' ${sql ? "and " + sql : ""}
      order by r.decided_at`,
    params
  );
}

/* ---------- purchase orders ---------- */

export interface OrderRow {
  id: number;
  ref: string;
  request_ref: string;
  item: string;
  supplier_id: number;
  supplier: string;
  supplier_status: "pending" | "approved";
  quantity: number;
  unit_price: number;
  total: number;
  status: "issued" | "received" | "invoiced" | "paid";
  received: number;
  created_at: Date;
  company: Company;
  request_company: Company;
  bank_name: string;
  account_holder: string;
  account_number: string;
  branch_code: string;
}
export function listOrders(companyFilter?: CompanyFilter) {
  const { sql, params } = companyClause("po.company", companyFilter, 1);
  return query<OrderRow>(
    `select po.id, po.ref, r.ref as request_ref, r.item, po.supplier_id, s.name as supplier,
            s.status as supplier_status, po.quantity, po.unit_price, po.total, po.status, po.created_at,
            po.company, r.company as request_company,
            s.bank_name, s.account_holder, s.account_number, s.branch_code,
            coalesce((select sum(g.quantity) from goods_received g where g.po_id = po.id), 0)::int as received
       from purchase_orders po
       join purchase_requests r on r.id = po.request_id
       join suppliers s on s.id = po.supplier_id
      ${sql ? "where " + sql : ""}
      order by po.created_at desc limit 100`,
    params
  );
}

/* ---------- invoices ---------- */

export interface InvoiceRow {
  id: number;
  ref: string;
  invoice_number: string;
  invoice_date: string;
  supplier: string;
  po_ref: string;
  total: number;
  risk_score: number;
  risk_band: "low" | "medium" | "high";
  status: "approved" | "held" | "paid" | "rejected";
  captured_at: Date;
  captured_by_name: string | null;
  alert_id: number | null;
  company: Company;
}
export function listInvoices(limit = 100, companyFilter?: CompanyFilter) {
  const params: unknown[] = [limit];
  const { sql } = companyClause("i.company", companyFilter, 2);
  if (sql) params.push(companyFilter);
  return query<InvoiceRow>(
    `select i.id, i.ref, i.invoice_number, i.invoice_date, s.name as supplier, po.ref as po_ref, i.total,
            i.risk_score, i.risk_band, i.status, i.captured_at, u.name as captured_by_name, al.id as alert_id,
            i.company
       from invoices i
       join suppliers s on s.id = i.supplier_id
       join purchase_orders po on po.id = i.po_id
       left join users u on u.id = i.captured_by
       left join alerts al on al.invoice_id = i.id
      ${sql ? "where " + sql : ""}
      order by i.captured_at desc limit $1`,
    params
  );
}

/* ---------- alerts ---------- */

export interface AlertRow {
  id: number;
  ref: string;
  score: number;
  band: "medium" | "high";
  status: "open" | "escalated" | "cleared" | "rejected";
  created_at: Date;
  invoice_ref: string;
  invoice_number: string;
  supplier: string;
  total: number;
  reasons: Reason[];
  company: Company;
}
export function listAlerts(filter: "active" | "all", companyFilter?: CompanyFilter) {
  const clauses: string[] = [];
  if (filter === "active") clauses.push("al.status in ('open','escalated')");
  const { sql } = companyClause("i.company", companyFilter, 1);
  if (sql) clauses.push(sql);
  return query<AlertRow>(
    `select al.id, al.ref, al.score, al.band, al.status, al.created_at, al.reasons,
            i.ref as invoice_ref, i.invoice_number, s.name as supplier, i.total, i.company
       from alerts al
       join invoices i on i.id = al.invoice_id
       join suppliers s on s.id = i.supplier_id
      ${clauses.length ? "where " + clauses.join(" and ") : ""}
      order by (al.status in ('open','escalated')) desc, al.score desc, al.created_at desc limit 100`,
    companyFilter && companyFilter !== "all" ? [companyFilter] : []
  );
}

export interface BankSide {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  branchCode: string;
}

export interface AlertDetail {
  id: number;
  ref: string;
  score: number;
  band: "medium" | "high";
  status: "open" | "escalated" | "cleared" | "rejected";
  reasons: Reason[];
  comment: string | null;
  created_at: Date;
  resolved_at: Date | null;
  resolved_by_name: string | null;
  company: Company;
  snapshot: { match: MatchDetail; bank: { onFile: BankSide; onInvoice: BankSide; changedAt: string | null } };
  invoice: {
    id: number;
    ref: string;
    number: string;
    date: string;
    quantity: number;
    unit_price: number;
    total: number;
    status: string;
  };
  supplier: string;
  po: { ref: string; quantity: number; unit_price: number; total: number; item: string };
  grns: { ref: string; quantity: number; received_at: Date }[];
  timeline: { at: Date; who: string; what: string }[];
}

export async function getAlert(id: number): Promise<AlertDetail | null> {
  const a = await queryOne(
    `select al.*, ru.name as resolved_by_name,
            i.id as inv_id, i.ref as inv_ref, i.invoice_number, i.invoice_date, i.quantity as inv_qty,
            i.unit_price as inv_price, i.total as inv_total, i.status as inv_status, i.captured_at, i.captured_by,
            i.company,
            s.name as supplier, po.id as po_id, po.ref as po_ref, po.quantity as po_qty, po.unit_price as po_price,
            po.total as po_total, po.created_at as po_created, po.created_by as po_by, r.item, r.ref as pr_ref,
            r.created_at as pr_created, r.requester_id, r.decided_at as pr_decided, r.decided_by
       from alerts al
       join invoices i on i.id = al.invoice_id
       join suppliers s on s.id = i.supplier_id
       join purchase_orders po on po.id = i.po_id
       join purchase_requests r on r.id = po.request_id
       left join users ru on ru.id = al.resolved_by
      where al.id = $1`,
    [id]
  );
  if (!a) return null;

  const grns = await query<{ ref: string; quantity: number; received_at: Date; received_by: number }>(
    "select ref, quantity, received_at, received_by from goods_received where po_id = $1 order by received_at",
    [a.po_id]
  );
  const ids = [a.requester_id, a.decided_by, a.po_by, a.captured_by, a.resolved_by, ...grns.map((g) => g.received_by)].filter(
    Boolean
  );
  const users = await query<{ id: number; name: string }>("select id, name from users where id = any($1::int[])", [ids]);
  const nm = (id: number | null) => users.find((u) => u.id === id)?.name ?? "Unknown";

  const timeline: AlertDetail["timeline"] = [
    { at: a.pr_created, who: nm(a.requester_id), what: `Requested ${a.item} (${a.pr_ref})` },
  ];
  if (a.pr_decided) timeline.push({ at: a.pr_decided, who: nm(a.decided_by), what: `Approved request ${a.pr_ref}` });
  timeline.push({ at: a.po_created, who: nm(a.po_by), what: `Issued purchase order ${a.po_ref}` });
  for (const g of grns) timeline.push({ at: g.received_at, who: nm(g.received_by), what: `Recorded ${g.quantity} unit(s) received (${g.ref})` });
  timeline.push({ at: a.captured_at, who: nm(a.captured_by), what: `Captured invoice ${a.invoice_number} (${a.inv_ref})` });
  timeline.push({ at: a.created_at, who: "FraudGuard", what: `Raised alert ${a.ref} with a score of ${a.score}` });
  const esc = await queryOne<{ at: Date; user_name: string }>(
    "select at, user_name from audit_log where entity = 'alert' and entity_ref = $1 and action = 'alert.escalated' order by at desc limit 1",
    [a.ref]
  );
  if (esc) timeline.push({ at: esc.at, who: esc.user_name, what: "Escalated the alert for further review" });
  if (a.resolved_at) {
    timeline.push({
      at: a.resolved_at,
      who: a.resolved_by_name ?? "Finance Manager",
      what: a.status === "cleared" ? "Cleared the alert and approved payment" : "Rejected the invoice",
    });
  }
  timeline.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());

  return {
    id: a.id,
    ref: a.ref,
    score: a.score,
    band: a.band,
    status: a.status,
    reasons: a.reasons,
    comment: a.comment,
    created_at: a.created_at,
    resolved_at: a.resolved_at,
    resolved_by_name: a.resolved_by_name,
    company: a.company,
    snapshot: a.snapshot,
    invoice: {
      id: a.inv_id,
      ref: a.inv_ref,
      number: a.invoice_number,
      date: a.invoice_date,
      quantity: a.inv_qty,
      unit_price: a.inv_price,
      total: a.inv_total,
      status: a.inv_status,
    },
    supplier: a.supplier,
    po: { ref: a.po_ref, quantity: a.po_qty, unit_price: a.po_price, total: a.po_total, item: a.item },
    grns: grns.map((g) => ({ ref: g.ref, quantity: g.quantity, received_at: g.received_at })),
    timeline,
  };
}

/* ---------- dashboard ---------- */

export interface Dashboard {
  total: number;
  low: number;
  medium: number;
  high: number;
  awaiting: number;
  paidValue: number;
  heldValue: number;
  weeks: { label: string; flagged: number; resolved: number }[];
  avgResolveHours: number | null;
}

export async function getDashboard(companyFilter?: CompanyFilter): Promise<Dashboard> {
  const filtered = companyFilter && companyFilter !== "all";
  const invWhere = filtered ? "where company = $1" : "";
  const invParams = filtered ? [companyFilter] : [];
  const t = await queryOne(
    `select count(*)::int as total,
            count(*) filter (where risk_band = 'low')::int as low,
            count(*) filter (where risk_band = 'medium')::int as medium,
            count(*) filter (where risk_band = 'high')::int as high,
            coalesce(sum(total) filter (where status = 'paid'), 0) as paid_value,
            coalesce(sum(total) filter (where status = 'held'), 0) as held_value
       from invoices ${invWhere}`,
    invParams
  );
  const awaiting = await queryOne(
    `select count(*)::int as n from alerts al join invoices i on i.id = al.invoice_id
      where al.status in ('open','escalated') ${filtered ? "and i.company = $1" : ""}`,
    invParams
  );
  const weeks = await query<{ label: string; flagged: number; resolved: number }>(
    `with w as (
       select generate_series(date_trunc('week', now()) - interval '5 weeks', date_trunc('week', now()), interval '1 week') as start
     )
     select to_char(w.start, 'DD Mon') as label,
            (select count(*)::int from alerts a join invoices i on i.id = a.invoice_id
              where a.created_at >= w.start and a.created_at < w.start + interval '1 week'
                ${filtered ? "and i.company = $1" : ""}) as flagged,
            (select count(*)::int from alerts a join invoices i on i.id = a.invoice_id
              where a.resolved_at >= w.start and a.resolved_at < w.start + interval '1 week'
                ${filtered ? "and i.company = $1" : ""}) as resolved
       from w order by w.start`,
    invParams
  );
  const avg = await queryOne(
    `select extract(epoch from avg(al.resolved_at - al.created_at)) / 3600 as hrs
       from alerts al join invoices i on i.id = al.invoice_id
      where al.resolved_at is not null ${filtered ? "and i.company = $1" : ""}`,
    invParams
  );
  return {
    total: t.total,
    low: t.low,
    medium: t.medium,
    high: t.high,
    awaiting: awaiting.n,
    paidValue: t.paid_value,
    heldValue: t.held_value,
    weeks,
    avgResolveHours: avg?.hrs === null || avg?.hrs === undefined ? null : Number(avg.hrs),
  };
}

/* ---------- accountant work list ---------- */

export interface ReadyPo {
  id: number;
  ref: string;
  supplier: string;
  item: string;
  quantity: number;
  unit_price: number;
  total: number;
  received: number;
  delivered_at: Date;
  company: Company;
}

/** Purchase orders that have been delivered but have no live invoice yet. */
export function listReadyToInvoice(companyFilter?: CompanyFilter) {
  const { sql, params } = companyClause("po.company", companyFilter, 1);
  return query<ReadyPo>(
    `select po.id, po.ref, s.name as supplier, r.item, po.quantity, po.unit_price, po.total, po.company,
            g.qty::int as received, g.last_at as delivered_at
       from purchase_orders po
       join suppliers s on s.id = po.supplier_id
       join purchase_requests r on r.id = po.request_id
       join lateral (select coalesce(sum(quantity), 0) as qty, max(received_at) as last_at
                       from goods_received where po_id = po.id) g on true
      where po.status in ('issued','received') and g.qty > 0
        and not exists (select 1 from invoices i where i.po_id = po.id and i.status <> 'rejected')
        ${sql ? "and " + sql : ""}
      order by g.last_at`,
    params
  );
}

/* ---------- journal ---------- */

export interface JournalEntry {
  id: number;
  ref: string;
  description: string;
  posted_at: Date;
  posted_by: string | null;
  company: Company | null;
  lines: { account: string; debit: number; credit: number }[];
}

export async function getJournal(companyFilter?: CompanyFilter) {
  const filtered = companyFilter && companyFilter !== "all";
  const entries = await query<Omit<JournalEntry, "lines">>(
    `select e.id, e.ref, e.description, e.posted_at, u.name as posted_by, i.company
       from journal_entries e
       left join users u on u.id = e.posted_by
       left join invoices i on i.id = e.invoice_id
      ${filtered ? "where i.company = $1" : ""}
      order by e.posted_at desc, e.id desc limit 40`,
    filtered ? [companyFilter] : []
  );
  const lines = await query<{ entry_id: number; account: string; debit: number; credit: number }>(
    "select entry_id, account, debit, credit from journal_lines where entry_id = any($1::int[]) order by id",
    [entries.map((e) => e.id)]
  );
  const balances = await query<{ account: string; debit: number; credit: number }>(
    `select l.account, sum(l.debit) as debit, sum(l.credit) as credit
       from journal_lines l
       ${filtered ? "join journal_entries e on e.id = l.entry_id join invoices i on i.id = e.invoice_id" : ""}
      ${filtered ? "where i.company = $1" : ""}
      group by l.account order by l.account`,
    filtered ? [companyFilter] : []
  );
  return {
    entries: entries.map((e) => ({ ...e, lines: lines.filter((l) => l.entry_id === e.id) })) as JournalEntry[],
    balances,
  };
}

/* ---------- audit ---------- */

export interface AuditRow {
  id: number;
  at: Date;
  user_name: string;
  user_role: string;
  action: string;
  entity_ref: string | null;
  details: Record<string, unknown>;
  company: Company | null;
}
export function listAudit(q: string, companyFilter?: CompanyFilter) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q}%`);
    clauses.push(`(action ilike $${params.length} or user_name ilike $${params.length} or coalesce(entity_ref,'') ilike $${params.length} or details::text ilike $${params.length})`);
  }
  if (companyFilter && companyFilter !== "all") {
    params.push(companyFilter);
    clauses.push(`company = $${params.length}`);
  }
  return query<AuditRow>(
    `select id, at, user_name, user_role, action, entity_ref, details, company from audit_log
      ${clauses.length ? "where " + clauses.join(" and ") : ""}
      order by at desc, id desc limit 200`,
    params
  );
}
