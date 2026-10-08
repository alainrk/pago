import { describe, expect, it } from "vitest";
import {
  dayFromDate,
  duePreview,
  firstDue,
  formatDue,
  fromTransaction,
  makeRecurringNavState,
  nextAfter,
  ordinal,
  readMakeRecurring,
  ruleSchedule,
  todayUTC,
  withDay,
} from "./recurring";

// Same cases as internal/recurring/dates_test.go, so both sides agree.
describe("recurring date rules", () => {
  it("firstDue picks the first matching day strictly after today", () => {
    expect(firstDue("2026-10-08", 20)).toBe("2026-10-20");
    expect(firstDue("2026-10-15", 10)).toBe("2026-11-10");
    expect(firstDue("2026-10-10", 10)).toBe("2026-11-10");
    expect(firstDue("2026-10-09", 10)).toBe("2026-10-10");
    expect(firstDue("2026-12-20", 5)).toBe("2027-01-05");
    expect(firstDue("2026-12-31", 28)).toBe("2027-01-28");
    expect(firstDue("2026-02-28", 28)).toBe("2026-03-28");
    expect(firstDue("2026-02-01", 28)).toBe("2026-02-28");
  });

  it("nextAfter keeps the day and rolls the year", () => {
    expect(nextAfter("2026-10-05")).toBe("2026-11-05");
    expect(nextAfter("2026-12-28")).toBe("2027-01-28");
    expect(nextAfter("2026-01-28")).toBe("2026-02-28");
  });

  it("withDay only changes the day inside the owed month", () => {
    expect(withDay("2026-10-20", 5)).toBe("2026-10-05");
    expect(withDay("2026-11-10", 2)).toBe("2026-11-02");
    expect(withDay("2026-08-05", 20)).toBe("2026-08-20");
  });

  it("dayFromDate maps 29 to 31 to 28", () => {
    expect(dayFromDate("2026-10-01")).toBe(1);
    expect(dayFromDate("2026-10-28")).toBe(28);
    expect(dayFromDate("2026-10-31")).toBe(28);
    expect(dayFromDate("2026-10-05T00:00:00Z")).toBe(5);
  });

  it("fromTransaction links current and future months only", () => {
    expect(fromTransaction("2026-10-05", "2026-10-08", 5)).toEqual({ link: true, next: "2026-11-05" });
    expect(fromTransaction("2026-10-31", "2026-10-08", 28)).toEqual({ link: true, next: "2026-11-28" });
    expect(fromTransaction("2026-12-15", "2026-12-01", 15)).toEqual({ link: true, next: "2027-01-15" });
    expect(fromTransaction("2026-09-20", "2026-10-08", 20)).toEqual({ link: false, next: "2026-10-20" });
    expect(fromTransaction("2026-09-05", "2026-10-08", 5)).toEqual({ link: false, next: "2026-11-05" });
    expect(fromTransaction("2025-10-05", "2026-10-08", 5)).toEqual({ link: false, next: "2026-11-05" });
    expect(fromTransaction("2026-10-05", "2026-10-08", 12)).toEqual({ link: true, next: "2026-11-12" });
  });

  it("todayUTC uses the UTC calendar", () => {
    expect(todayUTC(new Date("2026-10-08T23:30:00Z"))).toBe("2026-10-08");
    expect(todayUTC(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-31");
    expect(todayUTC(new Date("2027-01-01T00:00:00Z"))).toBe("2027-01-01");
  });
});

describe("recurring labels", () => {
  it("ordinal", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "28th",
    ]);
  });

  it("formatDue adds the year only when needed", () => {
    expect(formatDue("2026-11-05", "2026-10-08")).toBe("5 Nov");
    expect(formatDue("2027-01-05", "2026-12-20")).toBe("5 Jan 2027");
  });

  it("ruleSchedule", () => {
    expect(ruleSchedule({ dayOfMonth: 5, nextDueDate: "2026-11-05" }, "2026-10-08")).toBe("Every 5th · next 5 Nov");
    expect(ruleSchedule({ dayOfMonth: 5, nextDueDate: "2026-10-05" }, "2026-10-08")).toBe("Every 5th · being added now");
  });

  it("duePreview", () => {
    expect(duePreview("2026-11-10", "2026-10-15", false)).toBe("First one on 10 Nov.");
    expect(duePreview("2026-11-10", "2026-10-15", true)).toBe("Next one on 10 Nov.");
    expect(duePreview("2026-10-05", "2026-10-08", true)).toMatch(/within the hour/);
  });
});

describe("make recurring prefill", () => {
  const tx = { id: 7, date: "2026-10-05T00:00:00Z", type: "Expense" as const, category: "House", amount: 900, description: "Rent", recurringId: null };

  it("round-trips through router state", () => {
    expect(readMakeRecurring(makeRecurringNavState(tx))).toEqual({
      id: 7, type: "Expense", category: "House", amount: 900, description: "Rent", date: "2026-10-05", linked: false,
    });
    expect(readMakeRecurring(makeRecurringNavState({ ...tx, recurringId: 3 }))?.linked).toBe(true);
  });

  it("rejects bad state", () => {
    expect(readMakeRecurring(null)).toBeNull();
    expect(readMakeRecurring({})).toBeNull();
    expect(readMakeRecurring({ makeRecurring: { ...makeRecurringNavState(tx).makeRecurring, date: "soon" } })).toBeNull();
    expect(readMakeRecurring({ makeRecurring: { ...makeRecurringNavState(tx).makeRecurring, type: "Refund" } })).toBeNull();
    expect(readMakeRecurring({ makeRecurring: { ...makeRecurringNavState(tx).makeRecurring, amount: Number.NaN } })).toBeNull();
  });
});
