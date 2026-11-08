import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import styles from "./LoginPage.module.css";
import { Logo } from "../components/Logo";
import { Button } from "../components/Button";
import { auth } from "../api/endpoints";
import { ApiError } from "../api/client";
import { isPasskeySupported, loginWithPasskey, PasskeyCancelledError } from "../api/webauthn";
import { useAuth } from "../auth/AuthContext";
import { BrandLinks } from "../components/BrandLinks";
import type { AuthMethods } from "../api/types";
import { googleErrorMessage, startGoogle } from "../lib/signin";

type Step = "start" | "code";

// Sign-in on the new address: Google or a passkey. Sign-up: Google only.
// On the old address, during the move, the old email code still works (and
// there is no Google there).

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const from = (location.state as { from?: string } | null)?.from;
  const [params] = useSearchParams();

  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [step, setStep] = useState<Step>("start");
  const [codeEmail, setCodeEmail] = useState("");
  // Legacy code channel on the old address: Telegram username or email.
  const [codeVia, setCodeVia] = useState<"telegram" | "email">("telegram");
  const [tgUsername, setTgUsername] = useState("");
  const [code, setCode] = useState("");
  const [passkeyEmail, setPasskeyEmail] = useState("");
  const [askEmail, setAskEmail] = useState(false);
  const [busy, setBusy] = useState<"" | "passkey" | "code" | "verify" | "google">("");
  const [error, setError] = useState<string | null>(() => googleErrorMessage(params.get("error")));
  const [notice, setNotice] = useState<string | null>(null);
  const passkeyOk = isPasskeySupported();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  useEffect(() => {
    let cancelled = false;
    auth
      .methods()
      .then((m) => {
        if (!cancelled) setMethods(m);
      })
      .catch(() => {
        // Older server without this endpoint: show passkeys only.
        if (!cancelled) setMethods({ google: false, email: false, telegram: false, passkey: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onGoogle() {
    setError(null);
    setNotice(null);
    setBusy("google");
    try {
      await startGoogle(auth.googleStart, from && from !== "/login" ? from : "/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start Google sign-in. Try again.");
      setBusy("");
    }
  }

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
        setError(methods?.google ? "Passkey sign-in failed. Try again or continue with Google." : "Passkey sign-in failed. Try again.");
      }
    } finally {
      setBusy("");
    }
  }

  async function onSendCode(e: FormEvent) {
    e.preventDefault();
    const viaTelegram = codeVia === "telegram";
    const clean = viaTelegram ? tgUsername.trim().replace(/^@/, "") : codeEmail.trim().toLowerCase();
    if (!clean || (!viaTelegram && !clean.includes("@"))) {
      setError(viaTelegram ? "Enter your Telegram username." : "Enter the email of your Pago account.");
      return;
    }
    setError(null);
    setNotice(null);
    setBusy("code");
    try {
      if (viaTelegram) await auth.requestTelegramCode(clean);
      else await auth.requestCode(clean);
      setStep("code");
      setNotice(viaTelegram ? "If that username has a Pago account, a code is on its way on Telegram." : "If that email has a Pago account, a code is on its way.");
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
            {methods?.google && (
              <>
                <Button size="xl" variant="primary" full loading={busy === "google"} onClick={onGoogle} style={{ height: 46, fontSize: 14.5, borderRadius: "var(--r-lg)" }}>
                  Continue with Google
                </Button>
                {passkeyOk && <div className={styles.or}>or</div>}
              </>
            )}

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
                <Button
                  size="xl"
                  variant={methods?.google ? "secondary" : "primary"}
                  icon="shield-lock"
                  iconSize={17}
                  full
                  loading={busy === "passkey"}
                  onClick={onPasskey}
                  style={{ height: 46, fontSize: 14.5, borderRadius: "var(--r-lg)" }}
                >
                  Sign in with a passkey
                </Button>
              </>
            )}

            {(methods?.email || methods?.telegram) && (
              <>
                {passkeyOk && <div className={styles.or}>or</div>}
                {step === "start" ? (
                  <form className={styles.tg} onSubmit={onSendCode}>
                    {methods?.email && methods?.telegram && (
                      <div className={styles.hint}>
                        Get a code by{" "}
                        <button type="button" className={styles.linkBtn} onClick={() => setCodeVia(codeVia === "telegram" ? "email" : "telegram")}>
                          {codeVia === "telegram" ? "email instead" : "Telegram instead"}
                        </button>
                      </div>
                    )}
                    {(codeVia === "telegram" && methods?.telegram) || !methods?.email ? (
                      <>
                        <label className={styles.tgLabel} htmlFor="tg-username">
                          Get a code on Telegram
                        </label>
                        <div className={styles.row}>
                          <input
                            id="tg-username"
                            className={`input ${styles.input}`}
                            placeholder="@username"
                            autoComplete="username"
                            autoCapitalize="none"
                            value={tgUsername}
                            onChange={(e) => {
                              setCodeVia("telegram");
                              setTgUsername(e.target.value);
                            }}
                          />
                          <Button type="submit" variant="secondary" size="xl" loading={busy === "code"} style={{ height: 44, fontSize: 13.5 }}>
                            Send code
                          </Button>
                        </div>
                        <div className={styles.hint}>We'll message you a 6-character code on Telegram.</div>
                      </>
                    ) : (
                      <>
                        <label className={styles.tgLabel} htmlFor="code-email">
                          Get a code by email
                        </label>
                        <div className={styles.row}>
                          <input
                            id="code-email"
                            className={`input ${styles.input}`}
                            type="email"
                            placeholder="you@example.com"
                            autoComplete="email"
                            autoCapitalize="none"
                            value={codeEmail}
                            onChange={(e) => {
                              setCodeVia("email");
                              setCodeEmail(e.target.value);
                            }}
                          />
                          <Button type="submit" variant="secondary" size="xl" loading={busy === "code"} style={{ height: 44, fontSize: 13.5 }}>
                            Send code
                          </Button>
                        </div>
                        <div className={styles.hint}>We'll email you a 6-character code.</div>
                      </>
                    )}
                  </form>
                ) : (
                  <form className={styles.tg} onSubmit={onVerify}>
                    <label className={styles.tgLabel} htmlFor="email-code">
                      Enter the code we sent to {codeVia === "telegram" ? `@${tgUsername.trim().replace(/^@/, "")}` : codeEmail.trim()}
                    </label>
                    <div className={styles.row}>
                      <input
                        id="email-code"
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
                        Start again
                      </button>
                    </div>
                  </form>
                )}
              </>
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
            {passkeyOk
              ? "Passkeys use Face ID, Touch ID or your device PIN. No passwords."
              : methods?.google
                ? "This browser does not support passkeys. Continue with Google instead."
                : "This browser does not support passkeys."}
          </div>
        </div>
        {methods?.google && <div className={styles.below}>New to Pago? Continue with Google to create your account.</div>}
        <BrandLinks style={{ marginTop: 16 }} />
      </div>
    </main>
  );
}
