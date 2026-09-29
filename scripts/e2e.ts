/**
 * End-to-end test. Talks to the running app over HTTP, the same way the browser does.
 *
 *   1) npm run dev          (in one terminal)
 *   2) npm run test:e2e     (in another terminal)
 *
 * It needs the demo data from `npm run db:setup`. It adds its own purchases, so you can run it
 * as many times as you like. Run `npm run db:reset` afterwards to get the demo data back to a clean state.
 */
import dotenv from "dotenv";
dotenv.config({ path: [".env.local", ".env"], quiet: true });

import { pool, query, queryOne } from "../src/lib/db";
import { DEMO_PASSWORD } from "../src/lib/demo";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}`, detail !== undefined ? `\n        -> ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : "");
  }
}
const section = (t: string) => console.log(`\n${t}`);

class Client {
  cookie = "";
  constructor(public email: string) {}
  async login() {
    const res = await fetch(`${BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: this.email, password: DEMO_PASSWORD }),
    });
    const set = res.headers.getSetCookie().find((c) => c.startsWith("fg_session="));
    if (!res.ok || !set) throw new Error(`Login failed for ${this.email}: ${res.status}`);
    this.cookie = set.split(";")[0]!;
    return this;
  }
  async post(path: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body === undefined ? "{}" : JSON.stringify(body),
    });
    const data: any = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }
  async json(path: string) {
    const res = await fetch(`${BASE}${path}`, { headers: { Cookie: this.cookie } });
    return { status: res.status, data: (await res.json().catch(() => ({}))) as any };
  }
  async page(path: string) {
    const res = await fetch(`${BASE}${path}`, { headers: { Cookie: this.cookie }, redirect: "manual" });
    return { status: res.status, location: res.headers.get("location"), text: res.status === 200 ? await res.text() : "" };
  }
}

async function who(short: string) {
  return new Client(`${short}@fraudguard.demo`).login();
}

const stamp = Date.now();
const cents = (stamp % 997) / 100; // makes every run's amounts different

/** Request -> approve -> PO -> goods received. Returns the PO id. */
async function buildPo(o: { thandi: Client; mpho: Client; john: Client; supplierId: number; category: string; item: string; qty: number; unitPrice: number; dept: string; company?: string; orderCompany?: string }) {
  const company = o.company ?? "small_civils";
  const rq = await o.thandi.post("/api/requests", { item: o.item, category: o.category, quantity: o.qty, estimatedCost: o.qty * o.unitPrice, department: o.dept, reason: "End-to-end test", company });
  const ap = await o.mpho.post(`/api/requests/${rq.data.id}/decision`, { decision: "approved", note: "ok" });
  const po = await o.john.post("/api/orders", { requestId: rq.data.id, supplierId: o.supplierId, unitPrice: o.unitPrice, ...(o.orderCompany ? { company: o.orderCompany } : {}) });
  const gr = await o.john.post(`/api/orders/${po.data.id}/receive`, { quantity: o.qty });
  return { rq, ap, po, gr, poId: po.data.id as number, company: o.orderCompany ?? company };
}

async function main() {
  console.log(`FraudGuard end-to-end test against ${BASE}`);
  try {
    const r = await fetch(`${BASE}/login`);
    if (!r.ok) throw new Error(String(r.status));
  } catch {
    console.error(`\nCould not reach ${BASE}. Start the app first with "npm run dev" and run this again.`);
    process.exit(1);
  }

  const thandi = await who("thandi");
  const mpho = await who("mpho");
  const john = await who("john");
  const ayanda = await who("ayanda");
  const naledi = await who("naledi");
  const pieter = await who("pieter");

  const supplier = async (name: string) => (await queryOne<any>("select * from suppliers where name = $1", [name]))!;
  const abc = await supplier("ABC Technology");
  const xyz = await supplier("XYZ Stationery");
  const sameBank = (s: any) => ({ bankName: s.bank_name, accountHolder: s.account_holder, accountNumber: s.account_number, branchCode: s.branch_code });

  /* ------------------------------------------------------------ */
  section("Login and access");
  const bad = await fetch(`${BASE}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "thandi@fraudguard.demo", password: "wrong" }) });
  check("wrong password is rejected (401)", bad.status === 401, bad.status);
  const anon = await fetch(`${BASE}/api/requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check("signed-out API call is rejected (401)", anon.status === 401, anon.status);
  const emp = await thandi.page("/dashboard");
  check("employee is redirected away from the dashboard", emp.status >= 300 && emp.status < 400, emp.status);
  const emp2 = await thandi.page("/audit");
  check("employee is redirected away from the audit trail", emp2.status >= 300 && emp2.status < 400, emp2.status);

  /* ------------------------------------------------------------ */
  section("Scenario 1: a clean purchase goes straight through");
  const unit1 = 12000 + cents;
  const c1 = await buildPo({ thandi, mpho, john, supplierId: abc.id, category: "IT Equipment", item: `E2E laptops ${stamp}`, qty: 10, unitPrice: unit1, dept: "IT" });
  check("employee creates a request", c1.rq.status === 200 && !!c1.rq.data.ref, c1.rq);
  check("manager approves it", c1.ap.status === 200, c1.ap);
  check("procurement creates the purchase order", c1.po.status === 200, c1.po);
  check("procurement records the delivery", c1.gr.status === 200, c1.gr);
  const over = await john.post(`/api/orders/${c1.poId}/receive`, { quantity: 1 });
  check("cannot receive more than was ordered (409)", over.status === 409, over);

  const noRole = await john.post("/api/invoices", { poId: c1.poId, invoiceNumber: `X-${stamp}`, invoiceDate: "2026-09-20", quantity: 10, unitPrice: unit1, ...sameBank(abc) });
  check("procurement cannot capture invoices (403)", noRole.status === 403, noRole);
  const audR = await pieter.post("/api/invoices", { poId: c1.poId, invoiceNumber: `X-${stamp}`, invoiceDate: "2026-09-20", quantity: 10, unitPrice: unit1, ...sameBank(abc) });
  check("auditor cannot capture invoices (403)", audR.status === 403, audR);

  const inv1 = await ayanda.post("/api/invoices", { poId: c1.poId, invoiceNumber: `INV-E2E-${stamp}-A`, invoiceDate: "2026-09-20", quantity: 10, unitPrice: unit1, ...sameBank(abc) });
  check("clean invoice is low risk", inv1.data.result?.band === "low" && inv1.data.outcome === "approved", inv1.data);
  check("clean invoice creates no alert", inv1.data.alertId === null, inv1.data);
  const pay1 = await ayanda.post(`/api/invoices/${inv1.data.invoiceId}/pay`);
  check("accountant pays it", pay1.status === 200, pay1);
  const pay1b = await ayanda.post(`/api/invoices/${inv1.data.invoiceId}/pay`);
  check("paying twice is refused (409)", pay1b.status === 409, pay1b);

  const j1 = await query<any>("select e.description, sum(l.debit) d, sum(l.credit) c from journal_entries e join journal_lines l on l.entry_id = e.id where e.invoice_id = $1 group by e.id order by e.id", [inv1.data.invoiceId]);
  check("two journal entries were posted (invoice, payment)", j1.length === 2, j1);
  check("every journal entry balances", j1.every((r) => Number(r.d) === Number(r.c)), j1);
  const vat = await queryOne<any>("select sum(debit) v from journal_lines l join journal_entries e on e.id = l.entry_id where e.invoice_id = $1 and account = 'VAT Input'", [inv1.data.invoiceId]);
  const expectVat = Math.round((10 * unit1 - (10 * unit1) / 1.15) * 100) / 100;
  check("VAT Input is 15% VAT out of the VAT-inclusive total", Math.abs(Number(vat.v) - expectVat) < 0.011, { got: vat.v, expectVat });

  /* ------------------------------------------------------------ */
  section("Scenario 2: changed bank account and inflated price is held");
  const unit2 = 12000 + cents;
  const c2 = await buildPo({ thandi, mpho, john, supplierId: abc.id, category: "IT Equipment", item: `E2E fraud laptops ${stamp}`, qty: 10, unitPrice: unit2, dept: "IT" });
  const inv2 = await ayanda.post("/api/invoices", {
    poId: c2.poId, invoiceNumber: `INV-E2E-${stamp}-B`, invoiceDate: "2026-09-20", quantity: 10, unitPrice: unit2 + 3000,
    bankName: "Standard Bank", accountHolder: "ABC Tech Logistics CC", accountNumber: "10184734491", branchCode: "051001",
  });
  const codes: string[] = (inv2.data.result?.reasons ?? []).map((r: any) => r.code);
  check("scored as high risk", inv2.data.result?.band === "high", inv2.data.result);
  check("payment is held and an alert is raised", inv2.data.outcome === "held" && !!inv2.data.alertId, inv2.data);
  check("bank_changed, above_normal and three_way_mismatch all fired", ["bank_changed", "above_normal", "three_way_mismatch"].every((c) => codes.includes(c)), codes);
  const pay2 = await ayanda.post(`/api/invoices/${inv2.data.invoiceId}/pay`);
  check("a held invoice cannot be paid (409)", pay2.status === 409, pay2);
  const acc = await ayanda.post(`/api/alerts/${inv2.data.alertId}/decision`, { decision: "approve", comment: "I would like to approve this" });
  check("accountant cannot decide an alert (403)", acc.status === 403, acc);
  const noComment = await naledi.post(`/api/alerts/${inv2.data.alertId}/decision`, { decision: "reject", comment: "no" });
  check("a decision needs a written reason (400)", noComment.status === 400, noComment);
  const page = await naledi.page(`/alerts/${inv2.data.alertId}`);
  check("the alert review page renders", page.status === 200 && page.text.includes("Supplier bank details") && page.text.includes("Three-way match"), page.status);
  const rej = await naledi.post(`/api/alerts/${inv2.data.alertId}/decision`, { decision: "reject", comment: "Supplier confirmed by phone they did not change banks." });
  check("Finance Manager rejects it", rej.status === 200 && rej.data.status === "rejected", rej);
  const rej2 = await naledi.post(`/api/alerts/${inv2.data.alertId}/decision`, { decision: "approve", comment: "changed my mind" });
  check("a resolved alert cannot be decided again (409)", rej2.status === 409, rej2);
  const j2 = await queryOne<any>("select count(*)::int n from journal_entries where invoice_id = $1", [inv2.data.invoiceId]);
  check("nothing was posted to the ledger for the rejected invoice", j2.n === 0, j2);
  const invRow = await queryOne<any>("select status from invoices where id = $1", [inv2.data.invoiceId]);
  check("the invoice is marked rejected", invRow.status === "rejected", invRow);

  /* ------------------------------------------------------------ */
  section("Scenario 3: a re-submitted invoice is a possible duplicate");
  const unit3 = 800 + cents;
  const c3 = await buildPo({ thandi, mpho, john, supplierId: xyz.id, category: "Office Supplies", item: `E2E toner ${stamp}`, qty: 5, unitPrice: unit3, dept: "Sales" });
  const num3 = `INV-E2E-${stamp}-C`;
  const first = await ayanda.post("/api/invoices", { poId: c3.poId, invoiceNumber: num3, invoiceDate: "2026-09-20", quantity: 5, unitPrice: unit3, ...sameBank(xyz) });
  check("the first copy is not held", first.data.outcome === "approved", first.data);
  const dup = await ayanda.post("/api/invoices", { poId: c3.poId, invoiceNumber: num3, invoiceDate: "2026-09-20", quantity: 5, unitPrice: unit3, ...sameBank(xyz) });
  const dcodes: string[] = (dup.data.result?.reasons ?? []).map((r: any) => r.code);
  check("the second copy fires duplicate_invoice", dcodes.includes("duplicate_invoice"), dcodes);
  check("the second copy is medium risk and held", dup.data.result?.band === "medium" && dup.data.outcome === "held", dup.data.result);
  const esc = await naledi.post(`/api/alerts/${dup.data.alertId}/decision`, { decision: "escalate", comment: "Checking with the supplier first." });
  check("Finance Manager escalates it", esc.status === 200 && esc.data.status === "escalated", esc);
  const stillHeld = await ayanda.post(`/api/invoices/${dup.data.invoiceId}/pay`);
  check("an escalated invoice is still held (409)", stillHeld.status === 409, stillHeld);
  const app = await naledi.post(`/api/alerts/${dup.data.alertId}/decision`, { decision: "approve", comment: "Supplier confirmed it is a separate delivery." });
  check("an escalated alert can still be approved", app.status === 200 && app.data.status === "cleared", app);
  const pay3 = await ayanda.post(`/api/invoices/${dup.data.invoiceId}/pay`);
  check("once approved it can be paid", pay3.status === 200, pay3);

  /* ------------------------------------------------------------ */
  section("Scenario 4: separation of duties");
  const own = await mpho.post("/api/requests", { item: `E2E own request ${stamp}`, category: "IT Equipment", quantity: 1, estimatedCost: 5000, department: "IT", reason: "Testing", company: "small_civils" });
  check("a manager can make a request", own.status === 200, own);
  const self = await mpho.post(`/api/requests/${own.data.id}/decision`, { decision: "approved", note: "me" });
  check("a manager cannot approve their own request (403)", self.status === 403 && /own/i.test(self.data.error), self);
  const byFm = await naledi.post(`/api/requests/${own.data.id}/decision`, { decision: "approved", note: "ok" });
  check("the Finance Manager can approve it", byFm.status === 200, byFm);
  const empDecide = await thandi.post(`/api/requests/${own.data.id}/decision`, { decision: "approved" });
  check("an employee cannot approve requests (403)", empDecide.status === 403, empDecide);
  const empOrder = await thandi.post("/api/orders", { requestId: own.data.id, supplierId: abc.id, unitPrice: 5000 });
  check("an employee cannot create purchase orders (403)", empOrder.status === 403, empOrder);
  const audReq = await pieter.post("/api/requests", { item: "x", category: "IT Equipment", quantity: 1, estimatedCost: 1, department: "IT", reason: "x", company: "small_civils" });
  check("an auditor cannot make requests (403)", audReq.status === 403, audReq);
  const badCat = await thandi.post("/api/requests", { item: "x", category: "Not a category", quantity: 1, estimatedCost: 10, department: "IT", reason: "x", company: "small_civils" });
  check("an unknown category is refused (400)", badCat.status === 400, badCat);
  const negQty = await thandi.post("/api/requests", { item: "x", category: "IT Equipment", quantity: -3, estimatedCost: 10, department: "IT", reason: "x", company: "small_civils" });
  check("a negative quantity is refused (400)", negQty.status === 400, negQty);

  /* ------------------------------------------------------------ */
  section("Scenario 5: new supplier, then a bank change");
  const name = `E2E Supplies ${stamp}`;
  const addS = await john.post("/api/suppliers", { name, bankName: "Capitec", accountHolder: name, accountNumber: "1234567890", branchCode: "470010" });
  check("procurement adds a supplier", addS.status === 200, addS);
  const sid = addS.data.id as number;
  const u5 = 500 + cents;
  const c5 = await buildPo({ thandi, mpho, john, supplierId: sid, category: "Office Supplies", item: `E2E stationery ${stamp}`, qty: 4, unitPrice: u5, dept: "Sales" });
  const i5 = await ayanda.post("/api/invoices", { poId: c5.poId, invoiceNumber: `INV-E2E-${stamp}-D`, invoiceDate: "2026-09-20", quantity: 4, unitPrice: u5, bankName: "Capitec", accountHolder: name, accountNumber: "1234567890", branchCode: "470010" });
  check("an unverified supplier is flagged (new_supplier)", (i5.data.result?.reasons ?? []).some((r: any) => r.code === "new_supplier"), i5.data.result);
  const ver = await naledi.post(`/api/suppliers/${sid}/verify`);
  check("Finance Manager verifies the supplier", ver.status === 200, ver);
  const verBy = await ayanda.post(`/api/suppliers/${sid}/verify`);
  check("an accountant cannot verify suppliers (403)", verBy.status === 403, verBy);
  const chg = await john.post(`/api/suppliers/${sid}/bank`, { bankName: "Nedbank", accountHolder: name, accountNumber: "9876543210", branchCode: "198765" });
  check("procurement changes the bank details", chg.status === 200, chg);
  const c5b = await buildPo({ thandi, mpho, john, supplierId: sid, category: "Office Supplies", item: `E2E stationery 2 ${stamp}`, qty: 4, unitPrice: u5 + 1, dept: "Sales" });
  const i5b = await ayanda.post("/api/invoices", { poId: c5b.poId, invoiceNumber: `INV-E2E-${stamp}-E`, invoiceDate: "2026-09-20", quantity: 4, unitPrice: u5 + 1, bankName: "Nedbank", accountHolder: name, accountNumber: "9876543210", branchCode: "198765" });
  const why = (i5b.data.result?.reasons ?? []).find((r: any) => r.code === "bank_changed");
  check("recently changed bank details are flagged even though the invoice matches the record", !!why && /changed/.test(why.detail), i5b.data.result);
  const hist = await queryOne<any>("select count(*)::int n from supplier_bank_history where supplier_id = $1", [sid]);
  check("the old bank details are kept in history", hist.n === 1, hist);

  /* ------------------------------------------------------------ */
  section("Small Civils and VZ Coatings");
  const noCo = await thandi.post("/api/requests", { item: "x", category: "IT Equipment", quantity: 1, estimatedCost: 100, department: "IT", reason: "x" });
  check("a request without a company is refused (400)", noCo.status === 400 && /Small Civils or VZ Coatings/.test(noCo.data.error), noCo);
  const badCo = await thandi.post("/api/requests", { item: "x", category: "IT Equipment", quantity: 1, estimatedCost: 100, department: "IT", reason: "x", company: "acme" });
  check("an unknown company is refused (400)", badCo.status === 400, badCo);

  // Default cascade: request -> order -> invoice keep the same company
  const vzU = 7000 + cents;
  const vz = await buildPo({ thandi, mpho, john, supplierId: xyz.id, category: "Furniture", item: `E2E VZ desk ${stamp}`, qty: 2, unitPrice: vzU, dept: "Operations", company: "vz_coatings" });
  const poRow = await queryOne<any>("select company from purchase_orders where id = $1", [vz.poId]);
  check("an order takes the company of its request by default", poRow.company === "vz_coatings", poRow);
  const vzInv = await ayanda.post("/api/invoices", { poId: vz.poId, invoiceNumber: `INV-E2E-${stamp}-VZ`, invoiceDate: "2026-09-20", quantity: 2, unitPrice: vzU, ...sameBank(xyz) });
  const vzInvRow = await queryOne<any>("select company from invoices where id = $1", [vzInv.data.invoiceId]);
  check("an invoice takes the company of its order by default", vzInvRow.company === "vz_coatings", vzInvRow);

  // Moving a project: started at Small Civils, continued at VZ Coatings
  const mvU = 3000 + cents;
  const mv = await buildPo({ thandi, mpho, john, supplierId: xyz.id, category: "Furniture", item: `E2E moved project ${stamp}`, qty: 2, unitPrice: mvU, dept: "Operations", company: "small_civils", orderCompany: "vz_coatings" });
  const mvRow = await queryOne<any>("select po.company as po_co, r.company as req_co from purchase_orders po join purchase_requests r on r.id = po.request_id where po.id = $1", [mv.poId]);
  check("Procurement can move an order to the other company", mvRow.req_co === "small_civils" && mvRow.po_co === "vz_coatings", mvRow);
  const mvInv = await ayanda.post("/api/invoices", { poId: mv.poId, invoiceNumber: `INV-E2E-${stamp}-MV`, invoiceDate: "2026-09-20", quantity: 2, unitPrice: mvU, company: "small_civils", ...sameBank(xyz) });
  const mvInvRow = await queryOne<any>("select company from invoices where id = $1", [mvInv.data.invoiceId]);
  check("the Accountant can invoice under a different company", mvInvRow.company === "small_civils", mvInvRow);
  const badOrderCo = await john.post("/api/orders", { requestId: 1, supplierId: xyz.id, unitPrice: 100, company: "acme" });
  check("an unknown company on an order is refused (400)", badOrderCo.status === 400, badOrderCo);

  const auditCo = await queryOne<any>("select count(*)::int n from audit_log where entity_ref = (select ref from purchase_orders where id = $1) and company = 'vz_coatings'", [vz.poId]);
  check("the audit trail records the company of the action", auditCo.n >= 1, auditCo);

  // Filters: each company only shows its own records
  const iRef = (await queryOne<any>("select ref from invoices where id = $1", [vzInv.data.invoiceId]))!.ref as string;
  const vzPage = await naledi.page("/invoices?company=vz_coatings");
  const scPage = await naledi.page("/invoices?company=small_civils");
  const allPage = await naledi.page("/invoices");
  check("the VZ Coatings invoice filter shows a VZ invoice", vzPage.status === 200 && vzPage.text.includes(iRef));
  check("the Small Civils invoice filter hides a VZ invoice", scPage.status === 200 && !scPage.text.includes(iRef));
  check("the unfiltered list shows both", allPage.text.includes(iRef));
  for (const p of ["/dashboard", "/alerts", "/alerts?show=all", "/journal", "/audit", "/requests?show=all"]) {
    for (const co of ["small_civils", "vz_coatings"]) {
      const r = await naledi.page(`${p}${p.includes("?") ? "&" : "?"}company=${co}`);
      check(`Finance Manager: ${p} filtered to ${co}`, r.status === 200 && !r.text.includes("Application error"), r.status);
    }
  }
  const ordVz = await john.page("/orders?company=vz_coatings");
  check("Procurement: orders filtered to VZ Coatings", ordVz.status === 200 && ordVz.text.includes("VZ Coatings"));
  const jrVz = await naledi.page("/journal?company=vz_coatings");
  check("the journal filter shows only VZ Coatings entries", jrVz.status === 200 && !jrVz.text.includes("Small Civils</span></span>"));

  // VAT shown on money
  const vatPage = await naledi.page("/invoices");
  check("invoice amounts show their VAT", /incl\. VAT (?:<!-- -->)?R[\d,]+\.\d\d/.test(vatPage.text));
  const reqPage = await mpho.page("/requests?show=all");
  check("request estimates show VAT added on top", /\+ VAT (?:<!-- -->)?R[\d,]+\.\d\d(?:<!-- -->)? = (?:<!-- -->)?R[\d,]+\.\d\d(?:<!-- -->)? incl\./.test(reqPage.text));

  /* ------------------------------------------------------------ */
  section("Attention badges show up by themselves");
  const count = async (c: Client, key: string) => {
    const r = await c.json("/api/attention");
    return ((r.data.tasks ?? []) as any[]).find((t) => t.key === key)?.count ?? 0;
  };
  const att = await thandi.json("/api/attention");
  check("the attention endpoint answers for a signed-in user", att.status === 200 && Array.isArray(att.data.tasks), att);
  const before = { mgr: await count(mpho, "req_from_employees"), order: await count(john, "to_order"), inv: await count(ayanda, "to_invoice"), pay: await count(ayanda, "to_pay") };
  const nr = await thandi.post("/api/requests", { item: `E2E badge ${stamp}`, category: "IT Equipment", quantity: 2, estimatedCost: 2000, department: "IT", reason: "Badge test", company: "small_civils" });
  check("Manager gets a badge when an employee makes a request", (await count(mpho, "req_from_employees")) === before.mgr + 1, before);
  await mpho.post(`/api/requests/${nr.data.id}/decision`, { decision: "approved", note: "ok" });
  check("Employee gets an update badge when the request is decided", (await count(thandi, "my_updates")) >= 1);
  check("Procurement gets a badge for an approved request", (await count(john, "to_order")) === before.order + 1);
  const npo = await john.post("/api/orders", { requestId: nr.data.id, supplierId: xyz.id, unitPrice: 1000 });
  await john.post(`/api/orders/${npo.data.id}/receive`, { quantity: 2 });
  check("Accountant gets a badge for a delivered order waiting for an invoice", (await count(ayanda, "to_invoice")) === before.inv + 1);
  const ni = await ayanda.post("/api/invoices", { poId: npo.data.id, invoiceNumber: `INV-E2E-${stamp}-F`, invoiceDate: "2026-09-20", quantity: 2, unitPrice: 1000, ...sameBank(xyz) });
  check("Accountant gets a badge for an invoice that is ready to pay", ni.data.outcome === "approved" && (await count(ayanda, "to_pay")) === before.pay + 1, ni.data);
  const fmBefore = await count(naledi, "alerts_active");
  const npo2 = await buildPo({ thandi, mpho, john, supplierId: abc.id, category: "IT Equipment", item: `E2E badge alert ${stamp}`, qty: 1, unitPrice: 500 + cents, dept: "IT" });
  await ayanda.post("/api/invoices", { poId: npo2.poId, invoiceNumber: `INV-E2E-${stamp}-G`, invoiceDate: "2026-09-20", quantity: 1, unitPrice: 900 + cents, bankName: "Standard Bank", accountHolder: "Other Co", accountNumber: "10184734491", branchCode: "051001" });
  check("Finance Manager gets an alert badge when an invoice is held", (await count(naledi, "alerts_active")) === fmBefore + 1);
  const mreq = await mpho.post("/api/requests", { item: `E2E manager request ${stamp}`, category: "IT Equipment", quantity: 1, estimatedCost: 3000, department: "IT", reason: "Testing", company: "small_civils" });
  check("Finance Manager gets a badge for a manager's request", (await count(naledi, "req_from_managers")) >= 1, mreq);
  check("Manager's own request does not badge the manager", (await count(mpho, "req_from_employees")) === before.mgr);
  check("Auditor has no action badges apart from escalated alerts", ((await pieter.json("/api/attention")).data.tasks as any[]).every((t) => t.key === "alerts_escalated"));

  /* ------------------------------------------------------------ */
  section("Each role only sees the menu it needs");
  const menu = async (c: Client) => (await c.page("/" + (c === thandi || c === mpho ? "requests" : c === john ? "orders" : c === ayanda ? "invoices" : "dashboard"))).text;
  const tEmp = await menu(thandi), tMgr = await menu(mpho), tPro = await menu(john), tAcc = await menu(ayanda), tFm = await menu(naledi), tAud = await menu(pieter);
  check("employee menu: only My requests", tEmp.includes("My requests") && !tEmp.includes("Audit trail") && !tEmp.includes("Journal") && !tEmp.includes(">Alerts<"));
  check("manager menu: only Requests to approve", tMgr.includes("Requests to approve") && !tMgr.includes("Dashboard") && !tMgr.includes("Audit trail"));
  check("procurement menu: Orders and Suppliers", tPro.includes(">Orders") && tPro.includes(">Suppliers") && !tPro.includes("Journal") && !tPro.includes("Audit trail"));
  check("accountant menu: Invoices and payments, Journal", tAcc.includes("Invoices and payments") && tAcc.includes(">Journal") && !tAcc.includes("Audit trail") && !tAcc.includes(">Suppliers"));
  check("finance manager menu: Dashboard, Alerts, Requests, Suppliers, Audit trail", ["Dashboard", "Alerts", "Requests", "Suppliers", "Audit trail"].every((x) => tFm.includes(x)) && !tFm.includes(">Orders"));
  check("auditor menu: Dashboard, Alerts, Invoices, Journal, Audit trail", ["Dashboard", "Alerts", "Invoices", "Journal", "Audit trail"].every((x) => tAud.includes(x)) && !tAud.includes(">Orders"));

  /* ------------------------------------------------------------ */
  section("Pages render for every role");
  const pages: [string, Client, string[]][] = [
    ["manager", mpho, ["/requests", "/requests?show=all"]],
    ["procurement", john, ["/orders", "/suppliers"]],
    ["accountant", ayanda, ["/alerts", "/invoices", "/invoices/new", "/journal"]],
    ["finance manager", naledi, ["/dashboard", "/alerts", "/alerts?show=all", "/requests", "/requests?show=all", "/orders", "/suppliers", "/invoices", "/journal", "/audit", "/audit?q=alert"]],
    ["auditor", pieter, ["/dashboard", "/alerts", "/orders", "/invoices", "/journal", "/audit", "/requests", "/suppliers"]],
    ["employee", thandi, ["/requests"]],
  ];
  for (const [role, client, list] of pages) {
    for (const p of list) {
      const res = await client.page(p);
      check(`${role}: ${p}`, res.status === 200 && !res.text.includes("Application error"), res.status);
    }
  }
  const blocked: [string, Client, string][] = [
    ["employee", thandi, "/orders"], ["employee", thandi, "/dashboard"], ["manager", mpho, "/dashboard"], ["manager", mpho, "/orders"],
    ["procurement", john, "/requests"], ["procurement", john, "/dashboard"], ["procurement", john, "/invoices"],
    ["accountant", ayanda, "/dashboard"], ["accountant", ayanda, "/suppliers"], ["accountant", ayanda, "/audit"],
  ];
  for (const [role, client, p] of blocked) {
    const res = await client.page(p);
    check(`${role} is sent away from ${p}`, res.status >= 300 && res.status < 400, res.status);
  }

  /* ------------------------------------------------------------ */
  section("Ledger and audit trail");
  const tb = await queryOne<any>("select sum(debit) d, sum(credit) c from journal_lines");
  check("total debits equal total credits across the whole ledger", Number(tb.d) === Number(tb.c), tb);
  const au = await queryOne<any>("select count(*)::int n from audit_log where at > now() - interval '10 minutes'");
  check("the audit trail recorded this test run", au.n > 30, au);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("\nThe test crashed:", e);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
