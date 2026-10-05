export interface SimilarityRequest {
  item: string;
  category: string;
  quantity: number;
}

export interface SimilarityCandidate extends SimilarityRequest {
  id: number;
}

interface GroqOptions {
  apiKey?: string;
  model?: string;
  fetcher?: typeof fetch;
}

function parseCandidateIndexes(content: unknown, candidateCount: number): number[] {
  if (typeof content !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== "object" || !("matches" in parsed) || !Array.isArray(parsed.matches)) return [];
    const indexes = parsed.matches
      .map((match) => (match && typeof match === "object" && "candidate_index" in match ? match.candidate_index : null))
      .filter((index): index is number => typeof index === "number" && Number.isInteger(index) && index >= 0 && index < candidateCount);
    return [...new Set(indexes)].slice(0, 5);
  } catch {
    return [];
  }
}

export async function suggestSemanticDuplicateIds(
  target: SimilarityRequest,
  candidates: SimilarityCandidate[],
  options: GroqOptions = {}
): Promise<number[]> {
  const apiKey = options.apiKey ?? process.env.GROQ_API_KEY;
  if (process.env.GROQ_DUPLICATE_CHECK !== "true" || !apiKey || candidates.length === 0) return [];

  try {
    const response = await (options.fetcher ?? fetch)("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        model: options.model ?? process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Identify pending requests that may describe the same real-world item as the new request. Consider equivalent wording, word order, plurals, and common abbreviations. Category is context, not proof; quantity does not need to match. Treat model-like text such as "X5" cautiously because it may be a model name. Return only JSON in this format: {"matches":[{"candidate_index":0}]}. Use zero-based indexes from pending_requests, include only credible possible matches, and return an empty matches array when none fit.',
          },
          {
            role: "user",
            content: JSON.stringify({
              new_request: target,
              pending_requests: candidates.slice(0, 20).map(({ item, category, quantity }) => ({ item, category, quantity })),
            }),
          },
        ],
      }),
    });
    if (!response.ok) return [];

    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("choices" in payload) || !Array.isArray(payload.choices)) return [];
    const first = payload.choices[0];
    if (!first || typeof first !== "object" || !("message" in first) || !first.message || typeof first.message !== "object" || !("content" in first.message)) return [];
    return parseCandidateIndexes(first.message.content, Math.min(candidates.length, 20)).map((index) => candidates[index]!.id);
  } catch {
    return [];
  }
}