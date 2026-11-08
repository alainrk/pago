package web

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"pago/internal/client"
	"pago/internal/model"
)

func withUser(r *http.Request, u *model.User) *http.Request {
	return r.WithContext(client.SetUserInContext(context.Background(), u))
}

func TestParseNeedsQuickEntryConsent(t *testing.T) {
	s := testGoogleServer(t)
	for name, u := range map[string]*model.User{
		"not asked":  {TgID: 1},
		"declined":   {TgID: 1, AIConsent: strPtr(model.AIConsentDeclined), AIConsentVersion: strPtr(model.AIPolicyVersion)},
		"old policy": {TgID: 1, AIConsent: strPtr(model.AIConsentAccepted), AIConsentVersion: strPtr("2000-01-01")},
	} {
		r := withUser(httptest.NewRequest(http.MethodPost, "/web/api/transactions/parse", strings.NewReader(`{"text":"pizza 12"}`)), u)
		w := httptest.NewRecorder()
		s.handleAPIParseTransaction(w, r)
		if w.Code != http.StatusForbidden {
			t.Errorf("%s: got %d, want 403", name, w.Code)
		}
	}
}

func TestAIConsentRefusesAPITokens(t *testing.T) {
	s := testGoogleServer(t)
	r := withUser(httptest.NewRequest(http.MethodPost, "/web/api/ai-consent", strings.NewReader(`{"accept":true}`)), &model.User{TgID: 1})
	r.Header.Set("Authorization", "Bearer pago_x")
	w := httptest.NewRecorder()
	s.handleAIConsent(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("bearer: got %d", w.Code)
	}
}

func strPtr(s string) *string { return &s }
