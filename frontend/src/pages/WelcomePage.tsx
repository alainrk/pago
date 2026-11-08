import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import styles from "./LoginPage.module.css";
import { Logo } from "../components/Logo";
import { Button } from "../components/Button";
import { PageLoading } from "../components/Spinner";
import { BrandLinks } from "../components/BrandLinks";
import { auth } from "../api/endpoints";
import { ApiError } from "../api/client";
import { isPasskeySupported, PasskeyCancelledError, registerPasskey, suggestPasskeyName } from "../api/webauthn";
import { useAuth } from "../auth/AuthContext";
import { googleErrorMessage, startGoogle } from "../lib/signin";

// WelcomePage is where people land after a Google sign-in when they have no
// passkey for this address yet: it offers to create one. Without a session
// it offers Google sign-in.
export function WelcomePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState<"" | "google" | "passkey">("");
  const [error, setError] = useState<string | null>(() => googleErrorMessage(params.get("error")));
  const next = params.get("next") || "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  async function onGoogle() {
    setError(null);
    setBusy("google");
    try {
      await startGoogle(auth.googleStart, "/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start Google sign-in. Try again.");
      setBusy("");
    }
  }

  async function onPasskey() {
    setError(null);
    setBusy("passkey");
    try {
      await registerPasskey(suggestPasskeyName());
      navigate(safeNext, { replace: true });
    } catch (err) {
      if (!(err instanceof PasskeyCancelledError)) {
        setError(err instanceof Error ? err.message : "Could not create the passkey. You can do it later in Settings.");
      }
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <main className={styles.screen}>
        <PageLoading />
      </main>
    );
  }

  return (
    <main className={styles.screen}>
      <div className={styles.stack}>
        <Logo size={36} />
        <div className={styles.card}>
          {user ? (
            <>
              <div className={styles.intro}>
                <h1 className={styles.title} style={{ margin: 0 }}>
                  You're in, {user.name}
                </h1>
                <div className={styles.lead}>
                  {isPasskeySupported()
                    ? "Create a passkey for this address, so next time you sign in with Face ID, Touch ID or your device PIN."
                    : "You can now use Pago here. This browser does not support passkeys, so sign in with Google next time."}
                </div>
              </div>
              <div className={styles.methods}>
                {isPasskeySupported() && (
                  <Button size="xl" icon="shield-lock" iconSize={17} full loading={busy === "passkey"} onClick={onPasskey} style={{ height: 46, fontSize: 14.5, borderRadius: "var(--r-lg)" }}>
                    Create a passkey
                  </Button>
                )}
                <Button size="xl" variant="secondary" full onClick={() => navigate(safeNext, { replace: true })} style={{ height: 46, fontSize: 14.5, borderRadius: "var(--r-lg)" }}>
                  {isPasskeySupported() ? "Not now" : "Continue"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className={styles.intro}>
                <h1 className={styles.title} style={{ margin: 0 }}>
                  Welcome to Pago
                </h1>
                <div className={styles.lead}>Sign in with Google. If you already use Pago with the same email, we find your account.</div>
              </div>
              <div className={styles.methods}>
                <Button size="xl" full loading={busy === "google"} onClick={onGoogle} style={{ height: 46, fontSize: 14.5, borderRadius: "var(--r-lg)" }}>
                  Continue with Google
                </Button>
              </div>
            </>
          )}
          {error && (
            <div role="alert" className={styles.error}>
              {error}
            </div>
          )}
        </div>
        <BrandLinks style={{ marginTop: 16 }} />
      </div>
    </main>
  );
}
