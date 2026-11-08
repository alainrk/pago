import { describe, expect, it } from "vitest";
import { googleErrorMessage, readHandoffToken } from "./signin";

describe("readHandoffToken", () => {
  it("reads a valid token", () => {
    expect(readHandoffToken("#t=0123456789abcdef0123456789abcdef")).toBe("0123456789abcdef0123456789abcdef");
  });
  it("rejects anything else", () => {
    expect(readHandoffToken("")).toBeNull();
    expect(readHandoffToken("#t=short")).toBeNull();
    expect(readHandoffToken("#t=0123456789abcdef0123456789abcdeZ")).toBeNull();
    expect(readHandoffToken("#x=0123456789abcdef0123456789abcdef")).toBeNull();
  });
});

describe("googleErrorMessage", () => {
  it("has no message without a code", () => {
    expect(googleErrorMessage(null)).toBeNull();
  });
  it("explains known and unknown codes", () => {
    expect(googleErrorMessage("google_taken")).toContain("another Pago account");
    expect(googleErrorMessage("whatever")).toContain("did not work");
  });
});
