import { api } from "@/lib/http";
import { requireApi } from "@/lib/auth";
import { getTasks } from "@/lib/attention";

export const dynamic = "force-dynamic";

export const GET = api(async () => {
  const user = await requireApi();
  return { tasks: await getTasks(user) };
});
