/** What needs each person's attention right now. Powers the coloured badges, the task strip and the pop-up notices. */
import { queryOne } from "./db";
import type { Role } from "./roles";

export interface Task {
  key: string;
  /** The nav bar item this count belongs to (the badge shows on it). */
  navHref: string;
  /** Where the button takes you. */
  href: string;
  count: number;
  text: string;
  tone: "high" | "mid" | "accent";
  /** Counted in the nav badge. Informational tasks set this to false. */
  badge: boolean;
}

const COUNTS_SQL = `
select
  (select count(*)::int from alerts where status in ('open','escalated')) as alerts_active,
  (select count(*)::int from alerts where status = 'escalated') as alerts_escalated,
  (select count(*)::int from purchase_requests r join users u on u.id = r.requester_id
     where r.status = 'pending' and r.requester_id <> $1 and u.role = 'employee') as req_from_employees,
  (select count(*)::int from purchase_requests r join users u on u.id = r.requester_id
     where r.status = 'pending' and r.requester_id <> $1 and u.role <> 'employee') as req_from_managers,
  (select count(*)::int from purchase_requests where status = 'approved') as to_order,
  (select count(*)::int from purchase_orders po
     where coalesce((select sum(g.quantity) from goods_received g where g.po_id = po.id), 0) < po.quantity) as to_deliver,
  (select count(*)::int from invoices where status = 'approved') as to_pay,
  (select count(*)::int from purchase_orders po
     where po.status in ('issued','received')
       and exists (select 1 from goods_received g where g.po_id = po.id)
       and not exists (select 1 from invoices i where i.po_id = po.id and i.status <> 'rejected')) as to_invoice,
  (select count(*)::int from suppliers where status = 'pending') as unverified,
  (select count(*)::int from purchase_requests
     where requester_id = $1 and status in ('approved','rejected','ordered') and decided_at > now() - interval '3 days') as my_updates
`;

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export async function getTasks(user: { id: number; role: Role }): Promise<Task[]> {
  const c = await queryOne<Record<string, number>>(COUNTS_SQL, [user.id]);
  if (!c) return [];
  const tasks: Task[] = [];
  const add = (
    key: string,
    navHref: string,
    href: string,
    count: number,
    tone: Task["tone"],
    text: (count: number) => string,
    badge = true
  ) => {
    if (count > 0) tasks.push({ key, navHref, href, count, tone, text: text(count), badge });
  };

  switch (user.role) {
    case "employee":
      add("my_updates", "/requests", "/requests", c.my_updates!, "accent", (k) =>
        k === 1 ? "1 of your requests has an update" : `${k} of your requests have updates`
      );
      break;
    case "manager":
      add("req_from_employees", "/requests", "/requests", c.req_from_employees!, "mid", (k) =>
        `${n(k, "request", "requests")} waiting for your approval`
      );
      break;
    case "procurement":
      add("to_order", "/orders", "/orders", c.to_order!, "mid", (k) =>
        `${n(k, "approved request needs", "approved requests need")} a purchase order`
      );
      add("to_deliver", "/orders", "/orders", c.to_deliver!, "accent", (k) =>
        `${n(k, "order", "orders")} waiting for delivery`, false
      );
      break;
    case "accountant":
      add("to_pay", "/invoices", "/invoices", c.to_pay!, "mid", (k) => `${n(k, "invoice", "invoices")} ready to pay`);
      add("to_invoice", "/invoices", "/invoices", c.to_invoice!, "accent", (k) =>
        `${n(k, "delivered order", "delivered orders")} waiting for an invoice`
      );
      break;
    case "finance_manager":
      add("alerts_active", "/alerts", "/alerts", c.alerts_active!, "high", (k) =>
        `${n(k, "alert", "alerts")} held for review`
      );
      add("req_from_managers", "/requests", "/requests", c.req_from_managers!, "mid", (k) =>
        `${n(k, "manager request", "manager requests")} to approve`
      );
      add("unverified", "/suppliers", "/suppliers", c.unverified!, "mid", (k) =>
        `${n(k, "new supplier", "new suppliers")} to verify`
      );
      break;
    case "auditor":
      add("alerts_escalated", "/alerts", "/alerts", c.alerts_escalated!, "accent", (k) =>
        `${n(k, "escalated alert", "escalated alerts")} to look at`
      );
      break;
  }
  return tasks;
}
