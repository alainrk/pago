import type { TransactionDTO, TransactionType } from "../api/types";

// A clone carries everything from an existing transaction except its date.
// The add screen fills the form from it and sets the date to today.
export interface ClonePrefill {
  type: TransactionType;
  category: string;
  amount: number;
  description: string;
}

const STATE_KEY = "clone";

export function clonePrefill(tx: Pick<TransactionDTO, "type" | "category" | "amount" | "description">): ClonePrefill {
  return { type: tx.type, category: tx.category, amount: tx.amount, description: tx.description };
}

// cloneNavState is the router state to pass when navigating to the add screen.
export function cloneNavState(tx: Pick<TransactionDTO, "type" | "category" | "amount" | "description">): Record<string, ClonePrefill> {
  return { [STATE_KEY]: clonePrefill(tx) };
}

// readClonePrefill pulls a clone out of router state. History state can be
// anything, so every field is checked before it is trusted.
export function readClonePrefill(state: unknown): ClonePrefill | null {
  if (!state || typeof state !== "object") return null;
  const raw = (state as Record<string, unknown>)[STATE_KEY];
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (c.type !== "Income" && c.type !== "Expense") return null;
  if (typeof c.category !== "string" || typeof c.description !== "string") return null;
  if (typeof c.amount !== "number" || !Number.isFinite(c.amount)) return null;
  return { type: c.type, category: c.category, amount: c.amount, description: c.description };
}
