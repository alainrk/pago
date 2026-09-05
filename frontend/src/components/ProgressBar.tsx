import type { BudgetTone } from "../lib/budget";

const COLORS: Record<BudgetTone | "brand" | "faint", string> = {
  ok: "var(--brand)",
  warn: "var(--warn)",
  over: "var(--danger)",
  brand: "var(--brand)",
  faint: "var(--muted)",
};

export function ProgressBar({ pct, tone = "brand", height = 9, label }: { pct: number; tone?: BudgetTone | "brand" | "faint"; height?: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
      style={{ height, borderRadius: 999, background: "var(--border)", overflow: "hidden" }}
    >
      <div style={{ width: `${clamped}%`, height: "100%", background: COLORS[tone], borderRadius: 999, transition: "width 300ms ease" }} />
    </div>
  );
}
