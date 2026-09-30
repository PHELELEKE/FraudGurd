import { api, readJson } from "@/lib/http";
import { completePasswordReset } from "@/lib/people";
import { clientIp, rateLimit } from "@/lib/ratelimit";

/** Public. Needs the one-time token from the reset link. */
export const POST = api(async (req) => {
  rateLimit(`reset:${clientIp(req)}`, 30, 60 * 60 * 1000);
  return completePasswordReset(await readJson(req));
});
