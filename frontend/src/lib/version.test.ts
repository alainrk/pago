import { describe, expect, it } from "vitest";
import { isNewBuild } from "./version";

describe("isNewBuild", () => {
  it("is true when the server names another build", () => {
    expect(isNewBuild("abc-1", { build: "abc-2" })).toBe(true);
  });

  it("is false for the running build", () => {
    expect(isNewBuild("abc-1", { build: "abc-1" })).toBe(false);
  });

  it("is false for anything unexpected", () => {
    expect(isNewBuild("abc-1", null)).toBe(false);
    expect(isNewBuild("abc-1", "abc-2")).toBe(false);
    expect(isNewBuild("abc-1", {})).toBe(false);
    expect(isNewBuild("abc-1", { build: "" })).toBe(false);
    expect(isNewBuild("abc-1", { build: 2 })).toBe(false);
  });
});
