import { test } from "node:test";
import assert from "node:assert/strict";
import { bandFor, matchInvoice, scoreInvoice, type RuleInput } from "./rules";

const NOW = new Date("2026-09-20T10:00:00Z");

/** A clean invoice: 10 laptops at R12,000, everything matches. */
function clean(overrides: Partial<RuleInput> = {}): RuleInput {
  return {
    supplier: { name: "ABC Technology", status: "approved", accountNumber: "62841029102", bankChangedAt: null },
    po: { quantity: 10, unitPrice: 12000 },
    receivedQty: 10,
    invoice: { number: "INV-1001", quantity: 10, unitPrice: 12000, total: 120000, accountNumber: "62841029102" },
    category: "IT Equipment",
    categoryNormalMax: 125000,
    sameNumber: [],
    sameAmount: [],
    recentInvoiceCount: 1,
    now: NOW,
    ...overrides,
  };
}

test("bands: low up to 24, medium 25 to 59, high 60 and above", () => {
  assert.equal(bandFor(0), "low");
  assert.equal(bandFor(24), "low");
  assert.equal(bandFor(25), "medium");
  assert.equal(bandFor(59), "medium");
  assert.equal(bandFor(60), "high");
  assert.equal(bandFor(100), "high");
});

test("scenario 1: a clean invoice scores 0 and is low risk", () => {
  const r = scoreInvoice(clean());
  assert.equal(r.score, 0);
  assert.equal(r.band, "low");
  assert.equal(r.reasons.length, 0);
  assert.equal(r.match.ok, true);
});

test("scenario 2: changed bank account + inflated price scores 90 and is high risk", () => {
  const r = scoreInvoice(
    clean({
      invoice: { number: "INV-90432", quantity: 10, unitPrice: 15000, total: 150000, accountNumber: "10184734491" },
    })
  );
  assert.deepEqual(r.reasons.map((x) => x.code).sort(), ["above_normal", "bank_changed", "three_way_mismatch"]);
  assert.equal(r.score, 90);
  assert.equal(r.band, "high");
  assert.equal(r.match.variance, 30000);
});

test("scenario 3: a re-submitted invoice number scores 35 and is medium risk", () => {
  const r = scoreInvoice(clean({ sameNumber: [{ ref: "AP-0007", number: "INV-1001" }] }));
  assert.equal(r.score, 35);
  assert.equal(r.band, "medium");
  assert.equal(r.reasons[0]!.code, "duplicate_invoice");
});

test("a bank change on its own is never low risk", () => {
  const r = scoreInvoice(clean({ supplier: { name: "ABC", status: "approved", accountNumber: "1", bankChangedAt: null }, invoice: { ...clean().invoice, accountNumber: "222222" } }));
  assert.equal(r.score, 30);
  assert.equal(r.band, "medium");
});

test("recently changed supplier bank details are flagged even if the invoice matches the record", () => {
  const changed = new Date(NOW.getTime() - 3 * 86_400_000);
  const r = scoreInvoice(clean({ supplier: { ...clean().supplier, bankChangedAt: changed } }));
  assert.equal(r.reasons[0]!.code, "bank_changed");
  assert.match(r.reasons[0]!.detail, /3 days ago/);
});

test("same amount from the same supplier is treated as a possible duplicate", () => {
  const r = scoreInvoice(clean({ sameAmount: [{ ref: "AP-0003", number: "INV-0999" }] }));
  assert.equal(r.reasons[0]!.code, "duplicate_invoice");
  assert.equal(r.score, 35);
});

test("an unverified supplier adds 30 points", () => {
  const r = scoreInvoice(clean({ supplier: { ...clean().supplier, status: "pending" } }));
  assert.equal(r.score, 30);
  assert.equal(r.band, "medium");
});

test("amount above the category maximum adds 20 points (low on its own)", () => {
  const r = scoreInvoice(clean({ categoryNormalMax: 100000 }));
  assert.equal(r.score, 20);
  assert.equal(r.band, "low");
});

test("three invoices from the same supplier in 7 days adds 15 points", () => {
  const r = scoreInvoice(clean({ recentInvoiceCount: 3 }));
  assert.equal(r.score, 15);
});

test("the score is capped at 100", () => {
  const r = scoreInvoice(
    clean({
      supplier: { name: "X", status: "pending", accountNumber: "1", bankChangedAt: null },
      invoice: { number: "INV-1", quantity: 10, unitPrice: 20000, total: 200000, accountNumber: "222222" },
      sameNumber: [{ ref: "AP-1", number: "INV-1" }],
      recentInvoiceCount: 4,
    })
  );
  assert.equal(r.score, 100);
  assert.equal(r.band, "high");
});

test("three-way match: billing goods that were never received is a mismatch", () => {
  const m = matchInvoice({ po: { quantity: 10, unitPrice: 12000 }, receivedQty: 0, invoice: { quantity: 10, unitPrice: 12000 } });
  assert.equal(m.ok, false);
  assert.match(m.issues[0]!, /no goods have been received/);
});

test("three-way match: a partial delivery billed for the same partial quantity is fine", () => {
  const m = matchInvoice({ po: { quantity: 10, unitPrice: 12000 }, receivedQty: 4, invoice: { quantity: 4, unitPrice: 12000 } });
  assert.equal(m.ok, true);
  assert.equal(m.variance, 0);
});
