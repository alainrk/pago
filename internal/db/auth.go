package db

import (
	"pago/internal/model"
	"time"
)

// CreateWebSession creates a new web session
func (db *DB) CreateWebSession(session *model.WebSession) error {
	return db.conn.Create(session).Error
}

// GetWebSession retrieves a web session by ID
func (db *DB) GetWebSession(sessionID string) (*model.WebSession, error) {
	var session model.WebSession
	result := db.conn.Where("id = ?", sessionID).First(&session)
	if result.Error != nil {
		return nil, result.Error
	}
	return &session, nil
}

// GetWebSessionWithUser retrieves a web session with user data
func (db *DB) GetWebSessionWithUser(sessionID string) (*model.WebSession, error) {
	var session model.WebSession
	result := db.conn.Preload("User").Where("id = ?", sessionID).First(&session)
	if result.Error != nil {
		return nil, result.Error
	}
	return &session, nil
}

// DeleteWebSession deletes a web session
func (db *DB) DeleteWebSession(sessionID string) error {
	return db.conn.Delete(&model.WebSession{}, "id = ?", sessionID).Error
}

// GetAPITokenByHash retrieves an API token by its sha256 hex hash.
func (db *DB) GetAPITokenByHash(hash string) (*model.APIToken, error) {
	var t model.APIToken
	if err := db.conn.Where("token_hash = ?", hash).First(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

// TouchAPITokenLastUsed updates the LastUsedAt timestamp.
func (db *DB) TouchAPITokenLastUsed(id int64) error {
	now := time.Now().UTC()
	return db.conn.Model(&model.APIToken{}).Where("id = ?", id).Update("last_used_at", now).Error
}

// CleanupExpiredAuthData removes expired sessions and Google sign-in states.
func (db *DB) CleanupExpiredAuthData() error {
	now := time.Now().UTC()

	// Delete expired web sessions
	if err := db.conn.Where("expires_at < ?", now).Delete(&model.WebSession{}).Error; err != nil {
		return err
	}

	// Delete expired Google sign-in states
	if err := db.conn.Where("expires_at < ?", now).Delete(&model.OAuthState{}).Error; err != nil {
		return err
	}

	return nil
}
