const TZ = "Africa/Johannesburg";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function rand(n: number): string {
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}R${s}`;
}

export function randCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `R${Math.round(n / 1000)}k`;
  return `R${Math.round(n).toLocaleString("en-US")}`;
}

function parts(d: Date): Record<string, string> {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const out: Record<string, string> = {};
  for (const p of f.formatToParts(d)) out[p.type] = p.value;
  return out;
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

/** "15 Sep 2026". Accepts a Date, an ISO timestamp, or a plain "YYYY-MM-DD" date. */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "-";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    return `${day} ${MONTHS[m - 1]} ${y}`;
  }
  const p = parts(toDate(d));
  return `${Number(p.day)} ${MONTHS[Number(p.month) - 1]} ${p.year}`;
}

export function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const p = parts(toDate(d));
  return `${p.hour}:${p.minute}`;
}

/** "15 Sep 2026, 14:32" */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "-";
  return `${fmtDate(d)}, ${fmtTime(d)}`;
}

export function todayIso(): string {
  const p = parts(new Date());
  return `${p.year}-${p.month.padStart(2, "0")}-${p.day.padStart(2, "0")}`;
}

export function maskAccount(n: string): string {
  return n.length <= 4 ? n : `•••• ${n.slice(-4)}`;
}

export function daysSince(d: Date | string): number {
  return Math.floor((Date.now() - toDate(d).getTime()) / 86_400_000);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
