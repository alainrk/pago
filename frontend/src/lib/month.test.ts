import { describe, expect, it } from "vitest";
import { isValidMonthKey, monthRange, monthTitle, shiftMonth, weekRange } from "./month";
import { isoDate } from "./format";

describe("month helpers", () => {
  it("shifts across years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
  it("titles", () => {
    expect(monthTitle("2026-09")).toBe("September 2026");
    expect(monthTitle("2026-09", true)).toBe("Sep 2026");
  });
  it("ranges", () => {
    expect(monthRange("2026-09")).toEqual({ from: "2026-09-01", to: "2026-09-30", days: 30 });
    expect(monthRange("2024-02").days).toBe(29);
  });
  it("validates", () => {
    expect(isValidMonthKey("2026-09")).toBe(true);
    expect(isValidMonthKey("2026-13")).toBe(false);
    expect(isValidMonthKey("nope")).toBe(false);
  });
  it("weeks start on Monday", () => {
    const { from, to } = weekRange(new Date(2026, 8, 4)); // Friday 4 Sep 2026
    expect(isoDate(from)).toBe("2026-08-31");
    expect(isoDate(to)).toBe("2026-09-06");
  });
});
