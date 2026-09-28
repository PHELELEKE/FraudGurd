import { api, readJson } from "@/lib/http";
import { requireApi } from "@/lib/auth";
import { createOrder } from "@/lib/p2p";

export const POST = api(async (req) => createOrder(await requireApi(), await readJson(req)));
