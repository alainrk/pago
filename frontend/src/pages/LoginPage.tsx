import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import styles from "./LoginPage.module.css";
import { Logo } from "../components/Logo";
import { Button } from "../components/Button";
import { auth } from "../api/endpoints";
import { ApiError } from "../api/client";
import { isPasskeySupported, loginWithPasskey, PasskeyCancelledError } from "../api/webauthn";
import { useAuth } from "../auth/AuthContext";

type Step = "start" | "code";

const USERNAME_KEY = "cashout.telegram-username";

function readSavedUsername(): string {
  try {
    return window.localStorage.getItem(USERNAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveUsername(value: string) {
  try {
    window.localStorage.setItem(USERNAME_KEY, value);
  } catch {
    // Storage can be unavailable (private mode). Remembering is only a convenience.
  }
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const from = (location.state as { from?: string } | null)?.from;

  const [step, setStep] = useState<Step>("start");
  const [username, setUsername] = useState(readSavedUsername);
  const [code, setCode] = useState("");
  const [passkeyEmail, setPasskeyEmail] = useState("");
  const [askEmail, setAskEmail] = useState(false);
  const [busy, setBusy] = useState<"" | "passkey" | "code" | "verify">("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const passkeyOk = isPasskeySupported();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function finishLogin() {
    await refresh();
    navigate(from && from !== "/login" ? from : "/", { replace: true });
  }

  async function onPasskey() {
    setError(null);
    setNotice(null);
    setBusy("passkey");
    try {
      await loginWithPasskey(askEmail ? passkeyEmail.trim().toLowerCase() : undefined);
      await finishLogin();
    } catch (err) {
      if (err instanceof PasskeyCancelledError) {
        // The user closed the prompt or has no passkey on this device.
        if (!askEmail) {
          setAskEmail(true);
          setNotice("No passkey picked. If your passkey is on another device, enter your email to look it up.");
        }
      } else if (err instanceof ApiError) {
        setError(err.message);
        if (err.status === 401 && !askEmail) setAskEmail(true);
      } else {
        setError("Passkey sign-in failed. Try again or use a Telegram code.");
      }
    } finally {
      setBusy("");
    }
  }

  async function onSendCode(e: FormEvent) {
    e.preventDefault();
    const clean = username.trim().replace(/^@/, "");
    if (!clean) {
      setError("Enter your Telegram username.");
      return;
    }
    setError(null);
    setNotice(null);
    setBusy("code");
    try {
      await auth.requestCode(clean);
      saveUsername(clean);
      setStep("code");
      setNotice("If that username has a Cashout account, a code is on its way on Telegram.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the code. Try again.");
    } finally {
      setBusy("");
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean.length < 6) {
      setError("Enter the 6-character code.");
      return;
    }
    setError(null);
    setBusy("verify");
    try {
      await auth.verifyCode(clean);
      await finishLogin();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify the code. Try again.");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className={styles.screen}>
      <div className={styles.stack}>
        <Logo size={36} />
        <div className={styles.card}>
          <div className={styles.intro}>
            <h1 className={styles.title} style={{ margin: 0 }}>
              Welcome back
            </h1>
            <div className={styles.lead}>Sign in to your income and expense dashboard.</div>
          </div>

          <div className={styles.methods}>
            {passkeyOk && (
              <>
                {askEmail && (
                  <input
                    className={`input ${styles.input}`}
                    style={{ "--h": "44px" } as never}
                    type="email"
                    autoComplete="email webauthn"
                    placeholder="Email linked to your passkey"
                    value={passkeyEmail}
                    onChange={(e) => setPasskeyEmail(e.target.value)}
                    aria-label="Email linked to your passkey"
                  />
                )}
                <Button size="xl" icon="shield-lock" iconSize={17} full loading={busy === "passkey"} onClick={onPasskey} style={{ height: 46, fontSize: 14.5, borderRadius: "var(--r-lg)" }}>
                  Continue with a passkey
                </Button>
                <div className={styles.or}>or</div>
              </>
            )}

            {step === "start" ? (
              <form className={styles.tg} onSubmit={onSendCode}>
                <label className={styles.tgLabel} htmlFor="tg-username">
                  Sign in with Telegram
                </label>
                <div className={styles.row}>
                  <input
                    id="tg-username"
                    className={`input ${styles.input}`}
                    placeholder="@username"
                    autoComplete="username"
                    autoCapitalize="none"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                  <Button type="submit" variant="secondary" size="xl" loading={busy === "code"} style={{ height: 44, fontSize: 13.5 }}>
                    Send code
                  </Button>
                </div>
                <div className={styles.hint}>We'll message you a 6-digit code on Telegram.</div>
              </form>
            ) : (
              <form className={styles.tg} onSubmit={onVerify}>
                <label className={styles.tgLabel} htmlFor="tg-code">
                  Enter the code we sent to @{username.replace(/^@/, "")}
                </label>
                <div className={styles.row}>
                  <input
                    id="tg-code"
                    ref={codeRef}
                    className={`input is-mono ${styles.input} ${styles.code}`}
                    placeholder="••••••"
                    inputMode="text"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                  <Button type="submit" size="xl" loading={busy === "verify"} style={{ height: 44, fontSize: 13.5 }}>
                    Verify
                  </Button>
                </div>
                <div className={styles.hint}>
                  The code expires in 5 minutes.{" "}
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => {
                      setStep("start");
                      setCode("");
                      setError(null);
                      setNotice(null);
                    }}
                  >
                    Use another username
                  </button>
                </div>
              </form>
            )}

            {error && (
              <div role="alert" className={styles.error}>
                {error}
              </div>
            )}
            {notice && !error && (
              <div role="status" className={styles.success}>
                {notice}
              </div>
            )}
          </div>

          <div className={styles.foot}>
            {passkeyOk ? "Passkeys use Face ID, Touch ID or your device PIN. No passwords, no codes." : "This browser does not support passkeys. Sign in with a Telegram code instead."}
          </div>
        </div>
        <div className={styles.below}>First time here? Start the bot on Telegram to create your account.</div>
      </div>
    </main>
  );
}
