import { HttpError } from "./http";
import { COMPANIES, type Company } from "./companies";
import { round2 } from "./money";

export function str(v: unknown, label: string, max = 200): string {
  if (typeof v !== "string" || !v.trim()) throw new HttpError(400, `${label} is required.`);
  const s = v.trim();
  if (s.length > max) throw new HttpError(400, `${label} is too long (maximum ${max} characters).`);
  return s;
}

export function int(v: unknown, label: string, min = 1, max = 1_000_000): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${label} must be a whole number between ${min} and ${max}.`);
  }
  return n;
}

export function money(v: unknown, label: string, max = 100_000_000): number {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > max) {
    throw new HttpError(400, `${label} must be an amount greater than 0.`);
  }
  return round2(n);
}

export function date(v: unknown, label: string): string {
  const s = str(v, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s + "T00:00:00Z"))) {
    throw new HttpError(400, `${label} must be a valid date (YYYY-MM-DD).`);
  }
  return s;
}

export function oneOf<T extends string>(v: unknown, label: string, allowed: readonly T[]): T {
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    throw new HttpError(400, `${label} must be one of: ${allowed.join(", ")}.`);
  }
  return v as T;
}

export function accountNumber(v: unknown): string {
  const s = str(v, "Account number", 20).replace(/\s+/g, "");
  if (!/^\d{6,16}$/.test(s)) throw new HttpError(400, "Account number must be 6 to 16 digits.");
  return s;
}

export function branchCode(v: unknown): string {
  const s = str(v, "Branch code", 10).replace(/\s+/g, "");
  if (!/^\d{5,6}$/.test(s)) throw new HttpError(400, "Branch code must be 5 or 6 digits.");
  return s;
}

export interface BankDetails {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  branchCode: string;
}

export function bank(body: Record<string, unknown>): BankDetails {
  return {
    bankName: str(body.bankName, "Bank name", 80),
    accountHolder: str(body.accountHolder, "Account holder", 120),
    accountNumber: accountNumber(body.accountNumber),
    branchCode: branchCode(body.branchCode),
  };
}

export function company(v: unknown, label = "Company"): Company {
  if (typeof v !== "string" || !(COMPANIES as readonly string[]).includes(v)) {
    throw new HttpError(400, `${label} must be Small Civils or VZ Coatings.`);
  }
  return v as Company;
}
