import { ROLE_COLOR } from "./roles";

/** Demo accounts shown on the login page when DEMO_MODE is not "false". */
export const DEMO_PASSWORD = "Password123!";

export const DEMO_ACCOUNTS = [
  { email: "thandi@fraudguard.demo", name: "Thandi Mokoena", role: "Employee", color: ROLE_COLOR.employee },
  { email: "mpho@fraudguard.demo", name: "Mpho Dlamini", role: "Manager", color: ROLE_COLOR.manager },
  { email: "john@fraudguard.demo", name: "John Khumalo", role: "Procurement Officer", color: ROLE_COLOR.procurement },
  { email: "ayanda@fraudguard.demo", name: "Ayanda Zulu", role: "Accountant", color: ROLE_COLOR.accountant },
  { email: "naledi@fraudguard.demo", name: "Naledi Khumalo", role: "Finance Manager", color: ROLE_COLOR.finance_manager },
  { email: "pieter@fraudguard.demo", name: "Pieter van der Merwe", role: "Auditor", color: ROLE_COLOR.auditor },
] as const;
