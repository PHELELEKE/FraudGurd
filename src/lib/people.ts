import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { query, queryOne, withTx } from "./db";
import { HttpError } from "./http";
import { canChangeOwnPassword, can, ROLES, ROLE_LABEL, SELF_SERVICE_ROLES, type Role } from "./roles";
import { DEPARTMENTS } from "./queries";
import { mailConfigured, sendMail } from "./mailer";
import * as v from "./validate";
import type { SessionUser } from "./auth";

type Body = Record<string, unknown>;

const RESET_MINUTES = 30;
/** Roles a Manager can create. Managers themselves are not created from inside the system. */
export const CREATABLE_ROLES = ROLES.filter((r) => r !== "manager");

/* ---------- checks shared by every form ---------- */

export function cleanEmail(x: unknown): string {
  const s = v.str(x, "Email", 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) throw new HttpError(400, "Enter a valid email address.");
  return s;
}

export function cleanPhone(x: unknown, optional = false): string | null {
  if (optional && (typeof x !== "string" || !x.trim())) return null;
  const s = v.str(x, "Phone number", 30).replace(/[\s\-().]/g, "");
  if (!/^\+?\d{9,15}$/.test(s)) throw new HttpError(400, "Enter a valid phone number, for example 082 123 4567.");
  return s;
}

export function cleanPassword(x: unknown, label = "Password"): string {
  if (typeof x !== "string" || !x) throw new HttpError(400, `${label} is required.`);
  if (x.length < 8) throw new HttpError(400, `${label} must be at least 8 characters.`);
  if (x.length > 72) throw new HttpError(400, `${label} must be 72 characters or fewer.`);
  if (!/[A-Za-z]/.test(x) || !/\d/.test(x)) throw new HttpError(400, `${label} must contain at least one letter and one number.`);
  return x;
}

function sameAs(a: unknown, b: unknown) {
  if (a !== b) throw new HttpError(400, "The two passwords do not match.");
}

async function audit(c: PoolClient, who: { id: number | null; name: string; role: string }, action: string, ref: string | null, details: Body = {}) {
  await c.query(
    `insert into audit_log (user_id, user_name, user_role, action, entity, entity_ref, details)
     values ($1, $2, $3, $4, 'user', $5, $6)`,
    [who.id, who.name, who.role, action, ref, JSON.stringify(details)]
  );
}

function uniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

/* ---------- 1. Employees register themselves ---------- */

export async function registerEmployee(body: Body): Promise<{ id: number }> {
  const code = process.env.SIGNUP_CODE;
  if (code && String(body.signupCode ?? "").trim() !== code) {
    throw new HttpError(403, "The signup code is not correct. Ask your Manager for it.");
  }
  const name = v.str(body.name, "Full name", 80);
  if (name.length < 2) throw new HttpError(400, "Enter your full name.");
  const email = cleanEmail(body.email);
  const phone = cleanPhone(body.phone);
  const department = v.oneOf(body.department, "Department", DEPARTMENTS);
  const password = cleanPassword(body.password);
  sameAs(body.confirm, body.password);
  const hash = await bcrypt.hash(password, 10);

  try {
    return await withTx(async (c) => {
      const taken = await c.query("select 1 from users where lower(email) = $1", [email]);
      if (taken.rowCount) throw new HttpError(409, "An account with this email already exists. Sign in, or use Forgot password.");
      const { rows } = await c.query(
        `insert into users (name, email, phone, password_hash, role, department, password_changed_at)
         values ($1, $2, $3, $4, 'employee', $5, now()) returning id`,
        [name, email, phone, hash, department]
      );
      const id = rows[0].id as number;
      await audit(c, { id, name, role: "employee" }, "user.registered", email, { department });
      return { id };
    });
  } catch (err) {
    if (uniqueViolation(err)) throw new HttpError(409, "An account with this email already exists. Sign in, or use Forgot password.");
    throw err;
  }
}

/* ---------- 2. The Manager creates every other kind of user ---------- */

export async function createUser(actor: SessionUser, body: Body) {
  if (!can(actor.role, "user.create")) throw new HttpError(403, `Your role (${ROLE_LABEL[actor.role]}) is not allowed to do this.`);
  const name = v.str(body.name, "Full name", 80);
  const email = cleanEmail(body.email);
  const phone = cleanPhone(body.phone, true);
  const role = v.oneOf(body.role, "Role", CREATABLE_ROLES);
  const department = v.oneOf(body.department, "Department", DEPARTMENTS);
  const password = cleanPassword(body.password, "Starting password");
  const hash = await bcrypt.hash(password, 10);
  // Employees and managers can change their own password, so they are asked to do it at first sign-in.
  const mustChange = SELF_SERVICE_ROLES.includes(role);

  try {
    await withTx(async (c) => {
      const taken = await c.query("select 1 from users where lower(email) = $1", [email]);
      if (taken.rowCount) throw new HttpError(409, "Someone already has an account with that email.");
      await c.query(
        `insert into users (name, email, phone, password_hash, role, department, must_change_password, password_changed_at)
         values ($1, $2, $3, $4, $5, $6, $7, now())`,
        [name, email, phone, hash, role, department, mustChange]
      );
      await audit(c, actor, "user.created", email, { name, role: ROLE_LABEL[role], department });
    });
  } catch (err) {
    if (uniqueViolation(err)) throw new HttpError(409, "Someone already has an account with that email.");
    throw err;
  }
  return { ok: true, mustChange };
}

export async function listUsers(actor: SessionUser) {
  const onlyManagers = actor.role !== "manager";
  return query<{ id: number; name: string; email: string; phone: string | null; role: Role; department: string; created_at: Date }>(
    `select id, name, email, phone, role, department, created_at from users
     ${onlyManagers ? "where role = 'manager'" : ""}
     order by array_position(array['manager','finance_manager','procurement','accountant','auditor','employee'], role), name`
  );
}

/* ---------- 3. The Manager resets someone's password (the Finance Manager resets the Manager's) ---------- */

export async function resetPasswordFor(actor: SessionUser, targetId: number, body: Body) {
  if (!can(actor.role, "user.reset")) throw new HttpError(403, `Your role (${ROLE_LABEL[actor.role]}) is not allowed to do this.`);
  const password = cleanPassword(body.password, "New password");
  const target = await queryOne<{ id: number; name: string; email: string; role: Role }>(
    "select id, name, email, role from users where id = $1",
    [targetId]
  );
  if (!target) throw new HttpError(404, "That user no longer exists.");
  if (actor.role === "manager") {
    if (target.id === actor.id) throw new HttpError(403, "Change your own password on the Account page.");
    if (target.role === "manager") throw new HttpError(403, "A Manager's password is reset by the Finance Manager.");
  } else if (target.role !== "manager") {
    throw new HttpError(403, "The Finance Manager only resets the Manager's password. Ask the Manager to reset this one.");
  }
  const hash = await bcrypt.hash(password, 10);
  const mustChange = canChangeOwnPassword(target.role);

  await withTx(async (c) => {
    await c.query(
      "update users set password_hash = $1, password_changed_at = now(), must_change_password = $2 where id = $3",
      [hash, mustChange, target.id]
    );
    await c.query("update password_resets set used_at = now() where user_id = $1 and used_at is null", [target.id]);
    await audit(c, actor, "user.password_reset", target.email, { name: target.name, role: ROLE_LABEL[target.role] });
  });
  return { ok: true, name: target.name, mustChange };
}

/* ---------- 4. Employees and the Manager change their own password while signed in ---------- */

export async function changeOwnPassword(user: SessionUser, body: Body) {
  if (!canChangeOwnPassword(user.role)) {
    throw new HttpError(403, "Passwords for your role are reset by the Manager. Contact them to get a new one.");
  }
  const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
  if (!current) throw new HttpError(400, "Enter your current password.");
  const next = cleanPassword(body.newPassword, "New password");
  sameAs(body.confirm, body.newPassword);
  if (next === current) throw new HttpError(400, "Choose a password that is different from your current one.");

  const row = await queryOne<{ password_hash: string }>("select password_hash from users where id = $1", [user.id]);
  if (!row || !(await bcrypt.compare(current, row.password_hash))) throw new HttpError(400, "Your current password is not correct.");
  const hash = await bcrypt.hash(next, 10);

  await withTx(async (c) => {
    await c.query("update users set password_hash = $1, password_changed_at = now(), must_change_password = false where id = $2", [hash, user.id]);
    await audit(c, user, "password.changed", user.email);
  });
  return { ok: true };
}

/* ---------- 5. Forgot password, from outside the system (employees only) ---------- */

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export const FORGOT_MESSAGE =
  "If that email belongs to an employee account, a reset link is on its way. Other roles: ask your Manager to reset your password.";

export async function startPasswordReset(email: string, base: string): Promise<{ demoLink?: string }> {
  const user = await queryOne<{ id: number; name: string; role: Role }>(
    "select id, name, role from users where lower(email) = $1",
    [email]
  );
  if (!user || user.role !== "employee") return {};

  const token = crypto.randomBytes(32).toString("hex");
  await withTx(async (c) => {
    await c.query("update password_resets set used_at = now() where user_id = $1 and used_at is null", [user.id]);
    await c.query(
      `insert into password_resets (user_id, token_hash, expires_at) values ($1, $2, now() + ($3 || ' minutes')::interval)`,
      [user.id, sha(token), String(RESET_MINUTES)]
    );
    await audit(c, { id: user.id, name: user.name, role: user.role }, "password.reset_requested", email);
  });

  const link = `${base}/reset-password?token=${token}`;
  if (mailConfigured()) {
    try {
      await sendMail({
        to: email,
        subject: "Reset your FraudGuard password",
        text: `Hi ${user.name.split(" ")[0]},\n\nUse this link to choose a new password. It works once and expires in ${RESET_MINUTES} minutes:\n${link}\n\nIf you did not ask for this, ignore this email. Your password has not changed.`,
        html: `<p>Hi ${escapeHtml(user.name.split(" ")[0] ?? "")},</p><p>Use this link to choose a new password. It works once and expires in ${RESET_MINUTES} minutes:</p><p><a href="${link}">Choose a new password</a></p><p>If you did not ask for this, ignore this email. Your password has not changed.</p>`,
      });
    } catch (err) {
      console.error("Could not send the reset email:", err instanceof Error ? err.message : err);
    }
    return {};
  }
  if (process.env.DEMO_MODE !== "false") return { demoLink: link };
  console.warn("Password reset asked for, but no email service is set up (BREVO_API_KEY or RESEND_API_KEY).");
  return {};
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

async function findValidReset(token: string) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  return queryOne<{ id: number; user_id: number; role: Role; name: string; email: string }>(
    `select r.id, r.user_id, u.role, u.name, u.email from password_resets r join users u on u.id = r.user_id
     where r.token_hash = $1 and r.used_at is null and r.expires_at > now()`,
    [sha(token)]
  );
}

export async function resetLinkIsValid(token: string): Promise<boolean> {
  const r = await findValidReset(token);
  return Boolean(r && r.role === "employee");
}

export async function completePasswordReset(body: Body) {
  const token = typeof body.token === "string" ? body.token : "";
  const password = cleanPassword(body.password, "New password");
  sameAs(body.confirm, body.password);
  const reset = await findValidReset(token);
  if (!reset || reset.role !== "employee") throw new HttpError(400, "This reset link is invalid or has expired. Ask for a new one.");
  const hash = await bcrypt.hash(password, 10);
  await withTx(async (c) => {
    await c.query("update users set password_hash = $1, password_changed_at = now(), must_change_password = false where id = $2", [hash, reset.user_id]);
    await c.query("update password_resets set used_at = now() where user_id = $1 and used_at is null", [reset.user_id]);
    await audit(c, { id: reset.user_id, name: reset.name, role: reset.role }, "password.reset_with_link", reset.email);
  });
  return { ok: true };
}
