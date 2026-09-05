import { describe, expect, it } from "vitest";
import { computePace } from "./budget";

describe("computePace", () => {
  it("matches the design sample", () => {
    const p = computePace(1732.45, 2000, new Date(2026, 8, 4), true, 30);
    expect(p.pct).toBe(86);
    expect(p.left).toBeCloseTo(267.55);
    expect(p.tone).toBe("warn");
    expect(p.daysToGo).toBe(26);
    expect(p.perDay).toBeCloseTo(10.29);
  });
  it("handles over budget", () => {
    const p = computePace(2100, 2000, new Date(2026, 8, 30), true, 30);
    expect(p.tone).toBe("over");
    expect(p.over).toBe(100);
    expect(p.barPct).toBe(100);
    expect(p.perDay).toBeNull();
  });
  it("past months have no pacing", () => {
    const p = computePace(500, 2000, new Date(2026, 8, 4), false, 31);
    expect(p.daysToGo).toBe(0);
    expect(p.perDay).toBeNull();
    expect(p.tone).toBe("ok");
  });
});
