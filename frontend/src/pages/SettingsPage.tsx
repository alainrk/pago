import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Page } from "../layout/AppShell";
import { MobileHeader } from "../layout/MobileHeader";
import { PageHeader } from "../components/PageHeader";
import { Card, CardTitle, CardSubtitle } from "../components/Card";
import { Button } from "../components/Button";
import { Select } from "../components/Select";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/Avatar";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PageLoading, ErrorNote } from "../components/Spinner";
import { useToast } from "../components/Toast";
import { useAuth, useUser, useSessionGuard } from "../auth/AuthContext";
import { useQuery } from "../lib/useQuery";
import { useIsMobile } from "../lib/useMediaQuery";
import { account, budget as budgetApi } from "../api/endpoints";
import { registerPasskey, suggestPasskeyName, isPasskeySupported, PasskeyCancelledError } from "../api/webauthn";
import { currencySymbol, formatDateFull, formatMoney, formatRelativeDay, parseAmount } from "../lib/format";
import styles from "./SettingsPage.module.css";

export function SettingsPage() {
  const user = useUser();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const guard = useSessionGuard();
  const isMobile = useIsMobile();

  const { data: pkData, loading: pkLoading, error: pkError, reload: reloadPasskeys } = useQuery(() => account.passkeys(), []);
  const passkeys = pkData?.passkeys ?? [];

  const [exporting, setExporting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [registering, setRegistering] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const budgetQuery = useQuery((signal) => budgetApi.get(signal), []);
  const hasBudget = budgetQuery.data?.hasBudget ?? false;
  const [budgetInput, setBudgetInput] = useState("");
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetRemoving, setBudgetRemoving] = useState(false);
  const [budgetConfirm, setBudgetConfirm] = useState(false);

  // Keep the input in sync with the saved amount whenever fresh data arrives.
  useEffect(() => {
    const data = budgetQuery.data;
    if (data && data.hasBudget && data.amount != null) setBudgetInput(data.amount.toFixed(2));
    else if (data && !data.hasBudget) setBudgetInput("");
  }, [budgetQuery.data]);

  async function handleBudgetSave() {
    const parsed = parseAmount(budgetInput);
    if (parsed == null) {
      toast("Enter a valid amount", "error");
      return;
    }
    setBudgetSaving(true);
    try {
      await budgetApi.save(parsed);
      budgetQuery.reload();
      toast("Budget saved");
    } catch (err) {
      if (guard(err)) return;
      toast("Could not save the budget", "error");
    } finally {
      setBudgetSaving(false);
    }
  }

  async function handleBudgetRemove() {
    setBudgetRemoving(true);
    try {
      await budgetApi.remove();
      budgetQuery.reload();
      setBudgetConfirm(false);
      toast("Budget removed");
    } catch (err) {
      if (guard(err)) return;
      toast("Could not remove the budget", "error");
    } finally {
      setBudgetRemoving(false);
    }
  }

  const supported = isPasskeySupported();
  const canRegister = supported && user.hasEmail;
  const registerNote = !supported
    ? "Passkeys are not supported in this browser."
    : !user.hasEmail
      ? "Add an email to your account from the Telegram bot to use passkeys."
      : null;

  async function handleExport() {
    setExporting(true);
    try {
      const { blob, filename } = await account.exportCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "cashout-transactions.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Export ready");
    } catch (err) {
      if (guard(err)) return;
      toast(err instanceof Error ? err.message : "Could not export your data", "error");
    } finally {
      setExporting(false);
    }
  }

  function openRegisterForm() {
    setName(suggestPasskeyName());
    setShowForm(true);
  }

  async function handleRegister() {
    setRegistering(true);
    try {
      await registerPasskey(name.trim() || suggestPasskeyName());
      setShowForm(false);
      reloadPasskeys();
      toast("Passkey registered");
    } catch (err) {
      if (err instanceof PasskeyCancelledError) return;
      if (guard(err)) return;
      toast(err instanceof Error ? err.message : "Could not register the passkey", "error");
    } finally {
      setRegistering(false);
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await account.passkeyDelete(deleteId);
      setDeleteId(null);
      reloadPasskeys();
      toast("Passkey removed");
    } catch (err) {
      if (guard(err)) return;
      toast(err instanceof Error ? err.message : "Could not remove the passkey", "error");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  const passkeyListBlock =
    pkLoading && !pkData ? (
      <PageLoading />
    ) : pkError ? (
      <ErrorNote message={pkError} onRetry={reloadPasskeys} />
    ) : passkeys.length === 0 ? (
      <div className={styles.note}>No passkeys yet.</div>
    ) : (
      <div className={styles.pkList}>
        {passkeys.map((pk) => (
          <div key={pk.id} className={styles.pkRow}>
            <Icon name="shield-check" size={19} style={{ color: "var(--brand-dark)" }} />
            <div className={styles.pkInfo}>
              <div className={styles.pkName}>{pk.name}</div>
              <div className={styles.pkMeta}>
                Added {formatDateFull(pk.createdAt)} &middot; Last used {pk.lastUsedAt ? formatRelativeDay(pk.lastUsedAt) : "never"}
              </div>
            </div>
            <button type="button" className={styles.pkDelete} aria-label={`Remove passkey ${pk.name}`} onClick={() => setDeleteId(pk.id)}>
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
      </div>
    );

  const registerBlock = showForm ? (
    <div className={styles.pkForm}>
      <label className="visually-hidden" htmlFor="passkey-name">
        Passkey name
      </label>
      <input
        id="passkey-name"
        className="input"
        placeholder="Passkey name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={registering}
      />
      <div className={styles.pkFormActions}>
        <Button variant="secondary" size="sm" onClick={() => setShowForm(false)} disabled={registering}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleRegister} loading={registering}>
          Save
        </Button>
      </div>
    </div>
  ) : (
    <>
      <Button variant="primary" icon="plus" onClick={openRegisterForm} disabled={!canRegister} style={{ alignSelf: "flex-start" }}>
        Register a new passkey
      </Button>
      {registerNote && <div className={styles.note}>{registerNote}</div>}
    </>
  );

  const passkeysCard = (
    <Card radius={isMobile ? "lg" : "md"} gap="16px">
      <div className={styles.pkHead}>
        <CardTitle>Passkeys</CardTitle>
        <CardSubtitle>Your devices for passwordless sign-in. You can register more than one.</CardSubtitle>
      </div>
      {passkeyListBlock}
      {registerBlock}
    </Card>
  );

  const dataText = <div className={styles.text}>Download every transaction on your account as a CSV file. All years, all categories.</div>;
  const exportButton = (
    <Button variant="outline" icon="download" loading={exporting} onClick={handleExport} style={{ alignSelf: "flex-start" }}>
      Export all as CSV
    </Button>
  );

  const currencySelect = (
    <Select value="EUR" options={[{ value: "EUR", label: "EUR (€)" }]} onChange={() => undefined} disabled ariaLabel="Currency" style={{ "--h": "34px", width: "auto" } as never} />
  );

  const budgetCard = (
    <Card radius={isMobile ? "lg" : "md"} gap="12px">
      <CardTitle>Monthly budget</CardTitle>
      <div className={styles.text}>One limit for every month. The Telegram bot warns you as spending gets close to it.</div>
      {budgetQuery.loading && !budgetQuery.data ? (
        <PageLoading />
      ) : budgetQuery.error ? (
        <ErrorNote message={budgetQuery.error} onRetry={budgetQuery.reload} />
      ) : (
        <>
          <div className={styles.budgetRow}>
            <label className="visually-hidden" htmlFor="budget-amount">
              Monthly budget limit ({currencySymbol(user.currency)})
            </label>
            <input
              id="budget-amount"
              className={`input is-mono ${styles.budgetInput}`}
              style={{ "--h": isMobile ? "44px" : "40px" } as never}
              inputMode="decimal"
              value={budgetInput}
              placeholder="0.00"
              onChange={(e) => setBudgetInput(e.target.value)}
            />
            <Button onClick={handleBudgetSave} loading={budgetSaving} style={{ "--h": isMobile ? "44px" : "40px" } as never}>
              Save
            </Button>
          </div>
          {hasBudget ? (
            <div className={styles.budgetFoot}>
              <span className={styles.note}>Current limit: {formatMoney(budgetQuery.data?.amount ?? 0, user.currency)}</span>
              <button type="button" className={styles.linkDanger} onClick={() => setBudgetConfirm(true)}>
                Remove budget
              </button>
            </div>
          ) : (
            <div className={styles.note}>No budget set yet.</div>
          )}
        </>
      )}
    </Card>
  );

  return (
    <>
      <MobileHeader back title="Settings" />
      <Page>
        <PageHeader title="Settings" />
        {isMobile ? (
          <div className={styles.mobileStack}>
            <Card radius="lg" gap="14px">
              <div className={styles.mHead}>
                <Avatar initials={user.initials} size={40} />
                <div className={styles.mHeadText}>
                  <div className={styles.mName}>{user.name}</div>
                  <div className={styles.mEmail}>{user.email || "Not set"}</div>
                </div>
              </div>
              <div className={styles.divider} />
              <div className={styles.row}>
                <span className={styles.rowLabel}>Telegram</span>
                <span className={`${styles.rowValue} mono`}>@{user.username}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>Currency</span>
                {currencySelect}
              </div>
              <div className={styles.note}>All amounts are stored in EUR.</div>
            </Card>
            {budgetCard}
            {passkeysCard}
            <Card radius="lg" gap="12px">
              <CardTitle>Data</CardTitle>
              {dataText}
              {exportButton}
            </Card>
            <Button variant="danger" icon="log-out" full style={{ "--h": "44px" } as never} onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        ) : (
          <div className={styles.grid}>
            <div className={styles.col}>
              <Card radius="md" gap="18px">
                <CardTitle>Account</CardTitle>
                <div className={styles.rows}>
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>Name</span>
                    <span className={styles.rowValue}>{user.name}</span>
                  </div>
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>Email</span>
                    <span className={[styles.rowValue, !user.email ? "text-muted" : ""].filter(Boolean).join(" ")}>{user.email || "Not set"}</span>
                  </div>
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>Telegram</span>
                    <span className={`${styles.rowValue} mono`}>@{user.username}</span>
                  </div>
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>Currency</span>
                    {currencySelect}
                  </div>
                </div>
                <div className={styles.note}>All amounts are stored in EUR.</div>
              </Card>
              {budgetCard}
              <Card radius="md" gap="14px">
                <CardTitle>Data</CardTitle>
                {dataText}
                {exportButton}
              </Card>
            </div>
            <div className={styles.col}>
              {passkeysCard}
              <Card radius="md" gap="14px">
                <CardTitle>Session</CardTitle>
                <div className={styles.text}>Signed in on this device. Sessions expire after 30 days.</div>
                <Button variant="danger" icon="log-out" onClick={handleSignOut} style={{ alignSelf: "flex-start" }}>
                  Sign out
                </Button>
              </Card>
            </div>
          </div>
        )}
      </Page>
      <ConfirmDialog
        open={budgetConfirm}
        title="Remove budget"
        message="This deletes your monthly limit. You can set a new one at any time."
        confirmLabel="Remove"
        danger
        busy={budgetRemoving}
        onConfirm={handleBudgetRemove}
        onCancel={() => setBudgetConfirm(false)}
      />
      <ConfirmDialog
        open={deleteId !== null}
        title="Remove passkey"
        message="This device will no longer be able to sign in with a passkey."
        confirmLabel="Remove"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </>
  );
}
