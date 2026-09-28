/** Read-only queries used by the pages. */
import { query, queryOne } from "./db";
import type { Reason, MatchDetail } from "./rules";
import type { SessionUser } from "./auth";

/* ---------- reference data ---------- */

export interface Category {
  category: string;
  normal_max: number;
  ledger_account: string;
}
export const listCategories = () =>
  query<Category>("select category, normal_max, ledger_account from category_norms order by category");

export const DEPARTMENTS = ["IT", "Finance", "Sales", "Operations", "HR", "Admin"] as const;

/* ---------- suppliers ---------- */

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

export interface RequestRow {
  id: number;
  ref: string;
  item: string;
  category: string;
  department: string;
  quantity: number;
  estimated_cost: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "ordered";
  requester_id: number;
  requester: string;
  requester_role: string;
  decided_by_name: string | null;
  decided_at: Date | null;
  decision_note: string | null;
  created_at: Date;
}
export function listRequests(user: SessionUser) {
  const ownOnly = user.role === "employee";
  return query<RequestRow>(
    `select r.id, r.ref, r.item, r.category, r.department, r.quantity, r.estimated_cost, r.reason, r.status,
            r.requester_id, u.name as requester, u.role as requester_role, d.name as decided_by_name, r.decided_at, r.decision_note, r.created_at
       from purchase_requests r
       join users u on u.id = r.requester_id
       left join users d on d.id = r.decided_by
      ${ownOnly ? "where r.requester_id = $1" : ""}
      order by (r.status = 'pending') desc, r.created_at desc
      limit 100`,
    ownOnly ? [user.id] : []
  );
}

export const listApprovedRequests = () =>
  query<RequestRow>(
    `select r.id, r.ref, r.item, r.category, r.department, r.quantity, r.estimated_cost, r.reason, r.status,
            r.requester_id, u.name as requester, u.role as requester_role, null::text as decided_by_name, r.decided_at, r.decision_note, r.created_at
       from purchase_requests r join users u on u.id = r.requester_id
      where r.status = 'approved' order by r.decided_at`
  );

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
  bank_name: string;
  account_holder: string;
  account_number: string;
  branch_code: string;
}
export const listOrders = () =>
  query<OrderRow>(
    `select po.id, po.ref, r.ref as request_ref, r.item, po.supplier_id, s.name as supplier,
            s.status as supplier_status, po.quantity, po.unit_price, po.total, po.status, po.created_at,
            s.bank_name, s.account_holder, s.account_number, s.branch_code,
            coalesce((select sum(g.quantity) from goods_received g where g.po_id = po.id), 0)::int as received
       from purchase_orders po
       join purchase_requests r on r.id = po.request_id
       join suppliers s on s.id = po.supplier_id
      order by po.created_at desc limit 100`
  );

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
}
export const listInvoices = (limit = 100) =>
  query<InvoiceRow>(
    `select i.id, i.ref, i.invoice_number, i.invoice_date, s.name as supplier, po.ref as po_ref, i.total,
            i.risk_score, i.risk_band, i.status, i.captured_at, u.name as captured_by_name, al.id as alert_id
       from invoices i
       join suppliers s on s.id = i.supplier_id
       join purchase_orders po on po.id = i.po_id
       left join users u on u.id = i.captured_by
       left join alerts al on al.invoice_id = i.id
      order by i.captured_at desc limit $1`,
    [limit]
  );

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
}
export const listAlerts = (filter: "active" | "all") =>
  query<AlertRow>(
    `select al.id, al.ref, al.score, al.band, al.status, al.created_at, al.reasons,
            i.ref as invoice_ref, i.invoice_number, s.name as supplier, i.total
       from alerts al
       join invoices i on i.id = al.invoice_id
       join suppliers s on s.id = i.supplier_id
      ${filter === "active" ? "where al.status in ('open','escalated')" : ""}
      order by (al.status in ('open','escalated')) desc, al.score desc, al.created_at desc limit 100`
  );

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

export async function getDashboard(): Promise<Dashboard> {
  const t = await queryOne(
    `select count(*)::int as total,
            count(*) filter (where risk_band = 'low')::int as low,
            count(*) filter (where risk_band = 'medium')::int as medium,
            count(*) filter (where risk_band = 'high')::int as high,
            coalesce(sum(total) filter (where status = 'paid'), 0) as paid_value,
            coalesce(sum(total) filter (where status = 'held'), 0) as held_value
       from invoices`
  );
  const awaiting = await queryOne("select count(*)::int as n from alerts where status in ('open','escalated')");
  const weeks = await query<{ label: string; flagged: number; resolved: number }>(
    `with w as (
       select generate_series(date_trunc('week', now()) - interval '5 weeks', date_trunc('week', now()), interval '1 week') as start
     )
     select to_char(w.start, 'DD Mon') as label,
            (select count(*)::int from alerts a where a.created_at >= w.start and a.created_at < w.start + interval '1 week') as flagged,
            (select count(*)::int from alerts a where a.resolved_at >= w.start and a.resolved_at < w.start + interval '1 week') as resolved
       from w order by w.start`
  );
  const avg = await queryOne(
    "select extract(epoch from avg(resolved_at - created_at)) / 3600 as hrs from alerts where resolved_at is not null"
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

/* ---------- journal ---------- */

export interface JournalEntry {
  id: number;
  ref: string;
  description: string;
  posted_at: Date;
  posted_by: string | null;
  lines: { account: string; debit: number; credit: number }[];
}

export async function getJournal() {
  const entries = await query<Omit<JournalEntry, "lines">>(
    `select e.id, e.ref, e.description, e.posted_at, u.name as posted_by
       from journal_entries e left join users u on u.id = e.posted_by
      order by e.posted_at desc, e.id desc limit 40`
  );
  const lines = await query<{ entry_id: number; account: string; debit: number; credit: number }>(
    "select entry_id, account, debit, credit from journal_lines where entry_id = any($1::int[]) order by id",
    [entries.map((e) => e.id)]
  );
  const balances = await query<{ account: string; debit: number; credit: number }>(
    "select account, sum(debit) as debit, sum(credit) as credit from journal_lines group by account order by account"
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
}
export const listAudit = (q: string) =>
  query<AuditRow>(
    `select id, at, user_name, user_role, action, entity_ref, details from audit_log
      ${q ? "where action ilike $1 or user_name ilike $1 or coalesce(entity_ref,'') ilike $1 or details::text ilike $1" : ""}
      order by at desc, id desc limit 200`,
    q ? [`%${q}%`] : []
  );

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
}

/** Purchase orders that have been delivered but have no live invoice yet. */
export const listReadyToInvoice = () =>
  query<ReadyPo>(
    `select po.id, po.ref, s.name as supplier, r.item, po.quantity, po.unit_price, po.total,
            g.qty::int as received, g.last_at as delivered_at
       from purchase_orders po
       join suppliers s on s.id = po.supplier_id
       join purchase_requests r on r.id = po.request_id
       join lateral (select coalesce(sum(quantity), 0) as qty, max(received_at) as last_at
                       from goods_received where po_id = po.id) g on true
      where po.status in ('issued','received') and g.qty > 0
        and not exists (select 1 from invoices i where i.po_id = po.id and i.status <> 'rejected')
      order by g.last_at`
  );
