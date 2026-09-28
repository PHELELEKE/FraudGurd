import { api, idParam, readJson } from "@/lib/http";
import { requireApi } from "@/lib/auth";
import { resolveAlert } from "@/lib/p2p";

export const POST = api(async (req, ctx) => resolveAlert(await requireApi(), await idParam(ctx), await readJson(req)));
