import styles from "./CategoryPill.module.css";
import { Icon } from "./Icon";
import { categoryIcon, categoryLabel } from "../lib/categories";
import type { TransactionType } from "../api/types";

export function CategoryPill({ category, type }: { category: string; type: TransactionType }) {
  const cls = [styles.pill, type === "Income" ? styles.income : ""].filter(Boolean).join(" ");
  return (
    <span className={cls}>
      <Icon name={categoryIcon(category)} size={12} />
      {categoryLabel(category)}
    </span>
  );
}

// CategoryTile is the 34px square icon used in mobile lists.
export function CategoryTile({ category, type }: { category: string; type: TransactionType }) {
  const cls = [styles.tile, type === "Income" ? styles.income : ""].filter(Boolean).join(" ");
  return (
    <div className={cls} aria-hidden>
      <Icon name={categoryIcon(category)} size={16} />
    </div>
  );
}
