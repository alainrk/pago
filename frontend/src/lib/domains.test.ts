import { describe, expect, it } from "vitest";
import { allApiOrigins, movedTarget, parseHostMap, pickApiBase } from "./domains";

describe("parseHostMap", () => {
  it("reads host=url pairs and skips bad ones", () => {
    expect(parseHostMap(" App.Old.example = https://api.old.example/ , junk, =x")).toEqual({
      "app.old.example": "https://api.old.example",
    });
    expect(parseHostMap(undefined)).toEqual({});
  });
});

describe("pickApiBase", () => {
  const byHost = "app.old.example=https://api.old.example";
  it("uses the per-host API on the old host", () => {
    expect(pickApiBase("app.old.example", "https://api.new.example", byHost)).toBe("https://api.old.example");
  });
  it("uses the default everywhere else", () => {
    expect(pickApiBase("app.new.example", "https://api.new.example/", byHost)).toBe("https://api.new.example");
    expect(pickApiBase("localhost", "", undefined)).toBe("");
  });
});

describe("movedTarget", () => {
  it("points the old host at the same page on the new one", () => {
    expect(movedTarget("app.old.example", "app.old.example", "https://app.new.example/", "/reports?month=2026-10")).toBe(
      "https://app.new.example/reports?month=2026-10",
    );
  });
  it("shows nothing on other hosts or without a target", () => {
    expect(movedTarget("app.new.example", "app.old.example", "https://app.new.example", "/")).toBeNull();
    expect(movedTarget("app.old.example", "app.old.example", "", "/")).toBeNull();
    expect(movedTarget("app.old.example", "", "https://app.new.example", "/")).toBeNull();
  });
});

describe("allApiOrigins", () => {
  it("lists every API origin once", () => {
    expect(
      allApiOrigins("https://api.new.example/", "app.old.example=https://api.old.example,x.example=https://api.new.example"),
    ).toEqual(["https://api.new.example", "https://api.old.example"]);
    expect(allApiOrigins("", undefined)).toEqual([]);
  });
});
