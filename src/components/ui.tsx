import type { ReactNode } from "react";
import { rand } from "@/lib/format";
import { splitVat, addVat } from "@/lib/money";
import { COMPANY_LABEL, COMPANY_COLOR, type Company } from "@/lib/companies";

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
  flush = false,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** No inner padding, for tables. */
  flush?: boolean;
}) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
          <div>
            {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[14px] text-mute">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={flush ? "" : `px-6 pb-6 ${title || action ? "" : "pt-6"}`}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex gap-4">
        <span className="mt-1 w-1 shrink-0 self-stretch rounded-full" style={{ background: "var(--role, var(--color-accent))" }} />
        <div>
          <h1 className="text-[28px] leading-9 font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-mute">{subtitle}</p>}
        </div>
      </div>
      {actions}
    </div>
  );
}

type Tone = "low" | "mid" | "high" | "accent" | "neutral";

export function Tag({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

const BAND_TONE: Record<string, Tone> = { low: "low", medium: "mid", high: "high" };
const BAND_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

export function RiskTag({ score, band }: { score: number; band: string }) {
  return (
    <Tag tone={BAND_TONE[band] ?? "neutral"}>
      <span className="num">{score}</span>&nbsp;{BAND_LABEL[band] ?? band}
    </Tag>
  );
}

const STATUS: Record<string, { tone: Tone; label: string }> = {
  pending: { tone: "mid", label: "Pending" },
  approved: { tone: "low", label: "Approved" },
  rejected: { tone: "high", label: "Rejected" },
  ordered: { tone: "accent", label: "Ordered" },
  issued: { tone: "accent", label: "Issued" },
  received: { tone: "low", label: "Received" },
  invoiced: { tone: "accent", label: "Invoiced" },
  paid: { tone: "low", label: "Paid" },
  held: { tone: "high", label: "Payment held" },
  open: { tone: "mid", label: "Needs review" },
  escalated: { tone: "accent", label: "Escalated" },
  cleared: { tone: "low", label: "Cleared" },
};

export function StatusTag({ status, label }: { status: string; label?: string }) {
  const s = STATUS[status] ?? { tone: "neutral" as Tone, label: status };
  return <Tag tone={s.tone}>{label ?? s.label}</Tag>;
}

export function Amount({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`num ${className}`}>{rand(value)}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-mute">{children}</p>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[13px] text-mute">{hint}</span>}
    </label>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2L4 5V11.5C4 16.5 7.5 21 12 22C16.5 21 20 16.5 20 11.5V5L12 2Z" fill="#4C8DFF" />
      <path d="M10 11.5L11.5 13L14.5 9.5" stroke="#14161A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A neutral chip with a coloured dot and the full company name, so it never reads as a risk or status tag. */
export function CompanyTag({ company }: { company: Company }) {
  return (
    <span className="company-tag">
      <span className="company-dot" style={{ background: COMPANY_COLOR[company] }} />
      {COMPANY_LABEL[company]}
    </span>
  );
}

/** Shows a VAT-inclusive total, with the VAT portion of it spelled out underneath in muted text. */
export function AmountVat({ value, className = "" }: { value: number; className?: string }) {
  const { vat } = splitVat(value);
  return (
    <span className={className}>
      <span className="num block">{rand(value)}</span>
      <span className="num block text-[13px] font-normal text-mute">incl. VAT {rand(vat)}</span>
    </span>
  );
}

/** For an amount someone quoted excluding VAT: shows it, then what VAT adds and the total including it. */
export function AmountExclVat({ value, className = "" }: { value: number; className?: string }) {
  const { vat, total } = addVat(value);
  return (
    <span className={className}>
      <span className="num block">{rand(value)}</span>
      <span className="num block text-[13px] font-normal text-mute">
        + VAT {rand(vat)} = {rand(total)} incl.
      </span>
    </span>
  );
}
