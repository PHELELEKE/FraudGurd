/**
 * The purchase-to-payment workflow.
 *
 * Every function here:
 *   1. checks the caller's role (server-side, so hiding buttons in the UI is never the only protection),
 *   2. does its work inside one database transaction,
 *   3. writes an audit log entry (who, what, when).
 */
import type { PoolClient } from "pg";
import { withTx } from "./db";
import { HttpError } from "./http";
import { ACCOUNTS } from "./accounts";
import { splitVat } from "./money";
import { rand } from "./format";
import { can, ROLE_LABEL, type Perm, type Role } from "./roles";
import { scoreInvoice, DUPLICATE_AMOUNT_WINDOW_DAYS, FREQUENT_WINDOW_DAYS, type RuleResult } from "./rules";
import * as v from "./validate";

export interface Actor {
  id: number;
  name: string;
  role: Role;
}

type Body = Record<string, unknown>;

function need(a: Actor, perm: Perm) {
  if (!can(a.role, perm)) {
    throw new HttpError(403, `Your role (${ROLE_LABEL[a.role]}) is not allowed to do this.`);
  }
}

async function audit(
  c: PoolClient,
  a: Actor,
  action: string,
  entity: string,
  ref: string | null,
  details: Record<string, unknown> = {}
) {
  await c.query(
    `insert into audit_log (user_id, user_name, user_role, action, entity, entity_ref, details)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [a.id, a.name, a.role, action, entity, ref, JSON.stringify(details)]
  );
}

/* ------------------------------------------------------------------ */
/* 1. Purchase requests                                                */
/* ------------------------------------------------------------------ */

export async function createRequest(a: Actor, body: Body) {
  need(a, "request.create");
  const item = v.str(body.item, "Item", 120);
  const category = v.str(body.category, "Category", 60);
  const quantity = v.int(body.quantity, "Quantity");
  const estimatedCost = v.money(body.estimatedCost, "Estimated cost");
  const department = v.str(body.department, "Department", 60);
  const reason = v.str(body.reason, "Reason", 300);

  return withTx(async (c) => {
    const cat = await c.query("select 1 from category_norms where category = $1", [category]);
    if (!cat.rowCount) throw new HttpError(400, "Choose one of the listed categories.");
    const { rows } = await c.query(
      `insert into purchase_requests (requester_id, department, category, item, quantity, estimated_cost, reason)
       values ($1, $2, $3, $4, $5, $6, $7) returning id, ref`,
      [a.id, department, category, item, quantity, estimatedCost, reason]
    );
    await audit(c, a, "request.created", "purchase_request", rows[0].ref, { item, quantity, estimatedCost, category });
    return rows[0] as { id: number; ref: string };
  });
}

export async function decideRequest(a: Actor, id: number, body: Body) {
  need(a, "request.decide");
  const decision = v.oneOf(body.decision, "Decision", ["approved", "rejected"] as const);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";
  if (decision === "rejected" && note.length < 3) {
    throw new HttpError(400, "Give a short reason when rejecting a request.");
  }

  return withTx(async (c) => {
    const { rows } = await c.query(
      `select r.*, u.role as requester_role from purchase_requests r join users u on u.id = r.requester_id
        where r.id = $1 for update of r`,
      [id]
    );
    const r = rows[0];
    if (!r) throw new HttpError(404, "Request not found.");
    if (r.requester_id === a.id) {
      throw new HttpError(403, "You cannot approve or reject your own request. Someone else has to decide it.");
    }
    if (r.requester_role !== "employee" && a.role !== "finance_manager") {
      throw new HttpError(403, "Requests made by a manager are approved by the Finance Manager.");
    }
    if (r.status !== "pending") throw new HttpError(409, `This request has already been ${r.status}.`);
    await c.query(
      "update purchase_requests set status = $1, decided_by = $2, decided_at = now(), decision_note = $3 where id = $4",
      [decision, a.id, note || null, id]
    );
    await audit(c, a, `request.${decision}`, "purchase_request", r.ref, { note });
    return { ref: r.ref as string, status: decision };
  });
}

/* ------------------------------------------------------------------ */
/* 2. Suppliers                                                        */
/* ------------------------------------------------------------------ */

export async function createSupplier(a: Actor, body: Body) {
  need(a, "supplier.create");
  const name = v.str(body.name, "Supplier name", 120);
  const b = v.bank(body);
  return withTx(async (c) => {
    const dup = await c.query("select 1 from suppliers where lower(name) = lower($1)", [name]);
    if (dup.rowCount) throw new HttpError(409, "A supplier with this name already exists.");
    const { rows } = await c.query(
      `insert into suppliers (name, status, bank_name, account_holder, account_number, branch_code, created_by)
       values ($1, 'pending', $2, $3, $4, $5, $6) returning id`,
      [name, b.bankName, b.accountHolder, b.accountNumber, b.branchCode, a.id]
    );
    await audit(c, a, "supplier.created", "supplier", name, { bank: b.bankName });
    return { id: rows[0].id as number };
  });
}

export async function updateSupplierBank(a: Actor, id: number, body: Body) {
  need(a, "supplier.updateBank");
  const b = v.bank(body);
  return withTx(async (c) => {
    const { rows } = await c.query("select * from suppliers where id = $1 for update", [id]);
    const s = rows[0];
    if (!s) throw new HttpError(404, "Supplier not found.");
    await c.query(
      `insert into supplier_bank_history (supplier_id, bank_name, account_holder, account_number, branch_code, changed_by)
       values ($1, $2, $3, $4, $5, $6)`,
      [id, s.bank_name, s.account_holder, s.account_number, s.branch_code, a.id]
    );
    await c.query(
      `update suppliers set bank_name = $1, account_holder = $2, account_number = $3, branch_code = $4, bank_changed_at = now()
       where id = $5`,
      [b.bankName, b.accountHolder, b.accountNumber, b.branchCode, id]
    );
    await audit(c, a, "supplier.bank_changed", "supplier", s.name, {
      from: { bank: s.bank_name, holder: s.account_holder, accountEnding: s.account_number.slice(-4) },
      to: { bank: b.bankName, holder: b.accountHolder, accountEnding: b.accountNumber.slice(-4) },
    });
    return { ok: true };
  });
}

export async function verifySupplier(a: Actor, id: number) {
  need(a, "supplier.verify");
  return withTx(async (c) => {
    const { rows } = await c.query("select * from suppliers where id = $1 for update", [id]);
    const s = rows[0];
    if (!s) throw new HttpError(404, "Supplier not found.");
    if (s.status === "approved") throw new HttpError(409, "This supplier is already verified.");
    await c.query("update suppliers set status = 'approved', verified_by = $1, verified_at = now() where id = $2", [
      a.id,
      id,
    ]);
    await audit(c, a, "supplier.verified", "supplier", s.name);
    return { ok: true };
  });
}

/* ------------------------------------------------------------------ */
/* 3. Purchase orders and goods received                               */
/* ------------------------------------------------------------------ */

export async function createOrder(a: Actor, body: Body) {
  need(a, "order.create");
  const requestId = v.int(body.requestId, "Request");
  const supplierId = v.int(body.supplierId, "Supplier");
  const unitPrice = v.money(body.unitPrice, "Unit price");

  return withTx(async (c) => {
    const { rows } = await c.query("select * from purchase_requests where id = $1 for update", [requestId]);
    const r = rows[0];
    if (!r) throw new HttpError(404, "Request not found.");
    if (r.status !== "approved") throw new HttpError(409, "Only approved requests can be turned into a purchase order.");
    const sup = await c.query("select name from suppliers where id = $1", [supplierId]);
    if (!sup.rowCount) throw new HttpError(400, "Choose a supplier from the list.");
    const total = Math.round(r.quantity * unitPrice * 100) / 100;
    const po = await c.query(
      `insert into purchase_orders (request_id, supplier_id, quantity, unit_price, total, created_by)
       values ($1, $2, $3, $4, $5, $6) returning id, ref`,
      [requestId, supplierId, r.quantity, unitPrice, total, a.id]
    );
    await c.query("update purchase_requests set status = 'ordered' where id = $1", [requestId]);
    await audit(c, a, "order.created", "purchase_order", po.rows[0].ref, {
      request: r.ref,
      supplier: sup.rows[0].name,
      quantity: r.quantity,
      unitPrice,
      total,
    });
    return po.rows[0] as { id: number; ref: string };
  });
}

export async function receiveGoods(a: Actor, poId: number, body: Body) {
  need(a, "goods.receive");
  const quantity = v.int(body.quantity, "Quantity received");
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 200) : "";

  return withTx(async (c) => {
    const { rows } = await c.query("select * from purchase_orders where id = $1 for update", [poId]);
    const po = rows[0];
    if (!po) throw new HttpError(404, "Purchase order not found.");
    const got = await c.query("select coalesce(sum(quantity), 0)::int as qty from goods_received where po_id = $1", [poId]);
    const already = got.rows[0].qty as number;
    if (already + quantity > po.quantity) {
      throw new HttpError(409, `Only ${po.quantity - already} more unit(s) are still expected on ${po.ref}.`);
    }
    const grn = await c.query(
      "insert into goods_received (po_id, quantity, notes, received_by) values ($1, $2, $3, $4) returning id, ref",
      [poId, quantity, notes || null, a.id]
    );
    if (already + quantity === po.quantity && po.status === "issued") {
      await c.query("update purchase_orders set status = 'received' where id = $1", [poId]);
    }
    await audit(c, a, "goods.received", "goods_received", grn.rows[0].ref, { po: po.ref, quantity, notes });
    return grn.rows[0] as { id: number; ref: string };
  });
}

/* ------------------------------------------------------------------ */
/* 4. Supplier invoice: three-way match, fraud check, routing          */
/* ------------------------------------------------------------------ */

export interface CaptureOutcome {
  invoiceId: number;
  invoiceRef: string;
  alertId: number | null;
  outcome: "approved" | "held";
  result: RuleResult;
}

export async function captureInvoice(a: Actor, body: Body): Promise<CaptureOutcome> {
  need(a, "invoice.capture");
  const poId = v.int(body.poId, "Purchase order");
  const invoiceNumber = v.str(body.invoiceNumber, "Invoice number", 60);
  const invoiceDate = v.date(body.invoiceDate, "Invoice date");
  const quantity = v.int(body.quantity, "Quantity");
  const unitPrice = v.money(body.unitPrice, "Unit price");
  const b = v.bank(body);
  const total = Math.round(quantity * unitPrice * 100) / 100;

  return withTx(async (c) => {
    const { rows } = await c.query(
      `select po.*, s.name as supplier_name, s.status as supplier_status, s.bank_name as s_bank_name,
              s.account_holder as s_account_holder, s.account_number as s_account_number,
              s.branch_code as s_branch_code, s.bank_changed_at,
              r.category, r.item, n.normal_max, n.ledger_account
         from purchase_orders po
         join suppliers s on s.id = po.supplier_id
         join purchase_requests r on r.id = po.request_id
         join category_norms n on n.category = r.category
        where po.id = $1 for update of po`,
      [poId]
    );
    const po = rows[0];
    if (!po) throw new HttpError(404, "Purchase order not found.");

    const grn = await c.query("select coalesce(sum(quantity), 0)::int as qty from goods_received where po_id = $1", [poId]);
    const receivedQty = grn.rows[0].qty as number;

    const same = await c.query(
      `select ref, invoice_number, total,
              (lower(invoice_number) = lower($2)) as same_number
         from invoices
        where supplier_id = $1 and status <> 'rejected'
          and (lower(invoice_number) = lower($2)
               or (total = $3 and captured_at > now() - make_interval(days => $4::int)))`,
      [po.supplier_id, invoiceNumber, total, String(DUPLICATE_AMOUNT_WINDOW_DAYS)]
    );
    const sameNumber = same.rows.filter((r) => r.same_number).map((r) => ({ ref: r.ref, number: r.invoice_number }));
    const sameAmount = same.rows.filter((r) => !r.same_number).map((r) => ({ ref: r.ref, number: r.invoice_number }));

    const recent = await c.query(
      "select count(*)::int as n from invoices where supplier_id = $1 and captured_at > now() - make_interval(days => $2::int)",
      [po.supplier_id, String(FREQUENT_WINDOW_DAYS)]
    );

    const result = scoreInvoice({
      supplier: {
        name: po.supplier_name,
        status: po.supplier_status,
        accountNumber: po.s_account_number,
        bankChangedAt: po.bank_changed_at ? new Date(po.bank_changed_at) : null,
      },
      po: { quantity: po.quantity, unitPrice: po.unit_price },
      receivedQty,
      invoice: { number: invoiceNumber, quantity, unitPrice, total, accountNumber: b.accountNumber },
      category: po.category,
      categoryNormalMax: po.normal_max,
      sameNumber,
      sameAmount,
      recentInvoiceCount: (recent.rows[0].n as number) + 1,
      now: new Date(),
    });

    const flagged = result.band !== "low";
    const status = flagged ? "held" : "approved";

    const inv = await c.query(
      `insert into invoices (po_id, supplier_id, invoice_number, invoice_date, quantity, unit_price, total,
                             bank_name, account_holder, account_number, branch_code, captured_by,
                             match_status, risk_score, risk_band, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id, ref`,
      [
        poId, po.supplier_id, invoiceNumber, invoiceDate, quantity, unitPrice, total,
        b.bankName, b.accountHolder, b.accountNumber, b.branchCode, a.id,
        result.match.ok ? "matched" : "mismatch", result.score, result.band, status,
      ]
    );
    const invoice = inv.rows[0] as { id: number; ref: string };
    await c.query("update purchase_orders set status = 'invoiced' where id = $1 and status <> 'paid'", [poId]);

    await audit(c, a, "invoice.captured", "invoice", invoice.ref, {
      invoiceNumber, po: po.ref, total, score: result.score, band: result.band,
      rules: result.reasons.map((r) => r.code),
    });

    let alertId: number | null = null;
    if (flagged) {
      const snapshot = {
        match: result.match,
        bank: {
          onFile: {
            bankName: po.s_bank_name,
            accountHolder: po.s_account_holder,
            accountNumber: po.s_account_number,
            branchCode: po.s_branch_code,
          },
          onInvoice: b,
          changedAt: po.bank_changed_at,
        },
      };
      const al = await c.query(
        `insert into alerts (invoice_id, score, band, reasons, snapshot) values ($1,$2,$3,$4,$5) returning id, ref`,
        [invoice.id, result.score, result.band, JSON.stringify(result.reasons), JSON.stringify(snapshot)]
      );
      alertId = al.rows[0].id;
      await audit(c, a, "alert.raised", "alert", al.rows[0].ref, {
        invoice: invoice.ref, score: result.score, band: result.band,
      });
    } else {
      await postInvoiceJournal(c, a, {
        invoiceId: invoice.id,
        invoiceRef: invoice.ref,
        invoiceNumber,
        supplier: po.supplier_name,
        ledgerAccount: po.ledger_account,
        total,
      });
      await audit(c, a, "invoice.approved", "invoice", invoice.ref, { by: "system", reason: "low risk" });
    }

    return { invoiceId: invoice.id, invoiceRef: invoice.ref, alertId, outcome: status, result };
  });
}

/** Dr expense/asset account and Dr VAT Input, Cr Accounts Payable. Amounts on invoices include 15% VAT. */
async function postInvoiceJournal(
  c: PoolClient,
  a: Actor,
  x: { invoiceId: number; invoiceRef: string; invoiceNumber: string; supplier: string; ledgerAccount: string; total: number }
) {
  const { net, vat } = splitVat(x.total);
  await postJournal(c, a, x.invoiceId, `Supplier invoice ${x.invoiceNumber} from ${x.supplier} (${x.invoiceRef})`, [
    { account: x.ledgerAccount, debit: net, credit: 0 },
    { account: ACCOUNTS.vatInput, debit: vat, credit: 0 },
    { account: ACCOUNTS.payable, debit: 0, credit: x.total },
  ]);
}

async function postJournal(
  c: PoolClient,
  a: Actor,
  invoiceId: number,
  description: string,
  lines: { account: string; debit: number; credit: number }[]
) {
  const debit = Math.round(lines.reduce((s, l) => s + l.debit, 0) * 100);
  const credit = Math.round(lines.reduce((s, l) => s + l.credit, 0) * 100);
  if (debit !== credit) throw new Error(`Journal does not balance (debits ${debit / 100}, credits ${credit / 100}).`);
  const je = await c.query(
    "insert into journal_entries (invoice_id, description, posted_by) values ($1, $2, $3) returning id, ref",
    [invoiceId, description, a.id]
  );
  for (const l of lines) {
    await c.query("insert into journal_lines (entry_id, account, debit, credit) values ($1, $2, $3, $4)", [
      je.rows[0].id, l.account, l.debit, l.credit,
    ]);
  }
  await audit(c, a, "journal.posted", "journal_entry", je.rows[0].ref, { invoiceId, amount: debit / 100 });
}

/* ------------------------------------------------------------------ */
/* 5. Alerts and payment                                               */
/* ------------------------------------------------------------------ */

export async function resolveAlert(a: Actor, alertId: number, body: Body) {
  need(a, "alert.decide");
  const decision = v.oneOf(body.decision, "Decision", ["approve", "reject", "escalate"] as const);
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 500) : "";
  if (comment.length < 5) throw new HttpError(400, "Write a short reason for your decision (at least 5 characters).");

  return withTx(async (c) => {
    const { rows } = await c.query(
      `select al.*, i.ref as invoice_ref, i.invoice_number, i.total, i.po_id, i.status as invoice_status,
              s.name as supplier_name, n.ledger_account
         from alerts al
         join invoices i on i.id = al.invoice_id
         join suppliers s on s.id = i.supplier_id
         join purchase_orders po on po.id = i.po_id
         join purchase_requests r on r.id = po.request_id
         join category_norms n on n.category = r.category
        where al.id = $1 for update of al`,
      [alertId]
    );
    const al = rows[0];
    if (!al) throw new HttpError(404, "Alert not found.");
    if (al.status === "cleared" || al.status === "rejected") {
      throw new HttpError(409, `This alert was already ${al.status}.`);
    }

    if (decision === "escalate") {
      await c.query("update alerts set status = 'escalated', comment = $1 where id = $2", [comment, alertId]);
      await audit(c, a, "alert.escalated", "alert", al.ref, { invoice: al.invoice_ref, comment });
      return { status: "escalated" };
    }

    if (decision === "approve") {
      await c.query(
        "update alerts set status = 'cleared', resolved_by = $1, resolved_at = now(), comment = $2 where id = $3",
        [a.id, comment, alertId]
      );
      await c.query("update invoices set status = 'approved' where id = $1", [al.invoice_id]);
      await postInvoiceJournal(c, a, {
        invoiceId: al.invoice_id,
        invoiceRef: al.invoice_ref,
        invoiceNumber: al.invoice_number,
        supplier: al.supplier_name,
        ledgerAccount: al.ledger_account,
        total: al.total,
      });
      await audit(c, a, "alert.cleared", "alert", al.ref, { invoice: al.invoice_ref, comment });
      return { status: "cleared" };
    }

    // reject: the invoice is cancelled, nothing is posted, and the PO can be invoiced again
    await c.query(
      "update alerts set status = 'rejected', resolved_by = $1, resolved_at = now(), comment = $2 where id = $3",
      [a.id, comment, alertId]
    );
    await c.query("update invoices set status = 'rejected' where id = $1", [al.invoice_id]);
    await c.query(
      `update purchase_orders set status = case
         when (select coalesce(sum(quantity),0) from goods_received where po_id = $1) >= quantity then 'received'
         else 'issued' end
       where id = $1 and status = 'invoiced'`,
      [al.po_id]
    );
    await audit(c, a, "alert.rejected", "alert", al.ref, { invoice: al.invoice_ref, comment });
    return { status: "rejected" };
  });
}

export async function payInvoice(a: Actor, invoiceId: number) {
  need(a, "invoice.pay");
  return withTx(async (c) => {
    const { rows } = await c.query(
      `select i.*, s.name as supplier_name from invoices i join suppliers s on s.id = i.supplier_id
        where i.id = $1 for update of i`,
      [invoiceId]
    );
    const inv = rows[0];
    if (!inv) throw new HttpError(404, "Invoice not found.");
    if (inv.status === "held") throw new HttpError(409, "Payment is held until the Finance Manager resolves the alert.");
    if (inv.status === "rejected") throw new HttpError(409, "This invoice was rejected and cannot be paid.");
    if (inv.status === "paid") throw new HttpError(409, "This invoice has already been paid.");

    await c.query("update invoices set status = 'paid', paid_by = $1, paid_at = now() where id = $2", [a.id, invoiceId]);
    await c.query("update purchase_orders set status = 'paid' where id = $1", [inv.po_id]);
    await postJournal(c, a, invoiceId, `Payment of ${inv.invoice_number} to ${inv.supplier_name} (${inv.ref})`, [
      { account: ACCOUNTS.payable, debit: inv.total, credit: 0 },
      { account: ACCOUNTS.bank, debit: 0, credit: inv.total },
    ]);
    await audit(c, a, "invoice.paid", "invoice", inv.ref, { amount: rand(inv.total) });
    return { ok: true };
  });
}
