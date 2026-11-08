// Small helpers for Google sign-in and the hand-off from the old address.

const HANDOFF_KEY = "pago.handoff";

// readHandoffToken reads "#t=<token>" from a URL hash. Only 32 hex
// characters are accepted.
export function readHandoffToken(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const t = (params.get("t") ?? "").trim().toLowerCase();
  return /^[0-9a-f]{32}$/.test(t) ? t : null;
}

// The token is kept for this tab only, until the Google sign-in returns.
export function saveHandoff(token: string) {
  try {
    window.sessionStorage.setItem(HANDOFF_KEY, token);
  } catch {
    // Storage blocked: the token still works for this page view.
  }
}

export function loadHandoff(): string | null {
  try {
    return window.sessionStorage.getItem(HANDOFF_KEY);
  } catch {
    return null;
  }
}

export function clearHandoff() {
  try {
    window.sessionStorage.removeItem(HANDOFF_KEY);
  } catch {
    // Nothing to clear.
  }
}

// googleErrorMessage turns the error code the server puts in "?error=" into
// a sentence for people.
export function googleErrorMessage(code: string | null): string | null {
  switch (code) {
    case null:
    case "":
      return null;
    case "google_cancelled":
      return "Google sign-in was cancelled. Try again when you are ready.";
    case "google_taken":
      return "This Google account already belongs to another Pago account. Use a different Google account, or write to info@faccio.app.";
    case "other_google":
      return "Your Pago account is already linked to a different Google account. Sign in with that one.";
    case "email_taken":
      return "This email belongs to a Pago account that uses a different Google account. Sign in with that one, or write to info@faccio.app.";
    case "not_allowed":
      return "New accounts are not open for this Google account yet. Write to info@faccio.app.";
    case "unverified":
      return "Google has not verified the email of this account, so we cannot use it. Verify it with Google, or use another account.";
    case "handoff_invalid":
      return "This move link has expired or was already used. Open the old Pago address and press the button again.";
    default:
      return "Google sign-in did not work. Please try again.";
  }
}

// startGoogle asks the server for the Google URL and goes there.
export async function startGoogle(start: (returnTo: string, handoff?: string) => Promise<{ url: string }>, returnTo: string, handoff?: string | null) {
  const { url } = await start(returnTo, handoff ?? undefined);
  window.location.assign(url);
}
