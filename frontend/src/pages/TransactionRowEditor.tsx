import { Select } from "../components/Select";
import type { KeyboardEvent } from "react";
import { Button } from "../components/Button";
import { categoriesFor, categoryLabel } from "../lib/categories";
import type { TransactionDTO } from "../api/types";
import styles from "./TransactionsPage.module.css";

export interface EditDraft {
  description: string;
  amount: string;
  category: string;
  date: string; // YYYY-MM-DD
}

interface TransactionRowEditorProps {
  transaction: TransactionDTO;
  draft: EditDraft;
  onChange: (patch: Partial<EditDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

// The inline edit form shown as a full-width desktop table row. Phones use
// TransactionEditSheet instead.
export function TransactionRowEditor({ transaction, draft, onChange, onSave, onCancel, saving }: TransactionRowEditorProps) {
  const categories = categoriesFor(transaction.type);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") onCancel();
  }

  return (
    <div className={styles.editRow} onKeyDown={handleKeyDown}>
      <input
        className={styles.editDesc}
        value={draft.description}
        onChange={(e) => onChange({ description: e.target.value })}
        aria-label="Description"
      />
      <input
        className={styles.editAmount}
        value={draft.amount}
        onChange={(e) => onChange({ amount: e.target.value })}
        inputMode="decimal"
        aria-label="Amount"
      />
      <Select
        className={styles.editCategory}
        value={draft.category}
        options={categories.map((c) => ({ value: c, label: categoryLabel(c) }))}
        onChange={(category) => onChange({ category })}
        ariaLabel="Category"
      />
      <input
        type="date"
        className={styles.editDate}
        value={draft.date}
        onChange={(e) => onChange({ date: e.target.value })}
        aria-label="Date"
      />
      <div className={styles.editActions}>
        <Button variant="secondary" size="sm" onClick={onCancel} type="button">
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={onSave} loading={saving} type="button">
          Save
        </Button>
      </div>
    </div>
  );
}
