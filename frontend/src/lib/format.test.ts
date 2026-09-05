import { describe, expect, it } from "vitest";
import {
  formatBalance,
  formatDayLong,
  formatDayShort,
  formatDateFull,
  formatMoney,
  formatRelativeDay,
  formatSigned,
  isoDate,
  parseAmount,
  toLocalDate,
} from "./format";

describe("money", () => {
  it("formats with grouping and two decimals", () => {
    expect(formatMoney(1732.45)).toBe("€1,732.45");
    expect(formatMoney(2000)).toBe("€2,000.00");
    expect(formatMoney(1732.45, "EUR", { decimals: false })).toBe("€1,732");
    expect(formatMoney(5, "USD")).toBe("$5.00");
  });
  it("signs by type", () => {
    expect(formatSigned(2600, "Income")).toBe("+€2,600.00");
    expect(formatSigned(64.3, "Expense")).toBe("−€64.30");
    expect(formatBalance(1107.55)).toBe("+€1,107.55");
    expect(formatBalance(-12)).toBe("−€12.00");
  });
  it("parses amounts", () => {
    expect(parseAmount("12.50")).toBe(12.5);
    expect(parseAmount("12,5")).toBe(12.5);
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("1.234")).toBeNull();
  });
});

describe("dates", () => {
  it("formats days", () => {
    expect(formatDayShort("2026-09-04")).toBe("04 Sep");
    expect(formatDayLong("2026-09-04")).toBe("Friday 4 Sep");
    expect(formatDateFull("2026-03-12T00:00:00Z")).toBe("12 Mar 2026");
    expect(isoDate(toLocalDate("2026-09-04"))).toBe("2026-09-04");
  });
  it("formats relative days", () => {
    const now = new Date(2026, 8, 4, 12);
    expect(formatRelativeDay(new Date(2026, 8, 4, 9), now)).toBe("today");
    expect(formatRelativeDay(new Date(2026, 8, 3, 23), now)).toBe("yesterday");
    expect(formatRelativeDay(new Date(2026, 8, 2, 1), now)).toBe("2 days ago");
    expect(formatRelativeDay(new Date(2026, 2, 12), now)).toBe("12 Mar 2026");
  });
});
