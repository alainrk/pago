package model

import (
	"time"
)

// WebSession represents a web session
type WebSession struct {
	ID        string    `gorm:"column:id;primaryKey"`
	TgID      int64     `gorm:"column:tg_id;not null;index"`
	ExpiresAt time.Time `gorm:"column:expires_at;not null;index"`
	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime"`

	// Association to User (optional)
	User *User `gorm:"foreignKey:TgID;references:TgID"`
}

// TableName overrides the table name
func (WebSession) TableName() string {
	return "web_sessions"
}

// IsValid checks if the session is still valid
func (s *WebSession) IsValid() bool {
	return time.Now().UTC().Before(s.ExpiresAt)
}

// APIToken represents a long-lived bearer token issued out-of-band (admin inserts directly).
// The plaintext token is never stored; only its sha256 hex digest in TokenHash.
type APIToken struct {
	ID         int64      `gorm:"column:id;primaryKey;autoIncrement"`
	TgID       int64      `gorm:"column:tg_id;not null;index"`
	Name       string     `gorm:"column:name;not null"`
	TokenHash  string     `gorm:"column:token_hash;not null;unique;index"`
	Prefix     string     `gorm:"column:prefix;not null"`
	ExpiresAt  *time.Time `gorm:"column:expires_at"`
	LastUsedAt *time.Time `gorm:"column:last_used_at"`
	CreatedAt  time.Time  `gorm:"column:created_at;autoCreateTime"`

	User *User `gorm:"foreignKey:TgID;references:TgID"`
}

func (APIToken) TableName() string {
	return "api_tokens"
}

// IsValid checks the token has not expired.
func (t *APIToken) IsValid() bool {
	if t.ExpiresAt == nil {
		return true
	}
	return time.Now().UTC().Before(*t.ExpiresAt)
}

// OAuthState is the server side of one Google sign-in, from the start to the
// callback. It is used once.
type OAuthState struct {
	StateHash    string    `gorm:"column:state_hash;primaryKey"`
	Nonce        string    `gorm:"column:nonce;not null"`
	CodeVerifier string    `gorm:"column:code_verifier;not null"`
	RedirectURL  string    `gorm:"column:redirect_url;not null"`
	ReturnOrigin string    `gorm:"column:return_origin;not null"`
	ReturnPath   string    `gorm:"column:return_path;not null"`
	ExpiresAt    time.Time `gorm:"column:expires_at;not null"`
	CreatedAt    time.Time `gorm:"column:created_at;autoCreateTime"`
}

func (OAuthState) TableName() string {
	return "oauth_states"
}
