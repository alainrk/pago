package web

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseAllowedOrigins(t *testing.T) {
	got := parseAllowedOrigins(" https://app.example.com/, http://localhost:5174 ,, ")
	if len(got) != 2 || !got["https://app.example.com"] || !got["http://localhost:5174"] {
		t.Fatalf("unexpected origins: %v", got)
	}
	if len(parseAllowedOrigins("")) != 0 {
		t.Fatal("empty value should allow nothing")
	}
}

func TestCORSHandler(t *testing.T) {
	allowed := parseAllowedOrigins("https://app.example.com")
	okHandler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h := corsHandler(allowed, okHandler)

	t.Run("allowed origin gets headers", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodGet, "/web/api/me", nil)
		r.Header.Set("Origin", "https://app.example.com")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("status %d", w.Code)
		}
		if w.Header().Get("Access-Control-Allow-Origin") != "https://app.example.com" ||
			w.Header().Get("Access-Control-Allow-Credentials") != "true" ||
			w.Header().Get("Vary") != "Origin" {
			t.Fatalf("missing CORS headers: %v", w.Header())
		}
	})

	t.Run("preflight from allowed origin", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodOptions, "/web/api/me", nil)
		r.Header.Set("Origin", "https://app.example.com")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusNoContent {
			t.Fatalf("status %d", w.Code)
		}
		if w.Header().Get("Access-Control-Allow-Methods") == "" || w.Header().Get("Access-Control-Allow-Headers") == "" {
			t.Fatalf("missing preflight headers: %v", w.Header())
		}
	})

	t.Run("unknown origin gets nothing", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodGet, "/web/api/me", nil)
		r.Header.Set("Origin", "https://evil.example.com")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("status %d", w.Code)
		}
		if w.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatal("unknown origin must not be allowed")
		}
	})

	t.Run("preflight from unknown origin is refused", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodOptions, "/web/api/me", nil)
		r.Header.Set("Origin", "https://evil.example.com")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusForbidden {
			t.Fatalf("status %d", w.Code)
		}
	})

	t.Run("same-origin request untouched", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodGet, "/web/api/me", nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusOK || w.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Fatalf("unexpected: %d %v", w.Code, w.Header())
		}
	})
}
