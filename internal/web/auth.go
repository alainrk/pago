package web

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
)

// handleHome redirects to dashboard if authenticated, otherwise to login
func (s *Server) handleHome(w http.ResponseWriter, r *http.Request) {
	session, _ := s.getSession(r)
	if session != nil && session.IsValid() {
		http.Redirect(w, r, basePath+"/dashboard", http.StatusSeeOther)
		return
	}
	http.Redirect(w, r, basePath+"/login", http.StatusSeeOther)
}

// handleLogin is where the old dashboard sends people without a session.
// Sign-in only happens in the web app now (Google or a passkey), so this
// sends them there. The session cookie belongs to this API host, so after
// signing in on the web app the dashboard works too.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	session, _ := s.getSession(r)
	if session != nil && session.IsValid() {
		http.Redirect(w, r, basePath+"/dashboard", http.StatusSeeOther)
		return
	}
	if app := firstOrigin(os.Getenv("WEB_CORS_ORIGINS")); app != "" {
		http.Redirect(w, r, app+"/login", http.StatusSeeOther)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte("Sign in on the Pago web app with Google or a passkey, then open this page again.\n"))
}

// firstOrigin returns the first entry of a comma separated origin list.
func firstOrigin(raw string) string {
	for _, o := range splitCSV(raw) {
		return strings.TrimRight(o, "/")
	}
	return ""
}

// handleLogout handles user logout.
//
// Browser navigations (GET) are redirected to the login page. API clients
// (POST, or an Accept: application/json header) get a JSON reply instead.
//
//	@Summary		Sign out
//	@Tags			auth
//	@Produce		json
//	@Success		200	{object}	MessageResponse
//	@Router			/logout [post]
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(sessionCookieName)
	if err == nil {
		// Delete session from database
		err = errors.Join(err, s.repositories.Auth.DeleteWebSession(cookie.Value))
		if err != nil {
			s.logger.Errorf("Failed to delete session: %v", err)
		}
	}

	clearSessionCookie(w, r)

	if r.Method == http.MethodPost || isAPIRequest(r) {
		s.sendJSONSuccess(w, MessageResponse{Message: "Signed out"})
		return
	}
	http.Redirect(w, r, basePath+"/login", http.StatusSeeOther)
}

// Helper functions for JSON responses
func (s *Server) sendJSONError(w http.ResponseWriter, message string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	err := json.NewEncoder(w).Encode(map[string]string{"error": message})
	if err != nil {
		s.logger.Errorf("Failed to send error response: %v", err)
	}
}

func (s *Server) sendJSONSuccess(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	err := json.NewEncoder(w).Encode(data)
	if err != nil {
		s.logger.Errorf("Failed to send success response: %v", err)
	}
}
