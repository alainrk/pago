package web

import (
	"net/http"
	"os"
	"strings"
)

const (
	sessionCookieName  = "session_id"
	webauthnCookieName = "webauthn_session"
	sessionCookieAge   = 30 * 24 * 60 * 60 // 30 days, in seconds
	webauthnCookieAge  = 5 * 60            // 5 minutes, in seconds
)

// cookieSameSite reads WEB_COOKIE_SAMESITE. "lax" is the default and works when
// the frontend and the API share a registrable domain (app.example.com and
// api.example.com). Use "none" when they live on unrelated domains; browsers
// then require the Secure flag, which setCookie enforces.
func cookieSameSite() http.SameSite {
	return parseSameSite(os.Getenv("WEB_COOKIE_SAMESITE"))
}

func parseSameSite(raw string) http.SameSite {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "none":
		return http.SameSiteNoneMode
	case "strict":
		return http.SameSiteStrictMode
	default:
		return http.SameSiteLaxMode
	}
}

// setCookie writes an HttpOnly cookie with the configured SameSite policy.
// maxAge <= 0 deletes the cookie.
func setCookie(w http.ResponseWriter, r *http.Request, name, value string, maxAge int) {
	sameSite := cookieSameSite()
	secure := isSecureRequest(r)
	if sameSite == http.SameSiteNoneMode {
		// SameSite=None cookies are rejected by browsers unless Secure is set.
		secure = true
	}
	if maxAge <= 0 {
		maxAge = -1
	}
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
		MaxAge:   maxAge,
	})
}

func setSessionCookie(w http.ResponseWriter, r *http.Request, sessionID string) {
	setCookie(w, r, sessionCookieName, sessionID, sessionCookieAge)
}

func clearSessionCookie(w http.ResponseWriter, r *http.Request) {
	setCookie(w, r, sessionCookieName, "", -1)
}

func setWebAuthnCookie(w http.ResponseWriter, r *http.Request, sessionID string) {
	setCookie(w, r, webauthnCookieName, sessionID, webauthnCookieAge)
}

func clearWebAuthnCookie(w http.ResponseWriter, r *http.Request) {
	setCookie(w, r, webauthnCookieName, "", -1)
}
