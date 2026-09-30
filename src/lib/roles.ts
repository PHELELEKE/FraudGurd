export const ROLES = ["employee", "manager", "procurement", "accountant", "finance_manager", "auditor"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  employee: "Employee",
  manager: "Manager",
  procurement: "Procurement Officer",
  accountant: "Accountant",
  finance_manager: "Finance Manager",
  auditor: "Auditor",
};

/** Every action in the system that needs a role check. */
export type Perm =
  | "request.create"
  | "request.decide"
  | "order.create"
  | "goods.receive"
  | "supplier.create"
  | "supplier.updateBank"
  | "supplier.verify"
  | "invoice.capture"
  | "invoice.pay"
  | "alert.decide"
  | "user.create"
  | "user.reset";

const PERMS: Record<Perm, readonly Role[]> = {
  "request.create": ["employee", "manager"],
  "request.decide": ["manager", "finance_manager"],
  "order.create": ["procurement"],
  "goods.receive": ["procurement"],
  "supplier.create": ["procurement"],
  "supplier.updateBank": ["procurement"],
  "supplier.verify": ["finance_manager"],
  "invoice.capture": ["accountant"],
  "invoice.pay": ["accountant"],
  "alert.decide": ["finance_manager"],
  "user.create": ["manager"],
  "user.reset": ["manager", "finance_manager"],
};

export function can(role: Role, perm: Perm): boolean {
  return PERMS[perm].includes(role);
}

export interface NavItem {
  href: string;
  label: string;
}

/** Each role gets its own colour. Used in the top bar, buttons and the login page. Flat, solid colours only. */
export const ROLE_COLOR: Record<Role, string> = {
  employee: "#2EC4B6",
  manager: "#A78BFA",
  procurement: "#FB923C",
  accountant: "#F472B6",
  finance_manager: "#4C8DFF",
  auditor: "#CBD5E1",
};

/** The navigation bar only shows what that role actually works with. */
export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  employee: [{ href: "/requests", label: "My requests" }],
  manager: [
    { href: "/requests", label: "Requests to approve" },
    { href: "/users", label: "Users" },
  ],
  procurement: [
    { href: "/orders", label: "Orders" },
    { href: "/suppliers", label: "Suppliers" },
  ],
  accountant: [
    { href: "/invoices", label: "Invoices and payments" },
    { href: "/journal", label: "Journal" },
  ],
  finance_manager: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/alerts", label: "Alerts" },
    { href: "/requests", label: "Requests" },
    { href: "/suppliers", label: "Suppliers" },
    { href: "/audit", label: "Audit trail" },
    { href: "/users", label: "Users" },
  ],
  auditor: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/alerts", label: "Alerts" },
    { href: "/invoices", label: "Invoices" },
    { href: "/journal", label: "Journal" },
    { href: "/audit", label: "Audit trail" },
  ],
};

/** Which roles may open which pages (a page can be allowed without being in the nav bar). */
const ACCESS: [string, readonly Role[]][] = [
  ["/dashboard", ["finance_manager", "auditor"]],
  ["/alerts", ["accountant", "finance_manager", "auditor"]],
  ["/requests", ["employee", "manager", "finance_manager", "auditor"]],
  ["/orders", ["procurement", "finance_manager", "auditor"]],
  ["/suppliers", ["procurement", "finance_manager", "auditor"]],
  ["/invoices", ["accountant", "finance_manager", "auditor"]],
  ["/journal", ["accountant", "finance_manager", "auditor"]],
  ["/audit", ["finance_manager", "auditor"]],
  ["/users", ["manager", "finance_manager"]],
];

/** Only these roles can change their own password. Everyone else asks the Manager to reset it. */
export const SELF_SERVICE_ROLES: readonly Role[] = ["employee", "manager"];

export function canChangeOwnPassword(role: Role): boolean {
  return SELF_SERVICE_ROLES.includes(role);
}

export function homeFor(role: Role): string {
  return NAV_BY_ROLE[role][0]!.href;
}

export function canView(role: Role, href: string): boolean {
  const path = href.split("?")[0]!;
  const hit = ACCESS.filter(([p]) => path === p || path.startsWith(p + "/")).sort((a, b) => b[0].length - a[0].length)[0];
  return hit ? hit[1].includes(role) : true;
}
