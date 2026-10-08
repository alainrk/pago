import type { TransactionDTO, TransactionType } from "../api/types";
import { MONTHS_LONG, MONTHS_SHORT } from "./format";

// Date rules for monthly recurring transactions. They mirror
// internal/recurring/dates.go so the form can preview what the server will
// do. Dates are "YYYY-MM-DD" strings in UTC, like the server.

export const MAX_DAY = 28;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return [y, m, d];
}

// make builds a date string; month is 1-based and may overflow into the next year.
function make(year: number, month: number, day: number): string {
  const y = year + Math.floor((month - 1) / 12);
  const m = ((((month - 1) % 12) + 12) % 12) + 1;
  return `${y}-${pad2(m)}-${pad2(day)}`;
}

// todayUTC is the current date on the server's calendar.
export function todayUTC(now = new Date()): string {
  return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
}

// firstDue is the first date with that day of month strictly after today.
export function firstDue(today: string, day: number): string {
  const [y, m] = parts(today);
  const due = make(y, m, day);
  return due > today ? due : make(y, m + 1, day);
}

export function nextAfter(due: string): string {
  const [y, m, d] = parts(due);
  return make(y, m + 1, d);
}

// withDay moves a due date to another day inside the same month.
export function withDay(due: string, day: number): string {
  const [y, m] = parts(due);
  return make(y, m, day);
}

// dayFromDate turns a transaction date into a rule day (29 to 31 become 28).
export function dayFromDate(date: string): number {
  return Math.min(parts(date)[2], MAX_DAY);
}

// fromTransaction: a transaction in the current month or later counts as that
// month's payment and the rule starts the month after; an older one is only
// a template.
export function fromTransaction(txDate: string, today: string, day: number): { link: boolean; next: string } {
  const [ty, tm] = parts(txDate);
  const [cy, cm] = parts(today);
  if (ty * 12 + tm >= cy * 12 + cm) return { link: true, next: make(ty, tm + 1, day) };
  return { link: false, next: firstDue(today, day) };
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// formatDue renders "5 Nov", with the year when it is not the current one.
export function formatDue(date: string, today: string): string {
  const [y, m, d] = parts(date);
  const label = `${d} ${MONTHS_SHORT[m - 1]}`;
  return y === parts(today)[0] ? label : `${label} ${y}`;
}

export function monthName(date: string): string {
  return MONTHS_LONG[parts(date)[1] - 1];
}

// ruleSchedule is the second line of a rule row: "Every 5th · next 5 Nov".
export function ruleSchedule(rule: { dayOfMonth: number; nextDueDate: string }, today: string): string {
  const next = rule.nextDueDate <= today ? "being added now" : `next ${formatDue(rule.nextDueDate, today)}`;
  return `Every ${ordinal(rule.dayOfMonth)} · ${next}`;
}

// duePreview is the line under the day field in the rule form.
export function duePreview(next: string, today: string, editing: boolean): string {
  if (next <= today) return "This month's one is owed, so it is added within the hour.";
  return `${editing ? "Next" : "First"} one on ${formatDue(next, today)}.`;
}

// Router state for "Make recurring": the transaction the rule starts from.
export interface MakeRecurringPrefill {
  id: number;
  type: TransactionType;
  category: string;
  amount: number;
  description: string;
  date: string; // YYYY-MM-DD
  linked: boolean; // already added by another rule
}

const STATE_KEY = "makeRecurring";

export function makeRecurringNavState(tx: TransactionDTO): Record<string, MakeRecurringPrefill> {
  return {
    [STATE_KEY]: {
      id: tx.id,
      type: tx.type,
      category: tx.category,
      amount: tx.amount,
      description: tx.description,
      date: tx.date.slice(0, 10),
      linked: tx.recurringId != null,
    },
  };
}

// readMakeRecurring pulls the prefill out of router state, checking every field.
export function readMakeRecurring(state: unknown): MakeRecurringPrefill | null {
  if (!state || typeof state !== "object") return null;
  const raw = (state as Record<string, unknown>)[STATE_KEY];
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (c.type !== "Income" && c.type !== "Expense") return null;
  if (typeof c.id !== "number" || typeof c.category !== "string" || typeof c.description !== "string") return null;
  if (typeof c.amount !== "number" || !Number.isFinite(c.amount)) return null;
  if (typeof c.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(c.date)) return null;
  return { id: c.id, type: c.type, category: c.category, amount: c.amount, description: c.description, date: c.date, linked: c.linked === true };
}
