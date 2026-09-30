import { api, readJson } from "@/lib/http";
import { createSession } from "@/lib/auth";
import { registerEmployee } from "@/lib/people";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { homeFor } from "@/lib/roles";

/** Public. Only ever creates an Employee account. Every other role is created by the Manager. */
export const POST = api(async (req) => {
  rateLimit(`register:${clientIp(req)}`, 30, 60 * 60 * 1000);
  const { id } = await registerEmployee(await readJson(req));
  await createSession(id);
  return { home: homeFor("employee") };
});
