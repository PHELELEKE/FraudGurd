export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

type Ctx = { params: Promise<Record<string, string>> };

/** Wraps an API route: turns thrown HttpErrors into clean JSON errors. */
export function api(fn: (req: Request, ctx: Ctx) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      const out = await fn(req, ctx);
      return Response.json(out ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      return Response.json(
        { error: "Something went wrong on the server. Check the terminal running the app for details." },
        { status: 500 }
      );
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object") return body as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new HttpError(400, "The request body must be valid JSON.");
}

export async function idParam(ctx: Ctx, name = "id"): Promise<number> {
  const params = await ctx.params;
  const n = Number(params[name]);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, "Invalid id in the URL.");
  return n;
}
