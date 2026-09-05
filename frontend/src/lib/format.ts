// Number and date formatting used across the app. The design uses fixed
// English formats ("€1,732.45", "04 Sep", "September 2026") so we do not rely
// on the browser locale.

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const CURRENCY_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", JPY: "¥", CHF: "CHF " };

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

const numberFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFmt0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

// formatMoney renders an absolute amount with a currency symbol: "€1,732.45".
export function formatMoney(amount: number, currency = "EUR", opts: { decimals?: boolean } = {}): string {
  const abs = Math.abs(amount);
  const n = opts.decimals === false ? numberFmt0.format(abs) : numberFmt.format(abs);
  return `${currencySymbol(currency)}${n}`;
}

// formatSigned adds "+" for income and a real minus sign (U+2212) for expenses.
export function formatSigned(amount: number, type: "Income" | "Expense", currency = "EUR"): string {
  const sign = type === "Income" ? "+" : "−";
  return `${sign}${formatMoney(amount, currency)}`;
}

// formatBalance signs a net value: positive gets "+", negative gets "−".
export function formatBalance(amount: number, currency = "EUR"): string {
  if (amount < 0) return `−${formatMoney(amount, currency)}`;
  return `+${formatMoney(amount, currency)}`;
}

// parseAmount accepts "12.50" or "12,50" and returns a positive number or null.
export function parseAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 ? Math.round(n * 100) / 100 : null;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// toLocalDate parses "YYYY-MM-DD" or an RFC3339 string into a Date at local midnight.
export function toLocalDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

// isoDate renders a Date as "YYYY-MM-DD" using local time.
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// formatDayShort renders "04 Sep".
export function formatDayShort(value: string | Date): string {
  const d = typeof value === "string" ? toLocalDate(value) : value;
  return `${pad2(d.getDate())} ${MONTHS_SHORT[d.getMonth()]}`;
}

// formatDayLong renders "Thursday 4 Sep".
export function formatDayLong(value: string | Date): string {
  const d = typeof value === "string" ? toLocalDate(value) : value;
  return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

// formatDateFull renders "12 Mar 2026".
export function formatDateFull(value: string | Date): string {
  const d = typeof value === "string" ? toLocalDate(value) : value;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

// formatRelativeDay renders "today", "yesterday", "2 days ago" or a full date.
export function formatRelativeDay(value: string | Date, now = new Date()): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return formatDateFull(d);
}
