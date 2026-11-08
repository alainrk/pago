package db

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"testing"
	"time"

	"pago/internal/model"
)

func uniq(prefix string) string {
	return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
}

func hashOf(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func allowAll(string) bool { return true }

// dropUser removes a user created by GoogleSignIn when the test ends.
func dropUser(t *testing.T, d *DB, tgID int64) {
	t.Cleanup(func() {
		d.conn.Exec(`DELETE FROM users WHERE tg_id = ?`, tgID)
	})
}

func TestGoogleSignInSignupThenSub(t *testing.T) {
	d := testDB(t)
	id := GoogleIdentity{Sub: uniq("sub"), Email: uniq("new") + "@example.com", EmailVerified: true, Name: "New Person"}

	u, match, err := d.GoogleSignIn(id, allowAll)
	if err != nil {
		t.Fatal(err)
	}
	dropUser(t, d, u.TgID)
	if match != GoogleMatchSignup || u.TgID >= 0 || u.Name != "New Person" {
		t.Fatalf("signup: match=%s user=%+v", match, u)
	}

	again, match, err := d.GoogleSignIn(id, nil)
	if err != nil || match != GoogleMatchSub || again.TgID != u.TgID {
		t.Fatalf("second sign-in: match=%s err=%v id=%d want %d", match, err, again.TgID, u.TgID)
	}
}

func TestGoogleSignInSignupRules(t *testing.T) {
	d := testDB(t)
	_, _, err := d.GoogleSignIn(GoogleIdentity{Sub: uniq("sub"), Email: uniq("x") + "@example.com", EmailVerified: true}, func(string) bool { return false })
	if !errors.Is(err, ErrSignupNotAllowed) {
		t.Fatalf("allowlist: got %v", err)
	}
	_, _, err = d.GoogleSignIn(GoogleIdentity{Sub: uniq("sub"), Email: uniq("x") + "@example.com", EmailVerified: false}, allowAll)
	if !errors.Is(err, ErrUnverifiedEmail) {
		t.Fatalf("unverified: got %v", err)
	}
}

func TestGoogleSignInEmailFallback(t *testing.T) {
	d := testDB(t)
	tgID := testUser(t, d)
	email := uniq("old") + "@example.com"
	d.conn.Exec(`UPDATE users SET email = ? WHERE tg_id = ?`, email, tgID)

	// Unverified email never links.
	_, _, err := d.GoogleSignIn(GoogleIdentity{Sub: uniq("sub"), Email: email, EmailVerified: false}, allowAll)
	if !errors.Is(err, ErrUnverifiedEmail) {
		t.Fatalf("unverified: got %v", err)
	}

	sub := uniq("sub")
	u, match, err := d.GoogleSignIn(GoogleIdentity{Sub: sub, Email: email, EmailVerified: true, Name: "Google Name"}, nil)
	if err != nil || match != GoogleMatchEmail || u.TgID != tgID {
		t.Fatalf("email fallback: match=%s err=%v", match, err)
	}
	var stored model.User
	d.conn.Where("tg_id = ?", tgID).First(&stored)
	if stored.GoogleSub == nil || *stored.GoogleSub != sub {
		t.Fatalf("sub not stored: %+v", stored.GoogleSub)
	}
	if stored.Name != "Google Name" {
		t.Fatalf("the Google name should replace the old one: %q", stored.Name)
	}

	// Another Google account with the same email cannot take the account.
	_, _, err = d.GoogleSignIn(GoogleIdentity{Sub: uniq("sub"), Email: email, EmailVerified: true}, allowAll)
	if !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("second google: got %v", err)
	}
}

func TestSetUserKeepsLinks(t *testing.T) {
	d := testDB(t)
	tgID := testUser(t, d)
	var stale model.User
	d.conn.Where("tg_id = ?", tgID).First(&stale)

	email := uniq("s") + "@example.com"
	d.conn.Exec(`UPDATE users SET email = ? WHERE tg_id = ?`, email, tgID)
	d.conn.Where("tg_id = ?", tgID).First(&stale)

	sub := uniq("sub")
	if _, _, err := d.GoogleSignIn(GoogleIdentity{Sub: sub, Email: email, EmailVerified: true}, nil); err != nil {
		t.Fatal(err)
	}
	// Some code saves a row it loaded before the link.
	stale.Name = "changed"
	if err := d.SetUser(&stale); err != nil {
		t.Fatal(err)
	}
	var now model.User
	d.conn.Where("tg_id = ?", tgID).First(&now)
	if now.GoogleSub == nil || *now.GoogleSub != sub || now.Name != "changed" {
		t.Fatalf("link lost or name not saved: %+v", now)
	}
}

func TestTakeOAuthStateOnce(t *testing.T) {
	d := testDB(t)
	h := hashOf(uniq("state"))
	if err := d.CreateOAuthState(&model.OAuthState{StateHash: h, Nonce: "n", CodeVerifier: "v", RedirectURL: "https://api/cb",
		ReturnOrigin: "https://app", ReturnPath: "/", ExpiresAt: time.Now().UTC().Add(time.Minute)}); err != nil {
		t.Fatal(err)
	}
	st, err := d.TakeOAuthState(h)
	if err != nil || st.Nonce != "n" || st.ReturnOrigin != "https://app" {
		t.Fatalf("take: %v %+v", err, st)
	}
	if _, err := d.TakeOAuthState(h); !errors.Is(err, ErrStateInvalid) {
		t.Fatalf("second take: %v", err)
	}
}
