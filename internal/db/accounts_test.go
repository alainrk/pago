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
		d.conn.Exec(`DELETE FROM link_tokens WHERE tg_id = ?`, tgID)
		d.conn.Exec(`DELETE FROM users WHERE tg_id = ?`, tgID)
	})
}

func TestGoogleSignInSignupThenSub(t *testing.T) {
	d := testDB(t)
	id := GoogleIdentity{Sub: uniq("sub"), Email: uniq("new") + "@example.com", EmailVerified: true, Name: "New Person"}

	u, match, err := d.GoogleSignIn(id, nil, allowAll)
	if err != nil {
		t.Fatal(err)
	}
	dropUser(t, d, u.TgID)
	if match != GoogleMatchSignup || u.TgID >= 0 || u.Name != "New Person" {
		t.Fatalf("signup: match=%s user=%+v", match, u)
	}

	again, match, err := d.GoogleSignIn(id, nil, nil)
	if err != nil || match != GoogleMatchSub || again.TgID != u.TgID {
		t.Fatalf("second sign-in: match=%s err=%v id=%d want %d", match, err, again.TgID, u.TgID)
	}
}

func TestGoogleSignInSignupRules(t *testing.T) {
	d := testDB(t)
	_, _, err := d.GoogleSignIn(GoogleIdentity{Sub: uniq("sub"), Email: uniq("x") + "@example.com", EmailVerified: true}, nil, func(string) bool { return false })
	if !errors.Is(err, ErrSignupNotAllowed) {
		t.Fatalf("allowlist: got %v", err)
	}
	_, _, err = d.GoogleSignIn(GoogleIdentity{Sub: uniq("sub"), Email: uniq("x") + "@example.com", EmailVerified: false}, nil, allowAll)
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
	_, _, err := d.GoogleSignIn(GoogleIdentity{Sub: uniq("sub"), Email: email, EmailVerified: false}, nil, allowAll)
	if !errors.Is(err, ErrUnverifiedEmail) {
		t.Fatalf("unverified: got %v", err)
	}

	sub := uniq("sub")
	u, match, err := d.GoogleSignIn(GoogleIdentity{Sub: sub, Email: email, EmailVerified: true}, nil, nil)
	if err != nil || match != GoogleMatchEmail || u.TgID != tgID {
		t.Fatalf("email fallback: match=%s err=%v", match, err)
	}
	var stored model.User
	d.conn.Where("tg_id = ?", tgID).First(&stored)
	if stored.GoogleSub == nil || *stored.GoogleSub != sub {
		t.Fatalf("sub not stored: %+v", stored.GoogleSub)
	}

	// Another Google account with the same email cannot take the account.
	_, _, err = d.GoogleSignIn(GoogleIdentity{Sub: uniq("sub"), Email: email, EmailVerified: true}, nil, allowAll)
	if !errors.Is(err, ErrEmailTaken) {
		t.Fatalf("second google: got %v", err)
	}
}

func newHandoff(t *testing.T, d *DB, tgID int64, ttl time.Duration) string {
	t.Helper()
	tok := uniq("tok")
	if err := d.CreateLinkToken(&model.LinkToken{TgID: tgID, Purpose: model.LinkPurposeHandoff, TokenHash: hashOf(tok), ExpiresAt: time.Now().UTC().Add(ttl)}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.conn.Exec(`DELETE FROM link_tokens WHERE token_hash = ?`, hashOf(tok)) })
	return hashOf(tok)
}

func TestGoogleSignInHandoff(t *testing.T) {
	d := testDB(t)
	a := testUser(t, d)
	time.Sleep(time.Microsecond)
	b := testUser(t, d)
	email := uniq("g") + "@example.com"
	sub := uniq("sub")

	// The Google email matches nothing: the hand-off token decides.
	h := newHandoff(t, d, a, 10*time.Minute)
	u, match, err := d.GoogleSignIn(GoogleIdentity{Sub: sub, Email: email, EmailVerified: true}, &h, nil)
	if err != nil || match != GoogleMatchHandoff || u.TgID != a {
		t.Fatalf("handoff: match=%s err=%v", match, err)
	}
	if u.Email == nil || *u.Email != email {
		t.Fatalf("verified email should be stored on an account without one: %v", u.Email)
	}
	// Single use.
	if _, _, err := d.GoogleSignIn(GoogleIdentity{Sub: sub, Email: email, EmailVerified: true}, &h, nil); !errors.Is(err, ErrLinkTokenInvalid) {
		t.Fatalf("reuse: got %v", err)
	}
	// Expired.
	old := newHandoff(t, d, a, -time.Minute)
	if _, _, err := d.GoogleSignIn(GoogleIdentity{Sub: sub, Email: email, EmailVerified: true}, &old, nil); !errors.Is(err, ErrLinkTokenInvalid) {
		t.Fatalf("expired: got %v", err)
	}

	// The same Google account cannot be linked to account b: no merge, and
	// b's token stays usable.
	hb := newHandoff(t, d, b, 10*time.Minute)
	if _, _, err := d.GoogleSignIn(GoogleIdentity{Sub: sub, Email: email, EmailVerified: true}, &hb, nil); !errors.Is(err, ErrGoogleTaken) {
		t.Fatalf("other account: got %v", err)
	}
	var used int64
	d.conn.Model(&model.LinkToken{}).Where("token_hash = ? AND used_at IS NOT NULL", hb).Count(&used)
	if used != 0 {
		t.Fatal("token was used up by a refused hand-off")
	}

	// Account a cannot get a second Google account.
	ha := newHandoff(t, d, a, 10*time.Minute)
	if _, _, err := d.GoogleSignIn(GoogleIdentity{Sub: uniq("sub"), Email: uniq("h") + "@example.com", EmailVerified: true}, &ha, nil); !errors.Is(err, ErrOtherGoogleLinked) {
		t.Fatalf("second google on a: got %v", err)
	}

	// The same Google account with its own hand-off again is fine.
	ha2 := newHandoff(t, d, a, 10*time.Minute)
	if _, _, err := d.GoogleSignIn(GoogleIdentity{Sub: sub, Email: email, EmailVerified: true}, &ha2, nil); err != nil {
		t.Fatalf("same google again: %v", err)
	}
}

func TestSetUserKeepsLinks(t *testing.T) {
	d := testDB(t)
	tgID := testUser(t, d)
	var stale model.User
	d.conn.Where("tg_id = ?", tgID).First(&stale)

	sub := uniq("sub")
	h := newHandoff(t, d, tgID, time.Minute)
	if _, _, err := d.GoogleSignIn(GoogleIdentity{Sub: sub, Email: uniq("s") + "@example.com", EmailVerified: true}, &h, nil); err != nil {
		t.Fatal(err)
	}
	// The bot saves a row it loaded before the link.
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
	if _, err := d.TakeOAuthState(h); !errors.Is(err, ErrLinkTokenInvalid) {
		t.Fatalf("second take: %v", err)
	}
}
