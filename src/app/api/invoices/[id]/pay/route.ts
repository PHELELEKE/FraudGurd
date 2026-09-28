import { api, idParam } from "@/lib/http";
import { requireApi } from "@/lib/auth";
import { payInvoice } from "@/lib/p2p";

export const POST = api(async (_req, ctx) => payInvoice(await requireApi(), await idParam(ctx)));
