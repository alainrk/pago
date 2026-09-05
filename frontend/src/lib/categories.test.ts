import { describe, expect, it } from "vitest";
import { ICONS } from "../components/icons";
import { ALL_CATEGORIES, CATEGORY_META, categoriesFor, categoryLabel } from "./categories";

describe("categories", () => {
  it("has meta for every category", () => {
    for (const category of ALL_CATEGORIES) {
      expect(CATEGORY_META[category]).toBeDefined();
    }
  });

  it("has a valid icon for every category meta", () => {
    for (const category of ALL_CATEGORIES) {
      const meta = CATEGORY_META[category];
      expect(ICONS[meta.icon]).toBeDefined();
    }
  });

  it("returns the human label for EatingOut", () => {
    expect(categoryLabel("EatingOut")).toBe("Restaurant");
  });

  it("returns the two income categories", () => {
    expect(categoriesFor("Income")).toHaveLength(2);
  });
});
