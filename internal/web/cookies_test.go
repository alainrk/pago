package web

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseSameSite(t *testing.T) {
	cases := map[string]http.SameSite{
		"":       http.SameSiteLaxMode,
		"lax":    http.SameSiteLaxMode,
		"LAX":    http.SameSiteLaxMode,
		"none":   http.SameSiteNoneMode,
		" None ": http.SameSiteNoneMode,
		"strict": http.SameSiteStrictMode,
		"bogus":  http.SameSiteLaxMode,
	}
	for in, want := range cases {
		if got := parseSameSite(in); got != want {
			t.Errorf("parseSameSite(%q) = %v; want %v", in, got, want)
		}
	}
}

func TestSetCookieNoneForcesSecure(t *testing.T) {
	t.Setenv("WEB_COOKIE_SAMESITE", "none")
	r := httptest.NewRequest(http.MethodPost, "/web/auth/verify", nil) // plain http request
	w := httptest.NewRecorder()
	setSessionCookie(w, r, "abc")
	cookies := w.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("want 1 cookie, got %d", len(cookies))
	}
	c := cookies[0]
	if c.Name != sessionCookieName || c.Value != "abc" || !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteNoneMode || c.MaxAge != sessionCookieAge {
		t.Fatalf("unexpected cookie: %+v", c)
	}
}

func TestSetCookieLaxBehindProxy(t *testing.T) {
	t.Setenv("WEB_COOKIE_SAMESITE", "")
	r := httptest.NewRequest(http.MethodPost, "/web/auth/verify", nil)
	r.Header.Set("X-Forwarded-Proto", "https")
	w := httptest.NewRecorder()
	setSessionCookie(w, r, "abc")
	c := w.Result().Cookies()[0]
	if !c.Secure || c.SameSite != http.SameSiteLaxMode {
		t.Fatalf("unexpected cookie: %+v", c)
	}
}

func TestClearCookie(t *testing.T) {
	r := httptest.NewRequest(http.MethodPost, "/web/logout", nil)
	w := httptest.NewRecorder()
	clearSessionCookie(w, r)
	c := w.Result().Cookies()[0]
	if c.Value != "" || c.MaxAge != -1 {
		t.Fatalf("cookie not cleared: %+v", c)
	}
}
