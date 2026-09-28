/** Flat SVG charts. No chart library, no gradients. */

export function RiskDonut({ low, medium, high }: { low: number; medium: number; high: number }) {
  const total = low + medium + high;
  const r = 70;
  const c = 2 * Math.PI * r;
  const segs = [
    { label: "Low", n: low, color: "var(--color-low)" },
    { label: "Medium", n: medium, color: "var(--color-mid)" },
    { label: "High", n: high, color: "var(--color-high)" },
  ];
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-around lg:flex-col xl:flex-row">
      <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label={`${total} invoices: ${low} low, ${medium} medium, ${high} high risk`}>
        <circle cx="90" cy="90" r={r} fill="none" stroke="var(--color-raised)" strokeWidth="18" />
        {total > 0 &&
          segs.map((s) => {
            const len = (s.n / total) * c;
            const el = (
              <circle
                key={s.label}
                cx="90"
                cy="90"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="18"
                strokeDasharray={`${Math.max(len - (s.n > 0 && s.n < total ? 2 : 0), 0)} ${c}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 90 90)"
              />
            );
            offset += len;
            return s.n > 0 ? el : null;
          })}
        <text x="90" y="88" textAnchor="middle" fontSize="32" fontWeight="600" fill="var(--color-ink)" className="num">
          {total}
        </text>
        <text x="90" y="110" textAnchor="middle" fontSize="13" fill="var(--color-mute)">
          invoices
        </text>
      </svg>
      <ul className="w-full max-w-[220px] space-y-2">
        {segs.map((s) => (
          <li key={s.label} className="flex items-center justify-between text-[15px]">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="num font-medium">
              {s.n}
              <span className="ml-2 text-[13px] font-normal text-mute">{total ? Math.round((s.n / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WeeklyBars({ weeks }: { weeks: { label: string; flagged: number; resolved: number }[] }) {
  const max = Math.max(4, ...weeks.flatMap((w) => [w.flagged, w.resolved]));
  const W = 640;
  const H = 240;
  const pad = { l: 28, r: 8, t: 12, b: 34 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const groupW = innerW / Math.max(weeks.length, 1);
  const barW = Math.min(26, groupW / 3);
  const y = (n: number) => pad.t + innerH - (n / max) * innerH;
  const ticks = [0, Math.ceil(max / 2), max];

  return (
    <div>
      <div className="mb-3 flex gap-5 text-[14px]">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-mid" /> Raised
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> Resolved
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Alerts raised and resolved per week">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth="1" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="13" fill="var(--color-mute)" className="num">
              {t}
            </text>
          </g>
        ))}
        {weeks.map((w, i) => {
          const cx = pad.l + groupW * i + groupW / 2;
          return (
            <g key={w.label}>
              <rect x={cx - barW - 2} y={y(w.flagged)} width={barW} height={pad.t + innerH - y(w.flagged)} rx="3" fill="var(--color-mid)" />
              <rect x={cx + 2} y={y(w.resolved)} width={barW} height={pad.t + innerH - y(w.resolved)} rx="3" fill="var(--color-accent)" />
              <text x={cx} y={H - 10} textAnchor="middle" fontSize="13" fill="var(--color-mute)">
                {w.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-[13px] text-mute">Weeks start on Monday.</p>
    </div>
  );
}
