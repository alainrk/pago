import { useEffect, useState } from "react";
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

// Sign-in: Google or a passkey. Sign-up: Google only.

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const from = (location.state as { from?: string } | null)?.from;
  const [params] = useSearchParams();

  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [passkeyEmail, setPasskeyEmail] = useState("");
  const [askEmail, setAskEmail] = useState(false);
  const [busy, setBusy] = useState<"" | "passkey" | "google">("");
  const [error, setError] = useState<string | null>(() => googleErrorMessage(params.get("error")));
  const [notice, setNotice] = useState<string | null>(null);
  const passkeyOk = isPasskeySupported();

  useEffect(() => {
    let cancelled = false;
    auth
      .methods()
      .then((m) => {
        if (!cancelled) setMethods(m);
      })
      .catch(() => {
        // Older server without this endpoint: show passkeys only.
        if (!cancelled) setMethods({ google: false, passkey: true });
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
