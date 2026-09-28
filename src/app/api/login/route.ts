import bcrypt from "bcryptjs";
import { api, HttpError, readJson } from "@/lib/http";
import { queryOne } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { homeFor, type Role } from "@/lib/roles";

// A real hash of a throwaway string, so unknown emails take as long to reject as wrong passwords.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

// Very small in-memory limiter: 8 failed attempts per email per 10 minutes.
const failures = new Map<string, { count: number; first: number }>();
const WINDOW = 10 * 60 * 1000;
const MAX_FAILS = 8;

export const POST = api(async (req) => {
  const body = await readJson(req);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) throw new HttpError(400, "Enter your email and password.");

  const f = failures.get(email);
  if (f && Date.now() - f.first < WINDOW && f.count >= MAX_FAILS) {
    throw new HttpError(429, "Too many failed attempts. Wait a few minutes and try again.");
  }

  const user = await queryOne<{ id: number; password_hash: string; role: Role }>(
    "select id, password_hash, role from users where lower(email) = $1",
    [email]
  );
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) {
    const now = Date.now();
    const cur = f && now - f.first < WINDOW ? f : { count: 0, first: now };
    failures.set(email, { count: cur.count + 1, first: cur.first });
    throw new HttpError(401, "That email and password do not match.");
  }
  failures.delete(email);
  await createSession(user.id);
  return { home: homeFor(user.role) };
});
