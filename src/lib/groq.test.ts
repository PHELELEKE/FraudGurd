import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestSemanticDuplicateIds, type SimilarityCandidate } from "./groq";

const candidates: SimilarityCandidate[] = [
  { id: 31, item: "Laptop computers", category: "IT Equipment", quantity: 5 },
  { id: 32, item: "Desk chairs", category: "Furniture", quantity: 2 },
];

test("semantic duplicate suggestions are disabled when no Groq key is configured", async () => {
  let called = false;
  process.env.GROQ_DUPLICATE_CHECK = "true";
  const result = await suggestSemanticDuplicateIds(
    { item: "5 laptops", category: "IT Equipment", quantity: 5 },
    candidates,
    { apiKey: "", fetcher: async () => { called = true; throw new Error("should not call Groq"); } }
  );

  assert.deepEqual(result, []);
  assert.equal(called, false);
});

test("semantic duplicate suggestions require explicit opt-in", async () => {
  const previous = process.env.GROQ_DUPLICATE_CHECK;
  process.env.GROQ_DUPLICATE_CHECK = "false";
  let called = false;
  try {
    const result = await suggestSemanticDuplicateIds(
      { item: "5 laptops", category: "IT Equipment", quantity: 5 },
      candidates,
      { apiKey: "test-key", fetcher: async () => { called = true; throw new Error("should not call Groq"); } }
    );
    assert.deepEqual(result, []);
    assert.equal(called, false);
  } finally {
    if (previous === undefined) delete process.env.GROQ_DUPLICATE_CHECK;
    else process.env.GROQ_DUPLICATE_CHECK = previous;
  }
});

test("semantic duplicate suggestions map only valid candidate indexes", async () => {
  process.env.GROQ_DUPLICATE_CHECK = "true";
  let sentBody = "";
  const fetcher: typeof fetch = async (_input, init) => {
    sentBody = String(init?.body ?? "");
    return Response.json({
      choices: [{ message: { content: JSON.stringify({ matches: [{ candidate_index: 0 }, { candidate_index: 0 }, { candidate_index: 20 }, { candidate_index: 1.5 }] }) } }],
    });
  };

  const result = await suggestSemanticDuplicateIds(
    { item: "5 laptops", category: "IT Equipment", quantity: 5 },
    candidates,
    { apiKey: "test-key", fetcher }
  );

  assert.deepEqual(result, [31]);
  assert.equal(sentBody.includes("pending_requests"), true);
  assert.equal(sentBody.includes("requester"), false);
  assert.equal(sentBody.includes("company"), false);
});

test("Groq errors and malformed results safely return no suggestions", async () => {
  process.env.GROQ_DUPLICATE_CHECK = "true";
  const errors: typeof fetch = async () => new Response("unavailable", { status: 503 });
  const malformed: typeof fetch = async () => Response.json({ choices: [{ message: { content: "not json" } }] });
  const target = { item: "laptop X5", category: "IT Equipment", quantity: 1 };

  assert.deepEqual(await suggestSemanticDuplicateIds(target, candidates, { apiKey: "test-key", fetcher: errors }), []);
  assert.deepEqual(await suggestSemanticDuplicateIds(target, candidates, { apiKey: "test-key", fetcher: malformed }), []);
});