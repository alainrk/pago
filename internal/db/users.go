package db

import (
	"time"

	"pago/internal/model"
)

// GetUser retrieves a user by their account id (tg_id)
func (db *DB) GetUser(tgID int64) (*model.User, error) {
	var user model.User
	result := db.conn.Where("tg_id = ?", tgID).First(&user)
	if result.Error != nil {
		return nil, result.Error
	}
	return &user, nil
}

// GetUserByEmail retrieves a user by their email
func (db *DB) GetUserByEmail(email string) (*model.User, error) {
	var user model.User
	result := db.conn.Where("email = ?", email).First(&user)
	if result.Error != nil {
		return nil, result.Error
	}
	return &user, nil
}

// SetUser creates or updates a user. google_sub is left out: a caller saving
// a row it loaded a while ago must not undo a Google link made in the
// meantime. It changes only through GoogleSignIn. The quick entry consent
// is left out for the same reason (see SetAIConsent).
func (db *DB) SetUser(user *model.User) error {
	// Use upsert functionality (create if not exists, update if exists)
	result := db.conn.Omit("google_sub", "ai_consent", "ai_consent_at", "ai_consent_version").Save(user)
	return result.Error
}

// SetAIConsent stores the quick entry (DeepSeek) choice with its time and the
// policy version the person saw.
func (db *DB) SetAIConsent(tgID int64, choice, version string, at time.Time) error {
	return db.conn.Model(&model.User{}).Where("tg_id = ?", tgID).Updates(map[string]any{
		"ai_consent":         choice,
		"ai_consent_at":      at,
		"ai_consent_version": version,
	}).Error
}
