import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Page } from "../layout/AppShell";
import { MobileHeader } from "../layout/MobileHeader";
import { PageHeader } from "../components/PageHeader";
import { Card, CardHead, CardTitle } from "../components/Card";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { CategoryTile } from "../components/CategoryPill";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ContextMenu } from "../components/ContextMenu";
import { SwipeAction } from "../components/SwipeAction";
import { EmptyState } from "../components/EmptyState";
import { PageLoading, ErrorNote } from "../components/Spinner";
import { useToast } from "../components/Toast";
import { useUser, useSessionGuard } from "../auth/AuthContext";
import { useQuery } from "../lib/useQuery";
import { useIsMobile } from "../lib/useMediaQuery";
import { usePrivacy } from "../lib/privacy";
import { categoryLabel } from "../lib/categories";
import { formatMoney, formatSigned } from "../lib/format";
import { readMakeRecurring, ruleSchedule, todayUTC } from "../lib/recurring";
import { recurring as recurringApi } from "../api/endpoints";
import type { RecurringDTO } from "../api/types";
import { RecurringSheet, type RecurringSheetMode } from "./RecurringSheet";
import styles from "./RecurringPage.module.css";

export function RecurringPage() {
  const user = useUser();
  const isMobile = useIsMobile();
  const { hidden } = usePrivacy();
  const { toast } = useToast();
  const guard = useSessionGuard();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = todayUTC();

  const { data, loading, error, reload } = useQuery((signal) => recurringApi.list(signal), []);
  const rules = data?.recurring ?? [];
  const expenses = rules.filter((r) => r.type === "Expense");
  const incomes = rules.filter((r) => r.type === "Income");

  // "Make recurring" on a transaction lands here with it in router state.
  const [sheet, setSheet] = useState<RecurringSheetMode | null>(() => {
    const prefill = readMakeRecurring(location.state);
    return prefill ? { kind: "create", prefill } : null;
  });
  const [menu, setMenu] = useState<{ rule: RecurringDTO; x: number; y: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecurringDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Forget the prefill once the sheet has it, so a reload starts clean.
  useEffect(() => {
    if (location.state) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ?edit=<id> (from the badge on a transaction) opens that rule once loaded.
  const editParam = searchParams.get("edit");
  useEffect(() => {
    if (!editParam || !data) return;
    const rule = data.recurring.find((r) => String(r.id) === editParam);
    if (rule) setSheet({ kind: "edit", rule });
    else toast("That recurring item no longer exists", "error");
    setSearchParams(
      (p) => {
        p.delete("edit");
        return p;
      },
      { replace: true },
    );
  }, [editParam, data, setSearchParams, toast]);

  function openEdit(rule: RecurringDTO) {
    setSheet({ kind: "edit", rule });
  }

  function handleSaved(_rule: RecurringDTO, message: string) {
    setSheet(null);
    toast(message, "success");
    reload();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await recurringApi.remove(deleteTarget.id);
      setDeleteTarget(null);
      setSheet(null);
      toast("Recurring deleted");
      reload();
    } catch (err) {
      if (guard(err)) return;
      toast(err instanceof Error ? err.message : "Could not delete", "error");
    } finally {
      setDeleting(false);
    }
  }

  const addButton = (
    <Button icon="plus" onClick={() => setSheet({ kind: "create" })}>
      Add recurring
    </Button>
  );
  const mobileAdd = (
    <Button variant="icon" icon="plus" aria-label="Add recurring" onClick={() => setSheet({ kind: "create" })} />
  );

  function row(rule: RecurringDTO) {
    const amount = formatSigned(rule.amount, rule.type, user.currency, hidden);
    const schedule = ruleSchedule(rule, today);
    if (isMobile) {
      return (
        <SwipeAction key={rule.id} label="Delete" icon="trash" tone="danger" onAction={() => setDeleteTarget(rule)}>
          <div
            className={styles.mRow}
            role="button"
            tabIndex={0}
            onClick={() => openEdit(rule)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openEdit(rule);
              }
            }}
          >
            <CategoryTile category={rule.category} type={rule.type} />
            <div className={styles.text}>
              <div className={styles.desc}>{rule.description}</div>
              <div className={styles.sub}>{schedule}</div>
            </div>
            <div className={`mono ${styles.amount} ${rule.type === "Income" ? styles.income : ""}`}>{amount}</div>
          </div>
        </SwipeAction>
      );
    }
    return (
      // Clicking anywhere on the row edits it. Keyboard users get the same
      // through the Edit button, so the row itself is not a control.
      <div
        key={rule.id}
        className={styles.row}
        onClick={() => openEdit(rule)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ rule, x: e.clientX, y: e.clientY });
        }}
      >
        <CategoryTile category={rule.category} type={rule.type} />
        <div className={styles.text}>
          <div className={styles.desc}>{rule.description}</div>
          <div className={styles.sub}>
            {categoryLabel(rule.category)} · {schedule}
          </div>
        </div>
        <div className={`mono ${styles.amount} ${rule.type === "Income" ? styles.income : ""}`}>{amount}</div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label={`Edit ${rule.description}`}
            onClick={(e) => {
              e.stopPropagation();
              openEdit(rule);
            }}
          >
            <Icon name="pencil" size={14} />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label={`Delete ${rule.description}`}
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(rule);
            }}
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>
    );
  }

  function group(title: string, items: RecurringDTO[], total: number) {
    if (items.length === 0) return null;
    return (
      <Card flush radius={isMobile ? "lg" : "md"}>
        <CardHead className={styles.groupHead}>
          <CardTitle>{title}</CardTitle>
          <span className={styles.groupTotal}>
            <span className="mono">{formatMoney(total, user.currency, { hidden })}</span> / month
          </span>
        </CardHead>
        <div>{items.map(row)}</div>
      </Card>
    );
  }

  let content;
  if (loading && !data) {
    content = <PageLoading />;
  } else if (error && !data) {
    content = <ErrorNote message={error} onRetry={reload} />;
  } else if (rules.length === 0) {
    content = (
      <Card radius={isMobile ? "lg" : "md"}>
        <EmptyState
          icon="repeat"
          title="No recurring items yet"
          hint="Add rent, subscriptions or salary once, and they're added each month on the day you pick."
          action={addButton}
        />
      </Card>
    );
  } else {
    content = (
      <div className={styles.stack}>
        {group("Expenses", expenses, data?.totalExpense ?? 0)}
        {group("Income", incomes, data?.totalIncome ?? 0)}
        <p className={styles.footnote}>
          Each one is added as a normal transaction on its day. Editing only changes the next ones. Deleting stops future ones and keeps the past.
        </p>
      </div>
    );
  }

  return (
    <>
      <MobileHeader back backTo="/settings" title="Recurring" right={mobileAdd} />
      <Page>
        <PageHeader title="Recurring" backTo="/settings" right={rules.length > 0 ? addButton : undefined} />
        {content}
      </Page>

      {sheet && (
        <RecurringSheet
          key={sheet.kind === "edit" ? `edit-${sheet.rule.id}` : "create"}
          mode={sheet}
          currency={user.currency}
          onClose={() => setSheet(null)}
          onSaved={handleSaved}
          onDelete={(rule) => setDeleteTarget(rule)}
        />
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: "Edit", icon: "pencil", onSelect: () => openEdit(menu.rule) },
            { label: "Delete", icon: "trash", danger: true, onSelect: () => setDeleteTarget(menu.rule) },
          ]}
        />
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete recurring"
        message={deleteTarget ? `Stop adding "${deleteTarget.description}" every month? Past transactions are kept.` : ""}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
