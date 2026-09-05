// Backend transaction categories and their display metadata (label + icon).

import type { IconName } from "../components/icons";

export type TransactionType = "Income" | "Expense";

export const INCOME_CATEGORIES = ["Salary", "OtherIncomes"] as const;

export const EXPENSE_CATEGORIES = [
  "Car",
  "Clothes",
  "Grocery",
  "House",
  "Bills",
  "Entertainment",
  "Sport",
  "EatingOut",
  "Transport",
  "Learning",
  "Toiletry",
  "Health",
  "Tech",
  "Gifts",
  "Travel",
  "Pets",
  "OtherExpenses",
] as const;

export const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES] as const;

export interface CategoryMeta {
  label: string;
  icon: IconName;
  type: TransactionType;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  // Income
  Salary: { label: "Salary", icon: "briefcase", type: "Income" },
  OtherIncomes: { label: "Other income", icon: "plus", type: "Income" },

  // Expense
  Car: { label: "Car", icon: "car", type: "Expense" },
  Clothes: { label: "Clothes", icon: "clothes", type: "Expense" },
  Grocery: { label: "Grocery", icon: "shopping-cart", type: "Expense" },
  House: { label: "House", icon: "home", type: "Expense" },
  Bills: { label: "Bills", icon: "invoice", type: "Expense" },
  Entertainment: { label: "Entertainment", icon: "tv", type: "Expense" },
  Sport: { label: "Sport", icon: "fitness", type: "Expense" },
  EatingOut: { label: "Restaurant", icon: "restaurant", type: "Expense" },
  Transport: { label: "Transport", icon: "train", type: "Expense" },
  Learning: { label: "Learning", icon: "book", type: "Expense" },
  Toiletry: { label: "Toiletry", icon: "toiletry", type: "Expense" },
  Health: { label: "Health", icon: "heart", type: "Expense" },
  Tech: { label: "Tech", icon: "router", type: "Expense" },
  Gifts: { label: "Gifts", icon: "gift", type: "Expense" },
  Travel: { label: "Travel", icon: "plane", type: "Expense" },
  Pets: { label: "Pets", icon: "paw", type: "Expense" },
  OtherExpenses: { label: "Other", icon: "dots", type: "Expense" },
};

export function categoryLabel(category: string): string {
  return CATEGORY_META[category]?.label ?? category;
}

export function categoryIcon(category: string): IconName {
  return CATEGORY_META[category]?.icon ?? "credit-card";
}

export function categoriesFor(type: TransactionType): readonly string[] {
  return type === "Income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}
