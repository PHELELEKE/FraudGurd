import { api, readJson } from "@/lib/http";
import { requireApi } from "@/lib/auth";
import { createUser } from "@/lib/people";

export const POST = api(async (req) => createUser(await requireApi("user.create"), await readJson(req)));
