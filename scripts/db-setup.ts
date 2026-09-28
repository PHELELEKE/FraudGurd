import dotenv from "dotenv";
dotenv.config({ path: [".env.local", ".env"], quiet: true });

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pool, query, queryOne } from "../src/lib/db";
import { seedAll } from "./seed";

const TABLES = [
  "audit_log", "journal_lines", "journal_entries", "alerts", "invoices", "goods_received",
  "purchase_orders", "purchase_requests", "category_norms", "supplier_bank_history", "suppliers", "users",
];

async function main() {
  const reset = process.argv.includes("--reset");
  if (!process.env.DATABASE_URL) {
    console.error("\nDATABASE_URL is missing.\nCopy .env.example to .env.local and paste your Neon connection string, then run this again.\n");
    process.exit(1);
  }

  if (reset) {
    console.log("Dropping existing FraudGuard tables...");
    for (const t of TABLES) await query(`drop table if exists ${t} cascade`);
  }

  console.log("Creating tables...");
  await query(readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8"));

  const existing = await queryOne<{ n: number }>("select count(*)::int as n from users");
  if (existing && existing.n > 0) {
    console.log(`Database already has data (${existing.n} users), so nothing was seeded.`);
    console.log("Run \"npm run db:reset\" to wipe it and start again with fresh demo data.");
  } else {
    await seedAll();
  }
  console.log("\nDone. Start the app with: npm run dev");
}

main()
  .catch((err) => {
    console.error("\nSetup failed:", err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool().end());
