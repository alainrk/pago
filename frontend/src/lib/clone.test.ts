import { describe, expect, it } from "vitest";
import { cloneNavState, readClonePrefill } from "./clone";

const tx = { id: 7, date: "2026-03-02T00:00:00Z", type: "Expense" as const, category: "food", amount: 12.5, description: "pizza" };

describe("clone prefill", () => {
  it("round-trips through router state without the date or id", () => {
    expect(readClonePrefill(cloneNavState(tx))).toEqual({ type: "Expense", category: "food", amount: 12.5, description: "pizza" });
  });

  it("returns null for empty or unrelated state", () => {
    expect(readClonePrefill(null)).toBeNull();
    expect(readClonePrefill(undefined)).toBeNull();
    expect(readClonePrefill("x")).toBeNull();
    expect(readClonePrefill({})).toBeNull();
    expect(readClonePrefill({ clone: "nope" })).toBeNull();
  });

  it("rejects a clone with a bad shape", () => {
    expect(readClonePrefill({ clone: { type: "Refund", category: "a", amount: 1, description: "" } })).toBeNull();
    expect(readClonePrefill({ clone: { type: "Income", category: 3, amount: 1, description: "" } })).toBeNull();
    expect(readClonePrefill({ clone: { type: "Income", category: "a", amount: "1", description: "" } })).toBeNull();
    expect(readClonePrefill({ clone: { type: "Income", category: "a", amount: NaN, description: "" } })).toBeNull();
  });
});
