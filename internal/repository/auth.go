package repository

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"strconv"
	"time"

	"pago/internal/model"
)

var ErrInvalidToken = errors.New("invalid or expired token")

type Auth struct {
	Repository
}

// GenerateSessionID generates a secure session ID
func generateSessionID() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// CreateWebSession creates a new web session for a user
func (r *Auth) CreateWebSession(tgID int64) (*model.WebSession, error) {
	sessionID, err := generateSessionID()
	if err != nil {
		return nil, err
	}

	smin := os.Getenv("SESSION_DURATION_MIN")
	expMin, err := strconv.Atoi(smin)
	if err != nil {
		r.Logger.Errorf("Failed to parse SESSION_DURATION_MIN: %v, defaulting to 7 days", err)
		expMin = 10080
	}

	session := &model.WebSession{
		ID:        sessionID,
		TgID:      tgID,
		ExpiresAt: time.Now().UTC().Add(time.Duration(expMin) * time.Minute),
	}

	if err := r.DB.CreateWebSession(session); err != nil {
		return nil, err
	}

	return session, nil
}

// GetWebSession retrieves a web session by ID
func (r *Auth) GetWebSession(sessionID string) (*model.WebSession, error) {
	return r.DB.GetWebSession(sessionID)
}

// DeleteWebSession deletes a web session
func (r *Auth) DeleteWebSession(sessionID string) error {
	return r.DB.DeleteWebSession(sessionID)
}

// CleanupExpiredTokens removes expired sessions and Google sign-in states
func (r *Auth) CleanupExpiredTokens() error {
	return r.DB.CleanupExpiredAuthData()
}

// LookupAPIToken validates a bearer token string and returns the associated user.
// The token is sha256-hashed before DB lookup; only the hash is stored.
// Returns ErrInvalidToken if the token is missing, expired, or unknown.
func (r *Auth) LookupAPIToken(token string) (*model.User, *model.APIToken, error) {
	if token == "" {
		return nil, nil, ErrInvalidToken
	}
	sum := sha256.Sum256([]byte(token))
	hash := hex.EncodeToString(sum[:])

	apiTok, err := r.DB.GetAPITokenByHash(hash)
	if err != nil {
		return nil, nil, ErrInvalidToken
	}
	if !apiTok.IsValid() {
		return nil, nil, ErrInvalidToken
	}
	user, err := r.DB.GetUser(apiTok.TgID)
	if err != nil {
		return nil, nil, ErrInvalidToken
	}
	return user, apiTok, nil
}

// TouchAPIToken updates the last-used timestamp on a token (fire-and-forget OK).
func (r *Auth) TouchAPIToken(id int64) error {
	return r.DB.TouchAPITokenLastUsed(id)
}
