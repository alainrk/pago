package web

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestExtractBearerToken(t *testing.T) {
	cases := []struct {
		header string
		want   string
		ok     bool
	}{
		{"", "", false},
		{"Bearer abc123", "abc123", true},
		{"bearer abc123", "abc123", true},
		{"  Bearer    spaced-token  ", "", false}, // leading whitespace breaks prefix match
		{"Bearer ", "", true},                     // present-but-empty token is still bearer-shaped (treated as invalid by repo)
		{"Basic Zm9vOmJhcg==", "", false},
	}
	for _, c := range cases {
		r := httptest.NewRequest(http.MethodGet, "/web/api/stats", nil)
		if c.header != "" {
			r.Header.Set("Authorization", c.header)
		}
		got, ok := extractBearerToken(r)
		if ok != c.ok || got != c.want {
			t.Errorf("extractBearerToken(%q) = (%q,%v); want (%q,%v)", c.header, got, ok, c.want, c.ok)
		}
	}
}

func TestIsAPIRequest(t *testing.T) {
	cases := []struct {
		path   string
		accept string
		want   bool
	}{
		{"/web/api/stats", "", true},
		{"/web/dashboard", "", false},
		{"/web/dashboard", "application/json", true},
		{"/web/dashboard", "text/html", false},
		{"/web/login", "", false},
	}
	for _, c := range cases {
		r := httptest.NewRequest(http.MethodGet, c.path, nil)
		if c.accept != "" {
			r.Header.Set("Accept", c.accept)
		}
		if got := isAPIRequest(r); got != c.want {
			t.Errorf("isAPIRequest(path=%q, accept=%q) = %v; want %v", c.path, c.accept, got, c.want)
		}
	}
}

func TestClientIP(t *testing.T) {
	cases := []struct {
		name   string
		remote string
		realIP string
		want   string
	}{
		{"behind Caddy", "172.18.0.3:35810", "203.0.113.7", "203.0.113.7"},
		{"behind Caddy, IPv6 visitor", "172.18.0.3:35810", "2001:db8::1", "2001:db8::1"},
		{"behind Caddy, no header", "172.18.0.3:35810", "", "172.18.0.3"},
		{"behind Caddy, bad header", "172.18.0.3:35810", "not-an-ip", "172.18.0.3"},
		{"direct caller cannot fake it", "198.51.100.9:4000", "203.0.113.7", "198.51.100.9"},
		{"loopback", "127.0.0.1:5000", "203.0.113.8", "203.0.113.8"},
	}
	for _, c := range cases {
		r := httptest.NewRequest(http.MethodGet, "/web/auth/google/start", nil)
		r.RemoteAddr = c.remote
		if c.realIP != "" {
			r.Header.Set("X-Real-IP", c.realIP)
		}
		if got := clientIP(r); got != c.want {
			t.Errorf("%s: clientIP = %q; want %q", c.name, got, c.want)
		}
	}
}

// Two visitors behind the same Caddy connection must not share a limit.
func TestRateLimitIsPerVisitor(t *testing.T) {
	s := &Server{loginLimiter: make(map[string]*limiterEntry)}
	h := s.rateLimit(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })

	call := func(ip string) int {
		r := httptest.NewRequest(http.MethodPost, "/web/auth/google/start", nil)
		r.RemoteAddr = "172.18.0.3:35810"
		r.Header.Set("X-Real-IP", ip)
		w := httptest.NewRecorder()
		h(w, r)
		return w.Code
	}

	for i := range 5 {
		if code := call("203.0.113.1"); code != http.StatusOK {
			t.Fatalf("request %d from first visitor: got %d", i+1, code)
		}
	}
	if code := call("203.0.113.1"); code != http.StatusTooManyRequests {
		t.Fatalf("6th request from first visitor: got %d, want 429", code)
	}
	if code := call("203.0.113.2"); code != http.StatusOK {
		t.Fatalf("second visitor was limited too: got %d", code)
	}
}

func TestIdleLimitersAreDropped(t *testing.T) {
	s := &Server{loginLimiter: make(map[string]*limiterEntry)}
	s.getLimiter("ip:203.0.113.1")
	s.loginLimiter["ip:203.0.113.1"].lastSeen = time.Now().Add(-limiterIdle - time.Minute)
	s.limitersPruned = time.Time{}

	s.getLimiter("ip:203.0.113.2")
	if _, ok := s.loginLimiter["ip:203.0.113.1"]; ok {
		t.Fatal("idle limiter was not dropped")
	}
	if _, ok := s.loginLimiter["ip:203.0.113.2"]; !ok {
		t.Fatal("new limiter is missing")
	}
}
