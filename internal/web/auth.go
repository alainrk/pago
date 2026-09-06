package web

import (
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"net/http"
	"strings"
	"time"

	"pago/internal/model"

	gotgbot "github.com/PaulSonOfLars/gotgbot/v2"
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

// handleLogin shows the login page
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	// Check if already logged in
	session, _ := s.getSession(r)
	if session != nil && session.IsValid() {
		http.Redirect(w, r, basePath+"/dashboard", http.StatusSeeOther)
		return
	}

	t, err := template.ParseFiles("web/templates/login.html")
	if err != nil {
		s.logger.Errorf("Failed to parse template: %v", err)
		http.Error(w, "Template error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html")
	err = t.Execute(w, nil)
	if err != nil {
		s.logger.Errorf("Failed to execute template: %v", err)
		http.Error(w, "Template error", http.StatusInternalServerError)
		return
	}
}

// handleAuthRequest handles the initial auth request
func (s *Server) handleAuthRequest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username string `json:"username"`
		Email    string `json:"email"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendJSONError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Determine which login method to use
	username := strings.TrimSpace(strings.TrimPrefix(req.Username, "@"))
	email := strings.TrimSpace(strings.ToLower(req.Email))

	if username == "" && email == "" {
		s.sendJSONError(w, "Username or email is required", http.StatusBadRequest)
		return
	}

	if username != "" && email != "" {
		s.sendJSONError(w, "Please provide either username or email, not both", http.StatusBadRequest)
		return
	}

	if email != "" && s.emailService == nil {
		// Independent of whether the user exists, so it leaks nothing.
		s.sendJSONError(w, "Email sign-in is not available on this server", http.StatusServiceUnavailable)
		return
	}

	// Generic success message to prevent user enumeration
	const genericSuccessMsg = "If an account exists with these credentials, a verification code has been sent"

	var user model.User
	var exists bool
	var err error

	// Get user by username or email
	if email != "" {
		user, exists, err = s.repositories.Users.GetByEmail(email)
	} else {
		user, exists, err = s.repositories.Users.GetByUsername(username)
	}

	// Add consistent delay to prevent timing attacks
	defer time.Sleep(100 * time.Millisecond)

	// If user doesn't exist, return generic success to prevent enumeration
	if err != nil || !exists {
		s.sendJSONSuccess(w, map[string]any{
			"message": genericSuccessMsg,
		})
		return
	}

	// Create auth token
	authToken, err := s.repositories.Auth.CreateAuthToken(user.TgID)
	if err != nil {
		s.logger.Errorf("Failed to create auth token: %v", err)
		// Still return generic success to prevent enumeration
		s.sendJSONSuccess(w, map[string]any{
			"message": genericSuccessMsg,
		})
		return
	}

	// Send code via email or Telegram based on login method
	if email != "" {
		// Send code via email
		subject := "Your Pago Login Code"
		textContent := fmt.Sprintf("🔐 Your Pago login code is:\n\n%s\n\nThis code will expire in 5 minutes.", authToken.Token)
		err = s.emailService.SendTransacEmail(email, subject, textContent)
		if err != nil {
			s.logger.Errorf("Failed to send auth code via email: %v", err)
		}
	} else {
		// Send code via Telegram
		message := fmt.Sprintf("🔐 Your Pago login code is:\n\n<code>%s</code>\n\nThis code will expire in 5 minutes.", authToken.Token)
		_, err = s.bot.SendMessage(user.TgID, message, &gotgbot.SendMessageOpts{
			ParseMode: "HTML",
		})
		if err != nil {
			s.logger.Errorf("Failed to send auth code: %v", err)
		}
	}

	// Always return generic success message
	s.sendJSONSuccess(w, map[string]any{
		"message": genericSuccessMsg,
	})
}

// handleAuthVerify verifies the auth code
func (s *Server) handleAuthVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Code string `json:"code"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendJSONError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	code := strings.TrimSpace(strings.ToUpper(req.Code))
	if code == "" {
		s.sendJSONError(w, "Code is required", http.StatusBadRequest)
		return
	}

	// Verify auth token
	user, err := s.repositories.Auth.VerifyAuthToken(code)
	if err != nil {
		s.sendJSONError(w, "Invalid or expired code", http.StatusUnauthorized)
		return
	}

	// Create web session
	session, err := s.repositories.Auth.CreateWebSession(user.TgID)
	if err != nil {
		s.logger.Errorf("Failed to create session: %v", err)
		s.sendJSONError(w, "Failed to create session", http.StatusInternalServerError)
		return
	}

	setSessionCookie(w, r, session.ID)

	s.sendJSONSuccess(w, map[string]any{
		"message":  "Login successful",
		"redirect": basePath + "/dashboard",
	})
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
