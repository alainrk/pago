package web

import (
	"net/http"
	"strings"

	"pago/internal/client"
	"pago/internal/model"
)

// MeResponse is the body of GET /api/me.
type MeResponse struct {
	Name     string `json:"name"`
	Username string `json:"username"`
	Email    string `json:"email,omitempty"`
	// Initials is a short label for avatars, for example "AR".
	Initials string `json:"initials"`
	// HasEmail tells the client whether passkey registration is possible.
	HasEmail bool   `json:"hasEmail"`
	Currency string `json:"currency"`
}

// handleAPIMe returns the signed-in user's profile.
//
//	@Summary		Current user
//	@Tags			account
//	@Produce		json
//	@Success		200	{object}	MeResponse
//	@Failure		401	{object}	ErrorResponse
//	@Security		BearerAuth
//	@Router			/api/me [get]
func (s *Server) handleAPIMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	user := client.GetUserFromContext(r.Context())
	if user == nil {
		s.sendJSONError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	s.sendJSONSuccess(w, buildMeResponse(user))
}

func buildMeResponse(user *model.User) MeResponse {
	name := displayName(user)
	email := ""
	if user.Email != nil {
		email = strings.TrimSpace(*user.Email)
	}
	return MeResponse{
		Name:     name,
		Username: user.TgUsername,
		Email:    email,
		Initials: initials(name, user.TgUsername),
		HasEmail: email != "",
		// Transactions are stored in EUR today; exposed so the client does not hardcode it.
		Currency: string(model.CurrencyEUR),
	}
}

// displayName picks the friendliest non-empty name we have.
func displayName(user *model.User) string {
	if n := strings.TrimSpace(user.Name); n != "" {
		return n
	}
	full := strings.TrimSpace(strings.TrimSpace(user.TgFirstname) + " " + strings.TrimSpace(user.TgLastname))
	if full != "" {
		return full
	}
	return user.TgUsername
}

// initials returns up to two upper-case letters from the name, falling back to
// the username.
func initials(name, username string) string {
	src := strings.TrimSpace(name)
	if src == "" {
		src = strings.TrimPrefix(username, "@")
	}
	parts := strings.Fields(src)
	var b strings.Builder
	for i, p := range parts {
		if i == 2 {
			break
		}
		r := []rune(p)
		b.WriteString(strings.ToUpper(string(r[0])))
	}
	if b.Len() == 0 && len(parts) == 0 && src != "" {
		return strings.ToUpper(string([]rune(src)[0]))
	}
	if b.Len() == 1 && len(parts) == 1 {
		r := []rune(parts[0])
		if len(r) > 1 {
			b.WriteString(strings.ToUpper(string(r[1])))
		}
	}
	return b.String()
}
