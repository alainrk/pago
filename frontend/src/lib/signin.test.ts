import { describe, expect, it } from "vitest";
import { googleErrorMessage } from "./signin";

describe("googleErrorMessage", () => {
  it("has no message without a code", () => {
    expect(googleErrorMessage(null)).toBeNull();
  });
  it("explains known and unknown codes", () => {
    expect(googleErrorMessage("google_taken")).toContain("another Pago account");
    expect(googleErrorMessage("whatever")).toContain("did not work");
  });
});
