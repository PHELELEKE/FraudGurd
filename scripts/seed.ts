/**
 * Demo data. Everything here goes through the same functions the app uses
 * (createRequest, captureInvoice, ...), so the seed data follows the real rules.
 */
import bcrypt from "bcryptjs";
import { pool, query, queryOne } from "../src/lib/db";
import {
  captureInvoice,
  createOrder,
  createRequest,
  decideRequest,
  payInvoice,
  receiveGoods,
  resolveAlert,
  verifySupplier,
  type Actor,
} from "../src/lib/p2p";
import type { Role } from "../src/lib/roles";
import type { Company } from "../src/lib/companies";

import { DEMO_PASSWORD } from "../src/lib/demo";
export { DEMO_PASSWORD };

const USERS: { name: string; email: string; role: Role; department: string }[] = [
  { name: "Thandi Mokoena", email: "thandi@fraudguard.demo", role: "employee", department: "IT" },
  { name: "Sindi Ndlovu", email: "sindi@fraudguard.demo", role: "employee", department: "Sales" },
  { name: "Kagiso Molefe", email: "kagiso@fraudguard.demo", role: "employee", department: "Operations" },
  { name: "Mpho Dlamini", email: "mpho@fraudguard.demo", role: "manager", department: "IT" },
  { name: "John Khumalo", email: "john@fraudguard.demo", role: "procurement", department: "Operations" },
  { name: "Ayanda Zulu", email: "ayanda@fraudguard.demo", role: "accountant", department: "Finance" },
  { name: "Naledi Khumalo", email: "naledi@fraudguard.demo", role: "finance_manager", department: "Finance" },
  { name: "Pieter van der Merwe", email: "pieter@fraudguard.demo", role: "auditor", department: "Finance" },
];

const CATEGORIES = [
  ["IT Equipment", 125000, "Computer Equipment"],
  ["Office Supplies", 5000, "Office Supplies Expense"],
  ["Furniture", 30000, "Furniture and Fittings"],
  ["Software", 25000, "Software Licences Expense"],
  ["Professional Services", 40000, "Professional Fees Expense"],
] as const;

interface Bank {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  branchCode: string;
}

const SUPPLIERS: { name: string; status: "approved" | "pending"; bank: Bank }[] = [
  { name: "ABC Technology", status: "approved", bank: { bankName: "First National Bank", accountHolder: "ABC Technology (Pty) Ltd", accountNumber: "62841029102", branchCode: "250655" } },
  { name: "XYZ Stationery", status: "approved", bank: { bankName: "Absa", accountHolder: "XYZ Stationery CC", accountNumber: "4091827364", branchCode: "632005" } },
  { name: "Protea Furniture", status: "approved", bank: { bankName: "Nedbank", accountHolder: "Protea Furniture (Pty) Ltd", accountNumber: "1187203945", branchCode: "198765" } },
  { name: "Sandton Cloud Solutions", status: "approved", bank: { bankName: "Standard Bank", accountHolder: "Sandton Cloud Solutions (Pty) Ltd", accountNumber: "27018394522", branchCode: "051001" } },
  { name: "Umhlanga Facilities", status: "approved", bank: { bankName: "First National Bank", accountHolder: "Umhlanga Facilities CC", accountNumber: "62790418833", branchCode: "250655" } },
  { name: "Quick Supplies", status: "pending", bank: { bankName: "Capitec", accountHolder: "Quick Supplies Trading", accountNumber: "1504839271", branchCode: "470010" } },
  { name: "Mthunzi Cleaning Services", status: "pending", bank: { bankName: "Capitec", accountHolder: "Mthunzi Cleaning Services", accountNumber: "1698204417", branchCode: "470010" } },
];

export async function seedAll(log: (m: string) => void = console.log) {
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  for (const u of USERS) {
    await query("insert into users (name, email, password_hash, role, department) values ($1,$2,$3,$4,$5)", [
      u.name, u.email, hash, u.role, u.department,
    ]);
  }
  for (const [category, max, account] of CATEGORIES) {
    await query("insert into category_norms (category, normal_max, ledger_account) values ($1,$2,$3)", [category, max, account]);
  }

  const rows = await query<{ id: number; name: string; email: string; role: Role }>("select id, name, email, role from users");
  const actor = (email: string): Actor => {
    const u = rows.find((r) => r.email === `${email}@fraudguard.demo`)!;
    return { id: u.id, name: u.name, role: u.role };
  };
  const thandi = actor("thandi"), sindi = actor("sindi"), kagiso = actor("kagiso");
  const mpho = actor("mpho"), john = actor("john"), ayanda = actor("ayanda"), naledi = actor("naledi");

  const john_id = john.id;
  for (const s of SUPPLIERS) {
    await query(
      `insert into suppliers (name, status, bank_name, account_holder, account_number, branch_code, created_by, verified_by, verified_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [s.name, s.status, s.bank.bankName, s.bank.accountHolder, s.bank.accountNumber, s.bank.branchCode, john_id,
       s.status === "approved" ? naledi.id : null, s.status === "approved" ? new Date() : null]
    );
  }
  const supplierId = async (name: string) => (await queryOne<{ id: number }>("select id from suppliers where name = $1", [name]))!.id;
  await query("update suppliers set created_at = now() - interval '90 days', verified_at = now() - interval '89 days' where status = 'approved'");

  /** Runs one full purchase-to-payment chain through the real functions, then moves its dates into the past. */
  async function chain(o: {
    daysAgo: number;
    requester: Actor;
    department: string;
    category: string;
    item: string;
    qty: number;
    unitPrice: number;
    supplier: string;
    invoiceNumber: string;
    invoiceUnitPrice?: number;
    invoiceBank?: Bank;
    company: Company;
    /** Set this when the project moves to the other company partway through. */
    orderCompany?: Company;
    invoiceCompany?: Company;
    alert?: { decision: "approve" | "reject" | "leave"; comment?: string; verifySupplier?: boolean };
    pay?: boolean;
  }) {
    const startAudit = (await queryOne<{ n: number }>("select coalesce(max(id),0) as n from audit_log"))!.n;
    const est = o.qty * o.unitPrice;
    const pr = await createRequest(o.requester, { item: o.item, category: o.category, quantity: o.qty, estimatedCost: est, department: o.department, reason: "Needed for day-to-day operations", company: o.company });
    const approver = o.requester.role === "manager" ? naledi : mpho;
    await decideRequest(approver, pr.id, { decision: "approved", note: "Within budget" });
    const po = await createOrder(john, { requestId: pr.id, supplierId: await supplierId(o.supplier), unitPrice: o.unitPrice, company: o.orderCompany ?? o.company });
    await receiveGoods(john, po.id, { quantity: o.qty, notes: "Delivered and checked" });
    const sup = SUPPLIERS.find((s) => s.name === o.supplier)!;
    const cap = await captureInvoice(ayanda, {
      poId: po.id,
      invoiceNumber: o.invoiceNumber,
      invoiceDate: new Date(Date.now() - o.daysAgo * 86_400_000).toISOString().slice(0, 10),
      quantity: o.qty,
      unitPrice: o.invoiceUnitPrice ?? o.unitPrice,
      company: o.invoiceCompany ?? o.orderCompany ?? o.company,
      ...(o.invoiceBank ?? sup.bank),
    });
    let paid = false;
    if (cap.alertId && o.alert) {
      if (o.alert.verifySupplier) await verifySupplier(naledi, await supplierId(o.supplier));
      if (o.alert.decision !== "leave") {
        await resolveAlert(naledi, cap.alertId, { decision: o.alert.decision, comment: o.alert.comment ?? "Reviewed" });
        if (o.alert.decision === "approve" && o.pay !== false) {
          await payInvoice(ayanda, cap.invoiceId);
          paid = true;
        }
      }
    } else if (!cap.alertId && o.pay !== false) {
      await payInvoice(ayanda, cap.invoiceId);
      paid = true;
    }

    // Move everything this chain touched into the past. "daysAgo" is the day the invoice was captured.
    const d = o.daysAgo;
    const t = (hours: number) => `now() - make_interval(days => ${d}) + make_interval(hours => ${hours})`;
    await query(`update purchase_requests set created_at = ${t(-96)}, decided_at = ${t(-91)} where id = $1`, [pr.id]);
    await query(`update purchase_orders set created_at = ${t(-72)} where id = $1`, [po.id]);
    await query(`update goods_received set received_at = ${t(-24)} where po_id = $1`, [po.id]);
    await query(`update invoices set captured_at = ${t(0)}, paid_at = case when paid_at is null then null else ${t(48)} end where id = $1`, [cap.invoiceId]);
    await query(`update alerts set created_at = ${t(0)}, resolved_at = case when resolved_at is null then null else ${t(5)} end where invoice_id = $1`, [cap.invoiceId]);
    await query(
      `update journal_entries set posted_at = case when description like 'Payment%' then ${t(48)} else ${t(5)} end where invoice_id = $1`,
      [cap.invoiceId]
    );
    await query(`update audit_log set at = (${t(-96)}) + ((id - $1)::int * interval '10 hours') where id > $1`, [startAudit]);
    return { pr, po, cap, paid };
  }

  const ABC_OTHER: Bank = { bankName: "Standard Bank", accountHolder: "ABC Tech Logistics CC", accountNumber: "10184734491", branchCode: "051001" };
  const PROTEA_OTHER: Bank = { bankName: "Capitec", accountHolder: "Protea Furn Trading", accountNumber: "1698230071", branchCode: "470010" };

  log("Creating 4 to 6 weeks of purchase history...");
  await chain({ daysAgo: 44, requester: thandi, department: "IT", category: "IT Equipment", item: "5 x Monitors", qty: 5, unitPrice: 2800, supplier: "ABC Technology", invoiceNumber: "INV-ABC-2031", company: "small_civils" });
  await chain({ daysAgo: 42, requester: sindi, department: "Sales", category: "Office Supplies", item: "Printer paper (20 reams)", qty: 20, unitPrice: 95, supplier: "XYZ Stationery", invoiceNumber: "INV-XY-1101", company: "small_civils" });
  await chain({ daysAgo: 40, requester: kagiso, department: "Operations", category: "Furniture", item: "12 x Office chairs", qty: 12, unitPrice: 1850, supplier: "Protea Furniture", invoiceNumber: "INV-PF-0412",
    // This project started under Small Civils but Procurement moved it to VZ Coatings before ordering.
    company: "small_civils", orderCompany: "vz_coatings" });
  await chain({ daysAgo: 38, requester: thandi, department: "IT", category: "Software", item: "3 x Accounting software licences", qty: 3, unitPrice: 6500, supplier: "Sandton Cloud Solutions", invoiceNumber: "INV-SC-7710", company: "vz_coatings" });
  await chain({ daysAgo: 36, requester: sindi, department: "Sales", category: "Office Supplies", item: "Stationery bundle", qty: 10, unitPrice: 240, supplier: "XYZ Stationery", invoiceNumber: "INV-XY-1187", company: "small_civils" });
  await chain({ daysAgo: 33, requester: kagiso, department: "Operations", category: "Professional Services", item: "Quarterly aircon servicing", qty: 1, unitPrice: 9800, supplier: "Umhlanga Facilities", invoiceNumber: "INV-UF-3301", company: "vz_coatings" });
  await chain({ daysAgo: 31, requester: thandi, department: "IT", category: "IT Equipment", item: "8 x Laptop docking stations", qty: 8, unitPrice: 1650, supplier: "ABC Technology", invoiceNumber: "INV-ABC-2077", company: "small_civils" });
  await chain({ daysAgo: 28, requester: sindi, department: "Sales", category: "Office Supplies", item: "Toner cartridges", qty: 6, unitPrice: 780, supplier: "XYZ Stationery", invoiceNumber: "INV-XY-1150", company: "vz_coatings" });
  await chain({ daysAgo: 26, requester: kagiso, department: "Operations", category: "Furniture", item: "Reception desk", qty: 1, unitPrice: 15400, supplier: "Protea Furniture", invoiceNumber: "INV-PF-0433", company: "small_civils" });
  // Same invoice number as the stationery bundle above: a duplicate, rejected by the Finance Manager.
  await chain({ daysAgo: 24, requester: sindi, department: "Sales", category: "Office Supplies", item: "Printer paper (30 reams)", qty: 30, unitPrice: 95, supplier: "XYZ Stationery", invoiceNumber: "INV-XY-1187", company: "small_civils",
    alert: { decision: "reject", comment: "Same invoice number as the stationery bundle that was already paid. Supplier asked to send a corrected invoice." } });
  await chain({ daysAgo: 22, requester: thandi, department: "IT", category: "IT Equipment", item: "10 x Laptops (Lenovo ThinkPad E14)", qty: 10, unitPrice: 11800, supplier: "ABC Technology", invoiceNumber: "INV-ABC-2101", company: "vz_coatings" });
  // New bank account and a higher price than the PO: high risk, rejected.
  await chain({ daysAgo: 19, requester: kagiso, department: "Operations", category: "Furniture", item: "Boardroom table", qty: 1, unitPrice: 36000, supplier: "Protea Furniture", invoiceNumber: "INV-PF-0450",
    invoiceUnitPrice: 41000, invoiceBank: PROTEA_OTHER, company: "small_civils",
    alert: { decision: "reject", comment: "Called the supplier on the number we have on file. They did not change their bank details and did not raise the price." } });
  await chain({ daysAgo: 16, requester: thandi, department: "IT", category: "Software", item: "Cloud backup subscription (annual)", qty: 1, unitPrice: 23400, supplier: "Sandton Cloud Solutions", invoiceNumber: "INV-SC-7788", company: "vz_coatings" });
  await chain({ daysAgo: 14, requester: sindi, department: "Sales", category: "Office Supplies", item: "Whiteboards and markers", qty: 8, unitPrice: 310, supplier: "XYZ Stationery", invoiceNumber: "INV-XY-1203", company: "small_civils" });
  // Supplier not verified yet: medium risk, cleared once the Finance Manager verified them.
  await chain({ daysAgo: 12, requester: kagiso, department: "Operations", category: "Professional Services", item: "Staff training workshop", qty: 1, unitPrice: 28750, supplier: "Quick Supplies", invoiceNumber: "INV-QS-0091", company: "vz_coatings",
    alert: { decision: "approve", verifySupplier: true, comment: "Supplier registration and bank confirmation letter checked. Verified and cleared." } });
  await chain({ daysAgo: 10, requester: thandi, department: "IT", category: "IT Equipment", item: "6 x Wireless keyboards and mice", qty: 6, unitPrice: 950, supplier: "ABC Technology", invoiceNumber: "INV-ABC-2144", company: "small_civils" });
  await chain({ daysAgo: 9, requester: sindi, department: "Sales", category: "Furniture", item: "4 x Standing desks", qty: 4, unitPrice: 5900, supplier: "Protea Furniture", invoiceNumber: "INV-PF-0471", company: "vz_coatings" });
  // Approved but not paid yet: waiting for the Accountant.
  await chain({ daysAgo: 8, requester: kagiso, department: "Operations", category: "Office Supplies", item: "Kitchen supplies", qty: 1, unitPrice: 3150, supplier: "XYZ Stationery", invoiceNumber: "INV-XY-1219", company: "small_civils", pay: false });
  // Same amount as the backup subscription 8 days earlier: medium risk, waiting for the Finance Manager.
  await chain({ daysAgo: 8, requester: thandi, department: "IT", category: "Software", item: "Cloud backup subscription (second site)", qty: 1, unitPrice: 23400, supplier: "Sandton Cloud Solutions", invoiceNumber: "INV-SC-7802", company: "vz_coatings",
    alert: { decision: "leave" } });

  log("Creating open work for the live demo...");
  // A few requests in different states
  const r1 = await createRequest(sindi, { item: "Ergonomic desk chairs", category: "Furniture", quantity: 6, estimatedCost: 11400, department: "Sales", reason: "Replacing broken chairs in the sales office", company: "small_civils" });
  const r2 = await createRequest(mpho, { item: "Conference room display screen", category: "IT Equipment", quantity: 1, estimatedCost: 18500, department: "IT", reason: "Client presentations", company: "vz_coatings" });
  const r3 = await createRequest(kagiso, { item: "Network switches", category: "IT Equipment", quantity: 4, estimatedCost: 14000, department: "Operations", reason: "Warehouse network upgrade", company: "small_civils" });
  await decideRequest(mpho, r3.id, { decision: "approved", note: "Approved" });
  void r1; void r2;

  // Three purchase orders that are delivered and ready to be invoiced.
  async function readyPo(requester: Actor, dept: string, category: string, item: string, qty: number, unitPrice: number, supplier: string, company: Company) {
    const pr = await createRequest(requester, { item, category, quantity: qty, estimatedCost: qty * unitPrice, department: dept, reason: "Approved purchase for the demo", company });
    await decideRequest(mpho, pr.id, { decision: "approved", note: "Approved" });
    const po = await createOrder(john, { requestId: pr.id, supplierId: await supplierId(supplier), unitPrice, company });
    await receiveGoods(john, po.id, { quantity: qty, notes: "Delivered and checked" });
    return po;
  }
  const a = await readyPo(thandi, "IT", "IT Equipment", "10 x Dell Latitude 5540 laptops", 10, 12000, "ABC Technology", "small_civils");
  const b = await readyPo(thandi, "IT", "IT Equipment", "10 x HP ProBook 450 laptops", 10, 12000, "ABC Technology", "vz_coatings");
  const c = await readyPo(sindi, "Sales", "Office Supplies", "Printer toner and paper", 10, 450, "XYZ Stationery", "small_civils");

  const counts = await queryOne(`select (select count(*) from invoices)::int as invoices, (select count(*) from alerts)::int as alerts, (select count(*) from journal_entries)::int as journals`);
  log(`Seeded ${USERS.length} users, ${SUPPLIERS.length} suppliers, ${counts!.invoices} invoices, ${counts!.alerts} alerts, ${counts!.journals} journal entries.`);
  log(`Ready to invoice: ${a.ref} (clean demo), ${b.ref} (fraud demo), ${c.ref} (duplicate demo).`);
  return { pool };
}
