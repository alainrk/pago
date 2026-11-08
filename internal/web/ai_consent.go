package web

import (
	"encoding/json"
	"io"
	"net/http"
	"time"

	"pago/internal/client"
	"pago/internal/model"
)

// AIConsentRequest is the body of POST /api/ai-consent.
type AIConsentRequest struct {
	// Accept is true for "Use quick entry", false for "Use the form".
	Accept bool `json:"accept"`
}

// AIConsentResponse tells the client the stored choice.
type AIConsentResponse struct {
	QuickEntry    string    `json:"quickEntry"`
	PolicyVersion string    `json:"policyVersion"`
	DecidedAt     time.Time `json:"decidedAt"`
}

// handleAIConsent stores the quick entry choice. Quick entry sends the typed
// text (no name, email or account id) to DeepSeek in China, so it needs the
// person's consent (GDPR art. 49(1)(a)), asked before the first use and
// changeable in Settings. Only a browser session can give it, not an API
// token.
func (s *Server) handleAIConsent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, bearer := extractBearerToken(r); bearer {
		s.sendJSONError(w, "Quick entry consent can only be given in the web app", http.StatusForbidden)
		return
	}
	user := client.GetUserFromContext(r.Context())
	if user == nil {
		s.sendJSONError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var req AIConsentRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 1024)).Decode(&req); err != nil {
		s.sendJSONError(w, "Invalid request", http.StatusBadRequest)
		return
	}
	choice := model.AIConsentDeclined
	if req.Accept {
		choice = model.AIConsentAccepted
	}
	now := time.Now().UTC()
	if err := s.repositories.Users.DB.SetAIConsent(user.TgID, choice, model.AIPolicyVersion, now); err != nil {
		s.logger.Errorf("Failed to store quick entry consent for %d: %v", user.TgID, err)
		s.sendJSONError(w, "Could not save your choice", http.StatusInternalServerError)
		return
	}
	s.logger.Infof("Quick entry consent for account %d: %s (policy %s)", user.TgID, choice, model.AIPolicyVersion)
	s.sendJSONSuccess(w, AIConsentResponse{QuickEntry: choice, PolicyVersion: model.AIPolicyVersion, DecidedAt: now})
}
