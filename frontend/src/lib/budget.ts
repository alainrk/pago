// Budget pacing maths shared by the dashboard and budget pages.

export type BudgetTone = "ok" | "warn" | "over";

export interface BudgetPace {
  spent: number;
  limit: number;
  left: number; // never negative
  over: number; // amount above the limit, 0 when under
  pct: number; // 0..100+ rounded down
  barPct: number; // clamped to 100 for the progress bar
  tone: BudgetTone;
  daysToGo: number; // days remaining after today in the month (0 on the last day)
  perDay: number | null; // what you can still spend per remaining day, null when not applicable
}

export function computePace(spent: number, limit: number, now: Date, isCurrentMonth: boolean, daysInMonth: number): BudgetPace {
  const pct = limit > 0 ? Math.floor((spent / limit) * 100) : 0;
  const left = Math.max(0, limit - spent);
  const over = Math.max(0, spent - limit);
  const tone: BudgetTone = pct >= 100 ? "over" : pct >= 75 ? "warn" : "ok";
  const daysToGo = isCurrentMonth ? Math.max(0, daysInMonth - now.getDate()) : 0;
  const perDay = isCurrentMonth && daysToGo > 0 && left > 0 ? Math.floor((left / daysToGo) * 100) / 100 : null;
  return { spent, limit, left, over, pct, barPct: Math.min(100, pct), tone, daysToGo, perDay };
}
