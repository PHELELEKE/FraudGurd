import { api, readJson } from "@/lib/http";
import { createSession, requireApi } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/people";
import { rateLimit } from "@/lib/ratelimit";

/** Signed-in Employees and Managers change their own password. Needs the current password. */
export const POST = api(async (req) => {
  const user = await requireApi();
  rateLimit(`own-password:${user.id}`, 10, 10 * 60 * 1000);
  const out = await changeOwnPassword(user, await readJson(req));
  await createSession(user.id); // the old session stops working when the password changes, so start a fresh one
  return out;
});
