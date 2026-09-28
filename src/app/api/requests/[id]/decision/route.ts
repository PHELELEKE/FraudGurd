import { api, idParam, readJson } from "@/lib/http";
import { requireApi } from "@/lib/auth";
import { decideRequest } from "@/lib/p2p";

export const POST = api(async (req, ctx) => decideRequest(await requireApi(), await idParam(ctx), await readJson(req)));
