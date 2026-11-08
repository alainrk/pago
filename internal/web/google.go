package web

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"pago/internal/db"
	"pago/internal/model"
)

// Google sign-in (OpenID Connect, authorization code flow with PKCE).
//
// Each API host can have its own Google OAuth client. They come from three
// comma separated lists, paired by position:
//
//	GOOGLE_CLIENT_ID      client ids
//	GOOGLE_CLIENT_SECRET  client secrets
//	GOOGLE_REDIRECT_URL   callback URLs, for example
//	                      https://api.example.com/web/auth/google/callback
//
// A request uses the client whose callback URL has the same host as the
// request. A host without a client has no Google sign-in (the button is
// hidden). Google sign-in is the only way to create a new account; the
// optional ALLOWED_EMAILS list (comma separated) limits who can do that.

const (
	googleAuthURL      = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenURL     = "https://oauth2.googleapis.com/token"
	googleStateCookie  = "google_oauth_state"
	googleStateMaxAge  = 10 * 60 // seconds
	googleCallbackPath = basePath + "/auth/google/callback"
)

type googleClient struct {
	ID          string
	Secret      string
	RedirectURL string
	host        string
}

// parseGoogleClients reads the three paired lists. Any mismatch is an error,
// so a typo cannot quietly send people to the wrong client.
func parseGoogleClients(rawIDs, rawSecrets, rawRedirects string) ([]googleClient, error) {
	ids, secrets, redirects := splitCSV(rawIDs), splitCSV(rawSecrets), splitCSV(rawRedirects)
	if len(ids) == 0 && len(secrets) == 0 && len(redirects) == 0 {
		return nil, nil
	}
	if len(ids) != len(secrets) || len(ids) != len(redirects) {
		return nil, fmt.Errorf("GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URL need the same number of entries (%d, %d, %d)",
			len(ids), len(secrets), len(redirects))
	}
	out := make([]googleClient, 0, len(ids))
	seen := map[string]bool{}
	for i := range ids {
		u, err := url.Parse(redirects[i])
		if err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") {
			return nil, fmt.Errorf("GOOGLE_REDIRECT_URL entry %d is not a full URL", i+1)
		}
		host := strings.ToLower(u.Host)
		if seen[host] {
			return nil, fmt.Errorf("GOOGLE_REDIRECT_URL has host %s twice", host)
		}
		seen[host] = true
		out = append(out, googleClient{ID: ids[i], Secret: secrets[i], RedirectURL: redirects[i], host: host})
	}
	return out, nil
}

func splitCSV(raw string) []string {
	var out []string
	for _, p := range strings.Split(raw, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// parseEmailList reads ALLOWED_EMAILS. Empty means anyone with a verified
// Google email can create an account.
func parseEmailList(raw string) map[string]bool {
	out := map[string]bool{}
	for _, e := range splitCSV(raw) {
		out[strings.ToLower(e)] = true
	}
	return out
}

// googleConfig is the Google part of the server, loaded from the env.
type googleConfig struct {
	clients       []googleClient
	allowedEmails map[string]bool
	corsOrigins   map[string]bool
	tokenURL      string
	httpClient    *http.Client
}

func loadGoogleConfig() (googleConfig, error) {
	clients, err := parseGoogleClients(os.Getenv("GOOGLE_CLIENT_ID"), os.Getenv("GOOGLE_CLIENT_SECRET"), os.Getenv("GOOGLE_REDIRECT_URL"))
	cfg := googleConfig{
		clients:       clients,
		allowedEmails: parseEmailList(os.Getenv("ALLOWED_EMAILS")),
		corsOrigins:   parseAllowedOrigins(os.Getenv("WEB_CORS_ORIGINS")),
		tokenURL:      googleTokenURL,
		httpClient:    &http.Client{Timeout: 10 * time.Second},
	}
	return cfg, err
}

// clientFor picks the Google client for the request host, or nil.
func (g *googleConfig) clientFor(r *http.Request) *googleClient {
	host := strings.ToLower(r.Host)
	for i := range g.clients {
		if g.clients[i].host == host {
			return &g.clients[i]
		}
	}
	return nil
}

func (g *googleConfig) signupAllowed(email string) bool {
	if len(g.allowedEmails) == 0 {
		return true
	}
	return g.allowedEmails[strings.ToLower(email)]
}

// returnOrigin checks the Origin header of the start request: it must be an
// allowed frontend origin (WEB_CORS_ORIGINS), or the API itself when the
// frontend is served from the same host.
func (g *googleConfig) returnOrigin(r *http.Request) (string, bool) {
	origin := strings.TrimRight(strings.TrimSpace(r.Header.Get("Origin")), "/")
	if origin == "" {
		return "", false
	}
	if g.corsOrigins[strings.ToLower(origin)] {
		return origin, true
	}
	u, err := url.Parse(origin)
	if err == nil && strings.EqualFold(u.Host, r.Host) {
		return origin, true
	}
	return "", false
}

// safeReturnPath keeps only same-site paths like "/reports?month=2026-10".
func safeReturnPath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" || !strings.HasPrefix(p, "/") || strings.HasPrefix(p, "//") || strings.Contains(p, "\\") {
		return "/"
	}
	if strings.HasPrefix(p, "/login") || strings.HasPrefix(p, "/welcome") {
		return "/"
	}
	return p
}

func randomToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func sha256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

// AuthMethodsResponse tells the login page which buttons to show.
type AuthMethodsResponse struct {
	Google  bool `json:"google"`
	Passkey bool `json:"passkey"`
}

// handleAuthMethods lists the sign-in methods on this host.
func (s *Server) handleAuthMethods(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	s.sendJSONSuccess(w, AuthMethodsResponse{
		Google:  s.google.clientFor(r) != nil,
		Passkey: true,
	})
}

// handleGoogleStart creates the state of a Google sign-in and returns the
// Google URL to open.
func (s *Server) handleGoogleStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// JSON only: browsers then send a CORS preflight for other sites.
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		s.sendJSONError(w, "Expected JSON", http.StatusUnsupportedMediaType)
		return
	}
	gc := s.google.clientFor(r)
	if gc == nil {
		s.sendJSONError(w, "Google sign-in is not available on this address", http.StatusNotFound)
		return
	}
	origin, ok := s.google.returnOrigin(r)
	if !ok {
		s.sendJSONError(w, "Unknown origin", http.StatusForbidden)
		return
	}

	var req struct {
		ReturnTo string `json:"returnTo"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 4096)).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		s.sendJSONError(w, "Invalid request", http.StatusBadRequest)
		return
	}

	state, err1 := randomToken(32)
	nonce, err2 := randomToken(24)
	verifier, err3 := randomToken(48)
	if err := errors.Join(err1, err2, err3); err != nil {
		s.logger.Errorf("Failed to create Google sign-in state: %v", err)
		s.sendJSONError(w, "Could not start Google sign-in", http.StatusInternalServerError)
		return
	}

	st := &model.OAuthState{
		StateHash:    sha256Hex(state),
		Nonce:        nonce,
		CodeVerifier: verifier,
		RedirectURL:  gc.RedirectURL,
		ReturnOrigin: origin,
		ReturnPath:   safeReturnPath(req.ReturnTo),
		ExpiresAt:    time.Now().UTC().Add(googleStateMaxAge * time.Second),
	}
	if err := s.repositories.Auth.DB.CreateOAuthState(st); err != nil {
		s.logger.Errorf("Failed to store Google sign-in state: %v", err)
		s.sendJSONError(w, "Could not start Google sign-in", http.StatusInternalServerError)
		return
	}

	// Binds the callback to this browser (stops login CSRF).
	setCookie(w, r, googleStateCookie, state, googleStateMaxAge)

	challenge := sha256.Sum256([]byte(verifier))
	q := url.Values{}
	q.Set("client_id", gc.ID)
	q.Set("redirect_uri", gc.RedirectURL)
	q.Set("response_type", "code")
	q.Set("scope", "openid email profile")
	q.Set("state", state)
	q.Set("nonce", nonce)
	q.Set("code_challenge", base64.RawURLEncoding.EncodeToString(challenge[:]))
	q.Set("code_challenge_method", "S256")
	q.Set("prompt", "select_account")

	s.sendJSONSuccess(w, map[string]string{"url": googleAuthURL + "?" + q.Encode()})
}

// handleGoogleCallback finishes the sign-in and sends the browser back to the
// frontend.
func (s *Server) handleGoogleCallback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	q := r.URL.Query()
	state := q.Get("state")
	cookie, err := r.Cookie(googleStateCookie)
	setCookie(w, r, googleStateCookie, "", -1)
	if state == "" || err != nil || cookie.Value != state {
		http.Error(w, "This sign-in link is not valid any more. Go back to Pago and try again.", http.StatusBadRequest)
		return
	}
	st, err := s.repositories.Auth.DB.TakeOAuthState(sha256Hex(state))
	if err != nil {
		http.Error(w, "This sign-in link has expired. Go back to Pago and try again.", http.StatusBadRequest)
		return
	}

	fail := func(code string) {
		http.Redirect(w, r, st.ReturnOrigin+"/login?error="+url.QueryEscape(code), http.StatusSeeOther)
	}

	gc := s.google.clientFor(r)
	if gc == nil || gc.RedirectURL != st.RedirectURL {
		fail("google_failed")
		return
	}
	if q.Get("error") != "" {
		// For example the person pressed Cancel at Google.
		fail("google_cancelled")
		return
	}
	code := q.Get("code")
	if code == "" {
		fail("google_failed")
		return
	}

	id, err := s.exchangeGoogleCode(r, gc, code, st)
	if err != nil {
		s.logger.Warnf("Google sign-in failed: %v", err)
		fail("google_failed")
		return
	}

	user, match, err := s.repositories.Auth.DB.GoogleSignIn(*id, s.google.signupAllowed)
	if err != nil {
		switch {
		case errors.Is(err, db.ErrGoogleTaken):
			fail("google_taken")
		case errors.Is(err, db.ErrOtherGoogleLinked):
			fail("other_google")
		case errors.Is(err, db.ErrEmailTaken):
			fail("email_taken")
		case errors.Is(err, db.ErrSignupNotAllowed):
			fail("not_allowed")
		case errors.Is(err, db.ErrUnverifiedEmail):
			fail("unverified")
		default:
			s.logger.Errorf("Google sign-in database error: %v", err)
			fail("google_failed")
		}
		return
	}
	switch match {
	case db.GoogleMatchEmail:
		// No email in the log, only the account id.
		s.logger.Infof("Google sign-in: account %d matched by verified email, Google sub stored", user.TgID)
	case db.GoogleMatchSignup:
		s.logger.Infof("Google sign-in: new account %d", user.TgID)
	}

	session, err := s.repositories.Auth.CreateWebSession(user.TgID)
	if err != nil {
		s.logger.Errorf("Failed to create session: %v", err)
		fail("google_failed")
		return
	}
	setSessionCookie(w, r, session.ID)

	// No passkey for this domain yet: offer to create one.
	target := st.ReturnOrigin + st.ReturnPath
	if s.repositories.WebAuthn != nil {
		n, err := s.repositories.WebAuthn.CountCredentialsForOrigin(st.ReturnOrigin, user.TgID)
		if err == nil && n == 0 {
			target = st.ReturnOrigin + "/welcome?next=" + url.QueryEscape(st.ReturnPath)
		}
	}
	http.Redirect(w, r, target, http.StatusSeeOther)
}

// exchangeGoogleCode trades the code for tokens and reads the ID token.
//
// The ID token comes straight from Google's token endpoint over TLS, in
// exchange for our client secret, so its signature does not need checking
// (OpenID Connect Core 3.1.3.7). The claims are still checked.
func (s *Server) exchangeGoogleCode(r *http.Request, gc *googleClient, code string, st *model.OAuthState) (*db.GoogleIdentity, error) {
	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", gc.ID)
	form.Set("client_secret", gc.Secret)
	form.Set("redirect_uri", gc.RedirectURL)
	form.Set("grant_type", "authorization_code")
	form.Set("code_verifier", st.CodeVerifier)

	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, s.google.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := s.google.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token endpoint answered %d", resp.StatusCode)
	}
	var tok struct {
		IDToken string `json:"id_token"`
	}
	if err := json.Unmarshal(body, &tok); err != nil || tok.IDToken == "" {
		return nil, errors.New("no id_token in the token response")
	}
	return parseGoogleIDToken(tok.IDToken, gc.ID, st.Nonce, time.Now())
}

// parseGoogleIDToken reads and checks the claims of a Google ID token.
func parseGoogleIDToken(idToken, clientID, nonce string, now time.Time) (*db.GoogleIdentity, error) {
	parts := strings.Split(idToken, ".")
	if len(parts) != 3 {
		return nil, errors.New("id_token is not a JWT")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, errors.New("id_token payload is not base64url")
	}
	var c struct {
		Iss           string          `json:"iss"`
		Aud           json.RawMessage `json:"aud"`
		Sub           string          `json:"sub"`
		Email         string          `json:"email"`
		EmailVerified any             `json:"email_verified"`
		Name          string          `json:"name"`
		Exp           int64           `json:"exp"`
		Nonce         string          `json:"nonce"`
	}
	if err := json.Unmarshal(payload, &c); err != nil {
		return nil, errors.New("id_token payload is not JSON")
	}
	if c.Iss != "https://accounts.google.com" && c.Iss != "accounts.google.com" {
		return nil, fmt.Errorf("unexpected issuer %q", c.Iss)
	}
	if !audienceHas(c.Aud, clientID) {
		return nil, errors.New("id_token is for another client")
	}
	if c.Exp == 0 || now.Unix() > c.Exp+60 {
		return nil, errors.New("id_token expired")
	}
	if nonce == "" || c.Nonce != nonce {
		return nil, errors.New("id_token nonce mismatch")
	}
	if c.Sub == "" {
		return nil, errors.New("id_token has no sub")
	}
	verified := false
	switch v := c.EmailVerified.(type) {
	case bool:
		verified = v
	case string:
		verified = v == "true"
	}
	return &db.GoogleIdentity{
		Sub:           c.Sub,
		Email:         strings.ToLower(strings.TrimSpace(c.Email)),
		EmailVerified: verified,
		Name:          strings.TrimSpace(c.Name),
	}, nil
}

func audienceHas(raw json.RawMessage, clientID string) bool {
	var one string
	if json.Unmarshal(raw, &one) == nil {
		return one == clientID
	}
	var many []string
	if json.Unmarshal(raw, &many) == nil {
		for _, a := range many {
			if a == clientID {
				return true
			}
		}
	}
	return false
}
