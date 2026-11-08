package web

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/sirupsen/logrus"
)

func testGoogleServer(t *testing.T) *Server {
	t.Helper()
	clients, err := parseGoogleClients("new-id", "new-secret", "https://api.new.example/web/auth/google/callback")
	if err != nil {
		t.Fatal(err)
	}
	logger := logrus.New()
	logger.SetOutput(io.Discard)
	return &Server{
		logger: logger,
		google: googleConfig{
			clients:     clients,
			corsOrigins: parseAllowedOrigins("https://app.new.example,https://app.old.example"),
		},
	}
}

func TestParseGoogleClients(t *testing.T) {
	got, err := parseGoogleClients("a, b", "sa,sb", "https://api.one.example/cb,https://API.two.example/cb")
	if err != nil || len(got) != 2 || got[1].host != "api.two.example" || got[0].Secret != "sa" {
		t.Fatalf("got %+v, %v", got, err)
	}
	if got, err := parseGoogleClients("", "", ""); err != nil || got != nil {
		t.Fatalf("empty: %+v %v", got, err)
	}
	if _, err := parseGoogleClients("a,b", "s", "https://x/cb"); err == nil {
		t.Fatal("want error for uneven lists")
	}
	if _, err := parseGoogleClients("a", "s", "not a url"); err == nil {
		t.Fatal("want error for a bad URL")
	}
	if _, err := parseGoogleClients("a,b", "s,t", "https://x/cb,https://x/cb2"); err == nil {
		t.Fatal("want error for the same host twice")
	}
}

func TestClientForPicksByHost(t *testing.T) {
	s := testGoogleServer(t)
	r := httptest.NewRequest(http.MethodGet, "/web/auth/methods", nil)
	r.Host = "api.new.example"
	if c := s.google.clientFor(r); c == nil || c.ID != "new-id" {
		t.Fatalf("new host: %+v", c)
	}
	r.Host = "api.old.example"
	if c := s.google.clientFor(r); c != nil {
		t.Fatalf("old host should have no client, got %+v", c)
	}
}

func TestAuthMethodsByHost(t *testing.T) {
	s := testGoogleServer(t)
	for host, want := range map[string]AuthMethodsResponse{
		"api.new.example": {Google: true, Email: false, Passkey: true},
		"api.old.example": {Google: false, Email: false, Passkey: true}, // no email service in this test
	} {
		r := httptest.NewRequest(http.MethodGet, "/web/auth/methods", nil)
		r.Host = host
		w := httptest.NewRecorder()
		s.handleAuthMethods(w, r)
		var got AuthMethodsResponse
		if err := json.NewDecoder(w.Body).Decode(&got); err != nil || got != want {
			t.Errorf("%s: got %+v (%v), want %+v", host, got, err, want)
		}
	}
}

func TestLegacyCodeLoginOnlyOnOldHost(t *testing.T) {
	s := testGoogleServer(t)
	r := httptest.NewRequest(http.MethodPost, "/web/auth/request", strings.NewReader(`{"email":"a@b.c"}`))
	r.Host = "api.new.example"
	w := httptest.NewRecorder()
	s.handleAuthRequest(w, r)
	if w.Code != http.StatusGone {
		t.Fatalf("new host request: %d", w.Code)
	}
	r = httptest.NewRequest(http.MethodPost, "/web/auth/verify", strings.NewReader(`{"code":"ABCDEF"}`))
	r.Host = "api.new.example"
	w = httptest.NewRecorder()
	s.handleAuthVerify(w, r)
	if w.Code != http.StatusGone {
		t.Fatalf("new host verify: %d", w.Code)
	}
}

func TestGoogleStartRejects(t *testing.T) {
	s := testGoogleServer(t)
	cases := []struct {
		name, host, origin, ctype string
		want                      int
	}{
		{"no client on old host", "api.old.example", "https://app.old.example", "application/json", http.StatusNotFound},
		{"unknown origin", "api.new.example", "https://evil.example", "application/json", http.StatusForbidden},
		{"not json", "api.new.example", "https://app.new.example", "text/plain", http.StatusUnsupportedMediaType},
	}
	for _, c := range cases {
		r := httptest.NewRequest(http.MethodPost, "/web/auth/google/start", strings.NewReader(`{}`))
		r.Host = c.host
		r.Header.Set("Origin", c.origin)
		r.Header.Set("Content-Type", c.ctype)
		w := httptest.NewRecorder()
		s.handleGoogleStart(w, r)
		if w.Code != c.want {
			t.Errorf("%s: got %d, want %d", c.name, w.Code, c.want)
		}
	}

	r := httptest.NewRequest(http.MethodPost, "/web/auth/google/start", strings.NewReader(`{"handoff":"../not-a-token"}`))
	r.Host = "api.new.example"
	r.Header.Set("Origin", "https://app.new.example")
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.handleGoogleStart(w, r)
	if w.Code != http.StatusBadRequest {
		t.Errorf("bad handoff: got %d", w.Code)
	}
}

func TestGoogleCallbackNeedsStateCookie(t *testing.T) {
	s := testGoogleServer(t)
	r := httptest.NewRequest(http.MethodGet, "/web/auth/google/callback?state=abc&code=x", nil)
	r.Host = "api.new.example"
	w := httptest.NewRecorder()
	s.handleGoogleCallback(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("no cookie: %d", w.Code)
	}
	r.AddCookie(&http.Cookie{Name: googleStateCookie, Value: "other"})
	w = httptest.NewRecorder()
	s.handleGoogleCallback(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("wrong cookie: %d", w.Code)
	}
}

func TestSafeReturnPath(t *testing.T) {
	for in, want := range map[string]string{
		"":                        "/",
		"/reports?month=2026-10":  "/reports?month=2026-10",
		"//evil.example":          "/",
		"https://evil.example":    "/",
		"/\\evil":                 "/",
		"/login":                  "/",
		"/welcome?next=/settings": "/",
	} {
		if got := safeReturnPath(in); got != want {
			t.Errorf("safeReturnPath(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestReturnOrigin(t *testing.T) {
	s := testGoogleServer(t)
	r := httptest.NewRequest(http.MethodPost, "/x", nil)
	r.Host = "api.new.example"
	r.Header.Set("Origin", "https://app.new.example/")
	if o, ok := s.google.returnOrigin(r); !ok || o != "https://app.new.example" {
		t.Fatalf("allowed origin: %q %v", o, ok)
	}
	r.Header.Set("Origin", "https://api.new.example")
	if _, ok := s.google.returnOrigin(r); !ok {
		t.Fatal("same host should be allowed")
	}
	r.Header.Del("Origin")
	if _, ok := s.google.returnOrigin(r); ok {
		t.Fatal("missing origin should be refused")
	}
}

func TestSignupAllowed(t *testing.T) {
	g := googleConfig{allowedEmails: parseEmailList("")}
	if !g.signupAllowed("anyone@example.com") {
		t.Fatal("empty list allows everyone")
	}
	g.allowedEmails = parseEmailList("Me@Example.com, you@example.com")
	if !g.signupAllowed("me@example.com") || g.signupAllowed("other@example.com") {
		t.Fatal("list not applied")
	}
}

func jwtWith(t *testing.T, claims map[string]any) string {
	t.Helper()
	b, err := json.Marshal(claims)
	if err != nil {
		t.Fatal(err)
	}
	return "e30." + base64.RawURLEncoding.EncodeToString(b) + ".sig"
}

func TestParseGoogleIDToken(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	good := map[string]any{
		"iss": "https://accounts.google.com", "aud": "cid", "sub": "123", "email": "Me@Example.com",
		"email_verified": true, "name": "Me", "exp": now.Unix() + 300, "nonce": "n1",
	}
	id, err := parseGoogleIDToken(jwtWith(t, good), "cid", "n1", now)
	if err != nil || id.Sub != "123" || id.Email != "me@example.com" || !id.EmailVerified {
		t.Fatalf("good token: %+v %v", id, err)
	}

	bad := func(key string, val any) map[string]any {
		m := map[string]any{}
		for k, v := range good {
			m[k] = v
		}
		m[key] = val
		return m
	}
	for name, claims := range map[string]map[string]any{
		"issuer":   bad("iss", "https://evil.example"),
		"audience": bad("aud", "other"),
		"expired":  bad("exp", now.Unix()-3600),
		"nonce":    bad("nonce", "n2"),
		"no sub":   bad("sub", ""),
	} {
		if _, err := parseGoogleIDToken(jwtWith(t, claims), "cid", "n1", now); err == nil {
			t.Errorf("%s: want error", name)
		}
	}

	// Audience as a list and email_verified as a string both work.
	id, err = parseGoogleIDToken(jwtWith(t, bad("aud", []string{"x", "cid"})), "cid", "n1", now)
	if err != nil || id == nil {
		t.Fatalf("aud list: %v", err)
	}
	id, err = parseGoogleIDToken(jwtWith(t, bad("email_verified", "false")), "cid", "n1", now)
	if err != nil || id.EmailVerified {
		t.Fatalf("email_verified string: %+v %v", id, err)
	}
	if _, err := parseGoogleIDToken("not.a.jwt.at.all", "cid", "n1", now); err == nil {
		t.Fatal("want error for a bad token")
	}
}
