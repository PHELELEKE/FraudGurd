import PDFDocument from "pdfkit";
import { query, queryOne } from "./db";
import { COMPANY_LABEL, type Company } from "./companies";
import { splitVat } from "./money";

function moneyString(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", minimumFractionDigits: 2 }).format(n);
}

function companyLabel(company: Company | string | null | undefined): string {
  if (!company) return "Unknown company";
  return COMPANY_LABEL[company as Company] ?? String(company);
}

function fmtDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

function fmtDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().replace("T", " ").replace(".000Z", "Z");
}

function addSection(doc: any, title: string, rows: Array<[string, string]>) {
  doc.moveDown(0.7);
  doc.fontSize(14).font("Helvetica-Bold").text(title);
  doc.fontSize(10).font("Helvetica");
  for (const [label, value] of rows) {
    doc.text(`${label}: ${value || "—"}`);
  }
}

export async function buildPurchasePdf(invoiceId: number, generatedBy = "FraudGuard"): Promise<Buffer> {
  const invoice = await queryOne<any>(
    `select i.id, i.ref, i.invoice_number, i.invoice_date, i.quantity, i.unit_price, i.total, i.bank_name,
            i.account_holder, i.account_number, i.branch_code, i.captured_at, i.paid_at, i.company,
            i.match_status, i.risk_score, i.risk_band, i.status,
            s.name as supplier, po.id as po_id, po.ref as po_ref, po.quantity as po_qty, po.unit_price as po_unit_price,
            po.total as po_total, po.status as po_status, po.created_at as po_created_at, po.company as po_company,
            req.id as request_id, req.ref as request_ref, req.item, req.category, req.department, req.reason,
            req.created_at as request_created_at, req.status as request_status, req.decided_at as request_decided_at,
            req.decision_note, req.company as request_company,
            requester.name as requester_name, approver.name as approver_name,
            po_creator.name as po_creator_name, paid_by.name as paid_by_name,
            cap_user.name as captured_by_name
       from invoices i
       join suppliers s on s.id = i.supplier_id
       join purchase_orders po on po.id = i.po_id
       join purchase_requests req on req.id = po.request_id
       left join users requester on requester.id = req.requester_id
       left join users approver on approver.id = req.decided_by
       left join users po_creator on po_creator.id = po.created_by
       left join users cap_user on cap_user.id = i.captured_by
       left join users paid_by on paid_by.id = i.paid_by
      where i.id = $1`,
    [invoiceId]
  );
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found.`);

  const grns = await query<any>(
    `select g.ref, g.quantity, g.notes, g.received_at, u.name as received_by_name
       from goods_received g
       left join users u on u.id = g.received_by
      where g.po_id = $1
      order by g.received_at`,
    [invoice.po_id]
  );

  const alert = await queryOne<any>(
    `select al.ref, al.score, al.band, al.status, al.created_at, al.comment, al.resolved_at,
            al.reasons, u.name as resolved_by_name
       from alerts al
       left join users u on u.id = al.resolved_by
      where al.invoice_id = $1`,
    [invoiceId]
  );

  const journalRows = await query<any>(
    `select je.ref, je.description, je.posted_at, u.name as posted_by_name, jl.account, jl.debit, jl.credit
       from journal_entries je
       join journal_lines jl on jl.entry_id = je.id
       left join users u on u.id = je.posted_by
      where je.invoice_id = $1
      order by je.posted_at, jl.id`,
    [invoiceId]
  );

  const journal = new Map<string, { ref: string; description: string; posted_at: string; posted_by_name: string | null; lines: Array<{ account: string; debit: number; credit: number }> }>();
  for (const row of journalRows) {
    const item = journal.get(row.ref) ?? { ref: row.ref, description: row.description, posted_at: row.posted_at, posted_by_name: row.posted_by_name, lines: [] as Array<{ account: string; debit: number; credit: number }> };
    item.lines.push({ account: row.account, debit: Number(row.debit), credit: Number(row.credit) });
    journal.set(row.ref, item);
  }

  const vat = splitVat(Number(invoice.total));
  const doc = new PDFDocument({ margin: 46, size: "A4" });
  const chunks: Uint8Array[] = [];

  return new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks.map((c) => Buffer.from(c)))));
    doc.on("error", reject);

    doc.fontSize(22).font("Helvetica-Bold").text("FraudGuard");
    doc.fontSize(10).font("Helvetica").text(`Generated ${fmtDateTime(new Date())} by ${generatedBy}`);
    doc.moveDown(0.5);
    doc.fontSize(16).font("Helvetica-Bold").text(`Invoice case file: ${invoice.ref}`);
    doc.fontSize(10).font("Helvetica").text(`Company: ${companyLabel(invoice.company)}`);
    doc.text(`Supplier: ${invoice.supplier}`);
    doc.text(`Invoice number: ${invoice.invoice_number}`);
    doc.text(`Invoice date: ${fmtDate(invoice.invoice_date)}`);

    addSection(doc, "Purchase Request", [
      ["Request ref", invoice.request_ref],
      ["Item", invoice.item],
      ["Category", invoice.category],
      ["Department", invoice.department],
      ["Requested by", invoice.requester_name ?? "Unknown"],
      ["Reason", invoice.reason],
      ["Submitted", fmtDateTime(invoice.request_created_at)],
      ["Status", String(invoice.request_status)],
      ["Approval", invoice.approver_name ? `${invoice.approver_name} on ${fmtDateTime(invoice.request_decided_at)}` : "Not approved yet"],
      ["Decision note", invoice.decision_note || "—"],
    ]);

    addSection(doc, "Approval", [
      ["Approved by", invoice.approver_name || "Not recorded"],
      ["Approved at", invoice.request_decided_at ? fmtDateTime(invoice.request_decided_at) : "—"],
      ["Request status", String(invoice.request_status)],
    ]);

    addSection(doc, "Purchase Order", [
      ["Order ref", invoice.po_ref],
      ["Created by", invoice.po_creator_name || "Unknown"],
      ["Created at", fmtDateTime(invoice.po_created_at)],
      ["Quantity", String(invoice.po_qty)],
      ["Unit price", moneyString(invoice.po_unit_price)],
      ["Order total", moneyString(invoice.po_total)],
      ["Company", companyLabel(invoice.po_company)],
    ]);

    addSection(doc, "Goods Received",
      grns.length
        ? grns.map((g) => [`${g.ref} (${fmtDateTime(g.received_at)})`, `${g.quantity} unit(s) by ${g.received_by_name ?? "Unknown"}`])
        : [["Status", "No goods received yet"]]
    );

    addSection(doc, "Supplier Invoice", [
      ["Supplier", invoice.supplier],
      ["Invoice number", invoice.invoice_number],
      ["Date", fmtDate(invoice.invoice_date)],
      ["Quantity", String(invoice.quantity)],
      ["Unit price", moneyString(invoice.unit_price)],
      ["Total", moneyString(invoice.total)],
      ["VAT", moneyString(vat.vat)],
      ["Net", moneyString(vat.net)],
      ["Match status", String(invoice.match_status)],
      ["Risk score", `${invoice.risk_score} (${invoice.risk_band})`],
      ["Bank", invoice.bank_name],
      ["Account holder", invoice.account_holder],
      ["Account number", invoice.account_number],
      ["Branch code", invoice.branch_code],
      ["Status", String(invoice.status)],
      ["Captured by", invoice.captured_by_name || "Unknown"],
      ["Captured at", fmtDateTime(invoice.captured_at)],
    ]);

    if (alert) {
      const reasons = Array.isArray(alert.reasons) ? alert.reasons : [];
      addSection(doc, "Fraud Alert", [
        ["Alert ref", alert.ref],
        ["Status", String(alert.status)],
        ["Score", `${alert.score}`],
        ["Band", String(alert.band)],
        ["Reasons", reasons.length ? reasons.map((r: any) => `${r.title} (+${r.points})`).join("; ") : "None"],
        ["Resolved by", alert.resolved_by_name || "Unresolved"],
        ["Resolved at", alert.resolved_at ? fmtDateTime(alert.resolved_at) : "—"],
        ["Comment", alert.comment || "—"],
      ]);
    } else {
      addSection(doc, "Fraud Alert", [["Status", "No fraud alert was raised for this invoice."]]);
    }

    addSection(doc, "Payment", [
      ["Amount", moneyString(invoice.total)],
      ["VAT", moneyString(vat.vat)],
      ["Net", moneyString(vat.net)],
      ["Paid by", invoice.paid_by_name || "Not paid yet"],
      ["Paid at", invoice.paid_at ? fmtDateTime(invoice.paid_at) : "—"],
      ["Bank", invoice.bank_name],
      ["Account holder", invoice.account_holder],
      ["Account number", invoice.account_number],
      ["Branch code", invoice.branch_code],
    ]);

    addSection(doc, "Journal entries", []);
    if (journal.size === 0) {
      doc.text("No journal entries were posted for this invoice.");
    } else {
      for (const entry of Array.from(journal.values())) {
        doc.fontSize(10).font("Helvetica-Bold").text(`${entry.ref} — ${entry.description}`);
        doc.fontSize(9).font("Helvetica").text(`Posted ${fmtDateTime(entry.posted_at)} by ${entry.posted_by_name ?? "Unknown"}`);
        for (const line of entry.lines) {
          doc.text(`- ${line.account}: debit ${moneyString(line.debit)} / credit ${moneyString(line.credit)}`);
        }
        doc.moveDown(0.2);
      }
    }

    doc.end();
  });
}
