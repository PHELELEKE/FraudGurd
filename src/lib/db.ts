import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

// Return numbers as JS numbers, and plain dates ("2026-09-15") as strings.
types.setTypeParser(1700, (v) => parseFloat(v)); // numeric
types.setTypeParser(20, (v) => parseInt(v, 10)); // bigint
types.setTypeParser(1082, (v) => v); // date

declare global {
  // eslint-disable-next-line no-var
  var __fraudguardPool: Pool | undefined;
}

/**
 * Neon connection strings end in "?sslmode=require&channel_binding=require".
 * The driver would print a security warning for that, so we read the SSL choice ourselves:
 * encrypted and certificate-checked everywhere except a database running on your own machine.
 */
function poolConfig(raw: string): { connectionString: string; ssl: false | { rejectUnauthorized: boolean } } {
  try {
    const u = new URL(raw);
    const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname);
    const sslOff = local || u.searchParams.get("sslmode") === "disable";
    u.searchParams.delete("sslmode");
    u.searchParams.delete("channel_binding");
    return { connectionString: u.toString(), ssl: sslOff ? false : { rejectUnauthorized: true } };
  } catch {
    return { connectionString: raw, ssl: false };
  }
}

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and paste your Neon connection string."
    );
  }
  const pool = new Pool({
    ...poolConfig(url),
    max: 5,
    // Neon suspends idle databases; drop idle connections quickly so we never reuse a dead one.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 20_000,
  });
  pool.on("error", (err) => console.error("Idle database client error:", err.message));
  return pool;
}

export function pool(): Pool {
  return (globalThis.__fraudguardPool ??= createPool());
}

export async function query<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(text, params);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* connection already gone */
    }
    throw err;
  } finally {
    client.release();
  }
}
