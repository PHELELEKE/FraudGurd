import { api, idParam, readJson } from "@/lib/http";
import { requireApi } from "@/lib/auth";
import { resetPasswordFor } from "@/lib/people";

export const POST = api(async (req, ctx) => resetPasswordFor(await requireApi("user.reset"), await idParam(ctx), await readJson(req)));
