package web

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"pago/internal/db"
	"pago/internal/migrations"
	_ "pago/internal/migrations/versions"
	"pago/internal/model"
	"pago/internal/repository"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// Full Google sign-in against a fake token endpoint and a real Postgres
// (TEST_DATABASE_URL, see internal/db).
func TestGoogleFlowEndToEnd(t *testing.T) {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	m, err := migrationConn(dbURL)
	if err != nil {
		t.Fatal(err)
	}
	if err := migrations.NewMigrator(m).MigrateUp(); err != nil {
		t.Fatal(err)
	}
	database, err := db.NewDB(dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })

	s := testGoogleServer(t)
	repo := repository.Repository{DB: database, Logger: s.logger}
	s.repositories = Repositories{Users: repository.Users{Repository: repo}, Auth: repository.Auth{Repository: repo}}
	s.google.allowedEmails = parseEmailList("")

	sub := fmt.Sprintf("sub-%d", time.Now().UnixNano())
	email := fmt.Sprintf("flow-%d@example.com", time.Now().UnixNano())
	var nonce string
	tokenSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.Form.Get("client_secret") != "new-secret" || r.Form.Get("code") != "good-code" || r.Form.Get("code_verifier") == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"id_token": jwtWith(t, map[string]any{
			"iss": "https://accounts.google.com", "aud": "new-id", "sub": sub, "email": email,
			"email_verified": true, "name": "Flow Test", "exp": time.Now().Unix() + 300, "nonce": nonce,
		})})
	}))
	defer tokenSrv.Close()
	s.google.tokenURL = tokenSrv.URL
	s.google.httpClient = tokenSrv.Client()

	run := func(body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, "/web/auth/google/start", strings.NewReader(body))
		r.Host = "api.new.example"
		r.Header.Set("Origin", "https://app.new.example")
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		s.handleGoogleStart(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("start: %d %s", w.Code, w.Body.String())
		}
		var out struct{ URL string }
		_ = json.NewDecoder(w.Body).Decode(&out)
		u, _ := url.Parse(out.URL)
		state := u.Query().Get("state")
		nonce = u.Query().Get("nonce")
		if u.Query().Get("code_challenge_method") != "S256" || state == "" || nonce == "" {
			t.Fatalf("auth url: %s", out.URL)
		}
		var cookie *http.Cookie
		for _, c := range w.Result().Cookies() {
			if c.Name == googleStateCookie {
				cookie = c
			}
		}
		cb := httptest.NewRequest(http.MethodGet, "/web/auth/google/callback?code=good-code&state="+url.QueryEscape(state), nil)
		cb.Host = "api.new.example"
		cb.AddCookie(cookie)
		cw := httptest.NewRecorder()
		s.handleGoogleCallback(cw, cb)
		return cw
	}

	// New account.
	w := run(`{"returnTo":"/reports"}`)
	if w.Code != http.StatusSeeOther || w.Header().Get("Location") != "https://app.new.example/reports" {
		t.Fatalf("signup redirect: %d %s", w.Code, w.Header().Get("Location"))
	}
	hasSession := false
	for _, c := range w.Result().Cookies() {
		if c.Name == sessionCookieName && c.Value != "" {
			hasSession = true
		}
	}
	if !hasSession {
		t.Fatal("no session cookie after Google sign-in")
	}
	u, exists, err := s.repositories.Users.GetByEmail(email)
	if err != nil || !exists || u.TgID >= 0 {
		t.Fatalf("new user: %+v %v %v", u, exists, err)
	}
	t.Cleanup(func() {
		_ = database.Transaction(func(tx *gormDB) error {
			tx.Exec(`DELETE FROM web_sessions WHERE tg_id = ?`, u.TgID)
			return tx.Exec(`DELETE FROM users WHERE tg_id = ?`, u.TgID).Error
		})
	})

	// The second sign-in finds the same account by its Google sub.
	w = run(`{"returnTo":"/"}`)
	if w.Code != http.StatusSeeOther || w.Header().Get("Location") != "https://app.new.example/" {
		t.Fatalf("second sign-in: %d %s", w.Code, w.Header().Get("Location"))
	}
	again, _, err := s.repositories.Users.GetByEmail(email)
	if err != nil || again.TgID != u.TgID {
		t.Fatalf("second sign-in made another account: %d vs %d (%v)", again.TgID, u.TgID, err)
	}
}

type gormDB = gorm.DB

func migrationConn(url string) (*gorm.DB, error) {
	return gorm.Open(postgres.Open(url), &gorm.Config{})
}

func dbServer(t *testing.T) (*Server, *db.DB) {
	t.Helper()
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	m, err := migrationConn(dbURL)
	if err != nil {
		t.Fatal(err)
	}
	if err := migrations.NewMigrator(m).MigrateUp(); err != nil {
		t.Fatal(err)
	}
	database, err := db.NewDB(dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	s := testGoogleServer(t)
	repo := repository.Repository{DB: database, Logger: s.logger}
	s.repositories = Repositories{Users: repository.Users{Repository: repo}, Auth: repository.Auth{Repository: repo}}
	return s, database
}

func TestAIConsentStored(t *testing.T) {
	s, database := dbServer(t)
	id := time.Now().UnixNano()
	_ = database.Transaction(func(tx *gormDB) error {
		return tx.Exec(`INSERT INTO users (tg_id, session) VALUES (?, '{}')`, id).Error
	})
	t.Cleanup(func() {
		_ = database.Transaction(func(tx *gormDB) error {
			return tx.Exec(`DELETE FROM users WHERE tg_id = ?`, id).Error
		})
	})

	for _, c := range []struct {
		body string
		want string
	}{{`{"accept":true}`, model.AIConsentAccepted}, {`{"accept":false}`, model.AIConsentDeclined}} {
		r := withUser(httptest.NewRequest(http.MethodPost, "/web/api/ai-consent", strings.NewReader(c.body)), &model.User{TgID: id})
		w := httptest.NewRecorder()
		s.handleAIConsent(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("consent %s: %d", c.body, w.Code)
		}
		u, err := s.repositories.Users.GetByTgID(id)
		if err != nil || u.QuickEntryChoice() != c.want || u.AIConsentAt == nil || *u.AIConsentVersion != model.AIPolicyVersion {
			t.Fatalf("stored %s: %+v %v", c.body, u, err)
		}
	}
}
