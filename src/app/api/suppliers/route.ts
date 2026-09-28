import { api, readJson } from "@/lib/http";
import { requireApi } from "@/lib/auth";
import { createSupplier } from "@/lib/p2p";

export const POST = api(async (req) => createSupplier(await requireApi(), await readJson(req)));
