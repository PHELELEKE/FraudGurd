import { api, readJson } from "@/lib/http";
import { cleanEmail, FORGOT_MESSAGE, startPasswordReset } from "@/lib/people";
import { baseUrl, clientIp, rateLimit } from "@/lib/ratelimit";

/** Public. Always answers the same way, so it cannot be used to find out which emails have accounts. */
export const POST = api(async (req) => {
  const email = cleanEmail((await readJson(req)).email);
  rateLimit(`forgot-ip:${clientIp(req)}`, 30, 60 * 60 * 1000);
  rateLimit(`forgot-email:${email}`, 5, 60 * 60 * 1000);
  const { demoLink } = await startPasswordReset(email, baseUrl(req));
  return { message: FORGOT_MESSAGE, demoLink };
});
