import { api, readJson } from "@/lib/http";
import { requireApi } from "@/lib/auth";
import { captureInvoice } from "@/lib/p2p";

export const POST = api(async (req) => captureInvoice(await requireApi(), await readJson(req)));
