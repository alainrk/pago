import { describe, expect, it } from "vitest";
import { returnPath } from "./returnPath";

describe("returnPath", () => {
  it("returns the pathname alone when there is no query or hash", () => {
    expect(returnPath({ pathname: "/transactions", search: "", hash: "" })).toBe("/transactions");
  });

  it("keeps the query string so deep links survive login", () => {
    expect(returnPath({ pathname: "/", search: "?text=pizza%2012.50", hash: "" })).toBe("/?text=pizza%2012.50");
  });

  it("keeps the hash too", () => {
    expect(returnPath({ pathname: "/reports", search: "?m=2026-09", hash: "#top" })).toBe("/reports?m=2026-09#top");
  });

  it("treats missing search and hash as empty", () => {
    expect(returnPath({ pathname: "/settings" })).toBe("/settings");
  });
});
