import { api, idParam, readJson } from "@/lib/http";
import { requireApi } from "@/lib/auth";
import { updateSupplierBank } from "@/lib/p2p";

export const POST = api(async (req, ctx) => updateSupplierBank(await requireApi(), await idParam(ctx), await readJson(req)));
