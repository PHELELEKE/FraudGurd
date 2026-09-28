import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { queryOne } from "./db";
import { HttpError } from "./http";
import { can, canView, homeFor, type Perm, type Role } from "./roles";

const COOKIE = "fg_session";
const MAX_AGE = 60 * 60 * 8; // 8 hours

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  department: string;
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET is not set. Add it to your environment variables.");
    }
    return new TextEncoder().encode("fraudguard-dev-secret-only-for-local-use");
  }
  return new TextEncoder().encode(s);
}

export async function createSession(userId: number): Promise<void> {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Reads the login cookie and loads the user fresh from the database, so role changes apply immediately. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const uid = Number(payload.uid);
    if (!Number.isInteger(uid)) return null;
    return await queryOne<SessionUser>("select id, name, email, role, department from users where id = $1", [uid]);
  } catch {
    return null;
  }
}

/** For pages: send to the login page if signed out, and to the user's home page if their role can't see this page. */
export async function requirePage(path: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canView(user.role, path)) redirect(homeFor(user.role));
  return user;
}

/** For API routes: throws 401 / 403 as JSON errors. */
export async function requireApi(perm?: Perm): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "You are signed out. Sign in again.");
  if (perm && !can(user.role, perm)) {
    throw new HttpError(403, "Your role is not allowed to do this.");
  }
  return user;
}
