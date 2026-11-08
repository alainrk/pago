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
	// ErrLinkTokenInvalid: unknown, used or expired one-time token.
	ErrLinkTokenInvalid = errors.New("invalid or expired link")
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
	GoogleMatchSub     = "sub"
	GoogleMatchEmail   = "email"
	GoogleMatchHandoff = "handoff"
	GoogleMatchSignup  = "signup"
)

// GoogleSignIn finds or creates the account for a Google identity, in one
// database transaction:
//
//  1. handoffHash set (the user came from the old address with a hand-off
//     token): use the token once and link Google to the token's account,
//     even if the Google email differs. If this Google account already
//     belongs to another account, refuse (never merge) and keep the token.
//  2. An account with this sub.
//  3. An account with this verified email and no sub yet: store the sub.
//  4. Otherwise a new account, if allowSignup says yes. Only verified emails
//     can sign up.
//
// An unverified email is never used to find or create an account.
func (db *DB) GoogleSignIn(id GoogleIdentity, handoffHash *string, allowSignup func(email string) bool) (*model.User, string, error) {
	var user model.User
	var match string
	err := db.conn.Transaction(func(tx *gorm.DB) error {
		var bySub model.User
		found := tx.Where("google_sub = ?", id.Sub).Limit(1).Find(&bySub)
		if found.Error != nil {
			return found.Error
		}
		hasSub := found.RowsAffected > 0

		if handoffHash != nil {
			accountID, err := useLinkToken(tx, *handoffHash, model.LinkPurposeHandoff)
			if err != nil {
				return err
			}
			if hasSub {
				if bySub.TgID != accountID {
					return ErrGoogleTaken
				}
				user, match = bySub, GoogleMatchHandoff
				return nil
			}
			var target model.User
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("tg_id = ?", accountID).First(&target).Error; err != nil {
				return err
			}
			if target.GoogleSub != nil && *target.GoogleSub != id.Sub {
				return ErrOtherGoogleLinked
			}
			if err := linkGoogle(tx, &target, id); err != nil {
				return err
			}
			user, match = target, GoogleMatchHandoff
			return nil
		}

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

// linkGoogle stores the sub on the account, plus the verified email when the
// account has none and nobody else uses it (passkeys show it as the account
// name), and the Google name as display name.
func linkGoogle(tx *gorm.DB, u *model.User, id GoogleIdentity) error {
	updates := map[string]any{"google_sub": id.Sub}
	if (u.Email == nil || *u.Email == "") && id.EmailVerified && id.Email != "" {
		var n int64
		if err := tx.Model(&model.User{}).Where("lower(email) = ? AND tg_id <> ?", id.Email, u.TgID).Count(&n).Error; err != nil {
			return err
		}
		if n == 0 {
			email := id.Email
			updates["email"] = email
			u.Email = &email
		}
	}
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

// CreateLinkToken stores a one-time token (by its hash) for a user.
func (db *DB) CreateLinkToken(t *model.LinkToken) error {
	return db.conn.Create(t).Error
}

// useLinkToken marks a valid one-time token as used and returns its user.
// Inside a transaction: if the caller fails later, the token stays unused.
func useLinkToken(tx *gorm.DB, tokenHash, purpose string) (int64, error) {
	var rows []struct{ TgID int64 }
	now := time.Now().UTC()
	if err := tx.Raw(`UPDATE link_tokens SET used_at = ?
		WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?
		RETURNING tg_id`, now, tokenHash, purpose, now).Scan(&rows).Error; err != nil {
		return 0, err
	}
	if len(rows) == 0 {
		return 0, ErrLinkTokenInvalid
	}
	return rows[0].TgID, nil
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
		return nil, ErrLinkTokenInvalid
	}
	return &rows[0], nil
}
