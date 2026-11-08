package web

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"regexp"
	"time"

	"pago/internal/client"
	"pago/internal/model"
)

const linkTokenTTL = 10 * time.Minute

// One-time link tokens are 32 hex characters (128 random bits).
var linkTokenPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)

// newLinkToken creates and stores a one-time token for the user. Only its
// sha256 is stored.
func (s *Server) newLinkToken(tgID int64, purpose string) (string, time.Time, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", time.Time{}, err
	}
	token := hex.EncodeToString(raw)
	expires := time.Now().UTC().Add(linkTokenTTL)
	err := s.repositories.Auth.DB.CreateLinkToken(&model.LinkToken{
		TgID:      tgID,
		Purpose:   purpose,
		TokenHash: sha256Hex(token),
		ExpiresAt: expires,
	})
	return token, expires, err
}

// HandoffResponse is the body of POST /api/auth/handoff.
type HandoffResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// handleHandoff gives a user who is signed in on the old address a one-time
// token for the new one. The frontend sends them to
// https://<new address>/welcome#t=<token> (a fragment, so the token stays
// out of logs and Referer headers). There they sign in with Google and the
// Google account is linked to this account, even if its email differs.
// 128 random bits, kept only as a sha256, valid 10 minutes, single use.
func (s *Server) handleHandoff(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Browser sessions only: an API token must not be able to hand the
	// account to a Google account.
	if _, bearer := extractBearerToken(r); bearer {
		s.sendJSONError(w, "Use the web app for this", http.StatusForbidden)
		return
	}
	user := client.GetUserFromContext(r.Context())
	if user == nil {
		s.sendJSONError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	token, expires, err := s.newLinkToken(user.TgID, model.LinkPurposeHandoff)
	if err != nil {
		s.logger.Errorf("Failed to create hand-off token: %v", err)
		s.sendJSONError(w, "Could not create the link", http.StatusInternalServerError)
		return
	}
	s.logger.Infof("Hand-off token created for account %d", user.TgID)
	s.sendJSONSuccess(w, HandoffResponse{Token: token, ExpiresAt: expires})
}
