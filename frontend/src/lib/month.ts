import { MONTHS_LONG, MONTHS_SHORT, isoDate } from "./format";

// A month key is "YYYY-MM", the same format the API uses.
export type MonthKey = string;

export function monthKey(d: Date): MonthKey {
  const m = d.getMonth() + 1;
  return `${d.getFullYear()}-${m < 10 ? `0${m}` : m}`;
}

export function currentMonthKey(now = new Date()): MonthKey {
  return monthKey(now);
}

export function parseMonthKey(key: MonthKey): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function isValidMonthKey(
  key: string | null | undefined,
): key is MonthKey {
  if (!key) return false;
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return false;
  const month = Number(m[2]);
  return month >= 1 && month <= 12;
}

export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const { year, month } = parseMonthKey(key);
  return monthKey(new Date(year, month - 1 + delta, 1));
}

// monthTitle renders "September 2026"; short gives "Sep 2026".
export function monthTitle(key: MonthKey, short = false): string {
  const { year, month } = parseMonthKey(key);
  return `${(short ? MONTHS_SHORT : MONTHS_LONG)[month - 1]} ${year}`;
}

export function monthName(key: MonthKey): string {
  return MONTHS_LONG[parseMonthKey(key).month - 1];
}

// monthRange returns the first and last day of the month as YYYY-MM-DD.
export function monthRange(key: MonthKey): {
  from: string;
  to: string;
  days: number;
} {
  const { year, month } = parseMonthKey(key);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  return { from: isoDate(first), to: isoDate(last), days: last.getDate() };
}

export function isCurrentMonth(key: MonthKey, now = new Date()): boolean {
  return key === monthKey(now);
}

export function isFutureMonth(key: MonthKey, now = new Date()): boolean {
  return key > monthKey(now);
}

// weekRange returns the Monday..Sunday week containing the given date.
export function weekRange(d: Date): { from: Date; to: Date } {
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const from = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6);
  return { from, to };
}
