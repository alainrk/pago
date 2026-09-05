package web

import (
	"net/http"
	"os"
	"strings"
)

// corsMiddleware lets a browser app served from another origin (for example
// the SPA on Cloudflare) call this API with cookies.
//
// Allowed origins come from WEB_CORS_ORIGINS, a comma separated list of full
// origins such as "https://app.example.com,http://localhost:5174". When the
// variable is empty no CORS headers are added, which keeps the old same-origin
// behaviour for deployments that serve the frontend from this server.
func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	allowed := parseAllowedOrigins(os.Getenv("WEB_CORS_ORIGINS"))
	return corsHandler(allowed, next)
}

// parseAllowedOrigins splits the env value and normalises each origin.
func parseAllowedOrigins(raw string) map[string]bool {
	allowed := make(map[string]bool)
	for _, o := range strings.Split(raw, ",") {
		o = strings.TrimRight(strings.TrimSpace(o), "/")
		if o == "" {
			continue
		}
		allowed[strings.ToLower(o)] = true
	}
	return allowed
}

func corsHandler(allowed map[string]bool, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" || !allowed[strings.ToLower(origin)] {
			// Not a cross-origin request we know about. Preflights from unknown
			// origins get no CORS headers, so the browser blocks the call.
			if r.Method == http.MethodOptions && origin != "" {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
			return
		}

		h := w.Header()
		h.Set("Access-Control-Allow-Origin", origin)
		h.Set("Access-Control-Allow-Credentials", "true")
		h.Add("Vary", "Origin")
		// Lets the SPA read the CSV file name on export.
		h.Set("Access-Control-Expose-Headers", "Content-Disposition")

		if r.Method == http.MethodOptions {
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			h.Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Credential-Name")
			h.Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
