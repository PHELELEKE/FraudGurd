import { api, readJson } from "@/lib/http";
import { requireApi } from "@/lib/auth";
import { createRequest } from "@/lib/p2p";

export const POST = api(async (req) => createRequest(await requireApi(), await readJson(req)));
