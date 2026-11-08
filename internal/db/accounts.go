package db

import (
	"errors"
	"strings"
	"time"

	"pago/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// Errors from the Google sign-in. They are safe to map
// to a message for the user.
var (
	// ErrGoogleTaken: this Google account already belongs to another Pago
	// account. Accounts are never merged.
	ErrGoogleTaken = errors.New("this Google account is linked to another Pago account")
	// ErrOtherGoogleLinked: the Pago account already has a different Google
	// account.
	ErrOtherGoogleLinked = errors.New("this Pago account is linked to another Google account")
	// ErrEmailTaken: the verified Google email belongs to a Pago account that
	// is already linked to another Google account.
	ErrEmailTaken = errors.New("this email belongs to another Pago account")
	// ErrSignupNotAllowed: no account matched and the allowlist refused a new one.
	ErrSignupNotAllowed = errors.New("new accounts are not open for this Google account")
	// ErrUnverifiedEmail: Google did not verify the email, so it cannot be
	// used to find or create an account.
	ErrUnverifiedEmail = errors.New("the Google email is not verified")
	// ErrStateInvalid: unknown, used or expired Google sign-in state.
	ErrStateInvalid = errors.New("invalid or expired sign-in state")
)

// GoogleIdentity is what Google told us about the person signing in.
type GoogleIdentity struct {
	Sub           string
	Email         string // lower case
	EmailVerified bool
	Name          string
}

// How a Google sign-in found its account.
const (
	GoogleMatchSub    = "sub"
	GoogleMatchEmail  = "email"
	GoogleMatchSignup = "signup"
)

// GoogleSignIn finds or creates the account for a Google identity, in one
// database transaction:
//
//  1. An account with this sub.
//  2. An account with this verified email and no sub yet: store the sub.
//  3. Otherwise a new account, if allowSignup says yes. Only verified emails
//     can sign up.
//
// An unverified email is never used to find or create an account.
func (db *DB) GoogleSignIn(id GoogleIdentity, allowSignup func(email string) bool) (*model.User, string, error) {
	var user model.User
	var match string
	err := db.conn.Transaction(func(tx *gorm.DB) error {
		var bySub model.User
		found := tx.Where("google_sub = ?", id.Sub).Limit(1).Find(&bySub)
		if found.Error != nil {
			return found.Error
		}
		hasSub := found.RowsAffected > 0

		if hasSub {
			user, match = bySub, GoogleMatchSub
			return nil
		}

		if !id.EmailVerified || id.Email == "" {
			return ErrUnverifiedEmail
		}

		var byEmail model.User
		found = tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("lower(email) = ?", id.Email).Limit(1).Find(&byEmail)
		if found.Error != nil {
			return found.Error
		}
		if found.RowsAffected > 0 {
			if byEmail.GoogleSub != nil {
				return ErrEmailTaken
			}
			if err := linkGoogle(tx, &byEmail, id); err != nil {
				return err
			}
			user, match = byEmail, GoogleMatchEmail
			return nil
		}

		if allowSignup == nil || !allowSignup(id.Email) {
			return ErrSignupNotAllowed
		}
		created, err := createGoogleUser(tx, id)
		if err != nil {
			return err
		}
		user, match = *created, GoogleMatchSignup
		return nil
	})
	if err != nil {
		return nil, "", err
	}
	return &user, match, nil
}

// linkGoogle stores the sub on the account (found by its email) and the
// Google name as display name.
func linkGoogle(tx *gorm.DB, u *model.User, id GoogleIdentity) error {
	updates := map[string]any{"google_sub": id.Sub}
	// The display name of old accounts came from Telegram. Use the Google
	// name instead, so the Telegram names can be cleared later.
	if name := strings.TrimSpace(id.Name); name != "" {
		updates["name"] = name
		u.Name = name
	}
	if err := tx.Model(&model.User{}).Where("tg_id = ?", u.TgID).Updates(updates).Error; err != nil {
		return err
	}
	sub := id.Sub
	u.GoogleSub = &sub
	return nil
}

// createGoogleUser creates a web account with a negative id.
func createGoogleUser(tx *gorm.DB, id GoogleIdentity) (*model.User, error) {
	var newID int64
	if err := tx.Raw(`SELECT nextval('users_web_id_seq')`).Scan(&newID).Error; err != nil {
		return nil, err
	}
	email := id.Email
	sub := id.Sub
	name := strings.TrimSpace(id.Name)
	if name == "" {
		name = strings.Split(email, "@")[0]
	}
	u := &model.User{
		TgID:      newID,
		Name:      name,
		Email:     &email,
		GoogleSub: &sub,
		Session:   model.UserSession{State: model.StateStart},
	}
	if err := tx.Create(u).Error; err != nil {
		return nil, err
	}
	return u, nil
}

// CreateOAuthState stores the state of a Google sign-in.
func (db *DB) CreateOAuthState(s *model.OAuthState) error {
	return db.conn.Create(s).Error
}

// TakeOAuthState returns and deletes a state that has not expired, so each
// state works once.
func (db *DB) TakeOAuthState(stateHash string) (*model.OAuthState, error) {
	var rows []model.OAuthState
	if err := db.conn.Raw(`DELETE FROM oauth_states WHERE state_hash = ? AND expires_at > ? RETURNING *`,
		stateHash, time.Now().UTC()).Scan(&rows).Error; err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, ErrStateInvalid
	}
	return &rows[0], nil
}
