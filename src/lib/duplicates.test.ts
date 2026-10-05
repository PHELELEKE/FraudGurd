import { test } from "node:test";
import assert from "node:assert/strict";
import { findDuplicates } from "./duplicates";

type RequestLike = { id: number; ref: string; item: string; company: string; requester: string };

function req(overrides: Partial<RequestLike> = {}): RequestLike {
  return {
    id: 1,
    ref: "PR-0001",
    item: "Laptop",
    company: "small_civils",
    requester: "Thandi",
    ...overrides,
  };
}

test("same item with different case and spaces matches", () => {
  const target = req({ id: 1, ref: "PR-0001", item: " 10 x Laptops " });
  const candidates = [
    req({ id: 2, ref: "PR-0002", item: "10 x laptops", company: "vz_coatings", requester: "Mpho" }),
    req({ id: 3, ref: "PR-0003", item: "Monitor", company: "small_civils", requester: "Sindi" }),
  ];

  assert.deepEqual(findDuplicates(target, candidates).map((r) => r.ref), ["PR-0002"]);
});

test("different item does not match", () => {
  const target = req({ id: 1, ref: "PR-0001", item: "Laptop" });
  const candidates = [req({ id: 2, ref: "PR-0002", item: "Laptop stand", company: "small_civils", requester: "Sindi" })];

  assert.deepEqual(findDuplicates(target, candidates), []);
});

test("same company duplicates are treated as duplicates too", () => {
  const target = req({ id: 4, ref: "PR-0004", item: "Office chair" });
  const candidates = [
    req({ id: 5, ref: "PR-0005", item: " office chair ", company: "small_civils", requester: "Kagiso" }),
    req({ id: 6, ref: "PR-0006", item: "Notebook", company: "small_civils", requester: "Sindi" }),
  ];

  assert.deepEqual(findDuplicates(target, candidates).map((r) => r.ref), ["PR-0005"]);
});

test("self is excluded from candidates", () => {
  const target = req({ id: 10, ref: "PR-0010", item: "Ink cartridges" });
  const candidates = [
    req({ id: 10, ref: "PR-0010", item: "Ink cartridges", requester: "Thandi" }),
    req({ id: 11, ref: "PR-0011", item: "ink cartridges", company: "vz_coatings", requester: "Mpho" }),
  ];

  assert.deepEqual(findDuplicates(target, candidates).map((r) => r.ref), ["PR-0011"]);
});
