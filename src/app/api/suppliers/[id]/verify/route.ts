import { api, idParam } from "@/lib/http";
import { requireApi } from "@/lib/auth";
import { verifySupplier } from "@/lib/p2p";

export const POST = api(async (_req, ctx) => verifySupplier(await requireApi(), await idParam(ctx)));
