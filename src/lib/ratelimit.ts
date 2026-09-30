import { HttpError } from "./http";

// Small in-memory limiter, the same idea as the one on the login route. It is a speed bump, not a wall:
// each server instance keeps its own counts.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    throw new HttpError(429, "Too many attempts. Wait a while and try again.");
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
}

export function clientIp(req: Request): string {
  const h = req.headers;
  return h.get("x-nf-client-connection-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** The public address of the site, used to build the link in a reset email. Set APP_URL to pin it. */
export function baseUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const host = req.headers.get("host") ?? new URL(req.url).host;
  const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  return `${local ? "http" : "https"}://${host}`;
}
