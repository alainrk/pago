// Small helpers for Google sign-in.

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
    default:
      return "Google sign-in did not work. Please try again.";
  }
}

// startGoogle asks the server for the Google URL and goes there.
export async function startGoogle(start: (returnTo: string) => Promise<{ url: string }>, returnTo: string) {
  const { url } = await start(returnTo);
  window.location.assign(url);
}
