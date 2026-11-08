package repository

import (
	"testing"
)

func TestParseRelyingParties(t *testing.T) {
	tests := []struct {
		name    string
		ids     string
		origins string
		want    []relyingParty
		wantErr bool
	}{
		{
			name:    "single pair",
			ids:     "app.example.com",
			origins: "https://app.example.com",
			want:    []relyingParty{{id: "app.example.com", origin: "https://app.example.com"}},
		},
		{
			name:    "two pairs with spaces and trailing slash",
			ids:     "app.new.example, app.old.example",
			origins: "https://app.new.example/ , https://app.old.example",
			want: []relyingParty{
				{id: "app.new.example", origin: "https://app.new.example"},
				{id: "app.old.example", origin: "https://app.old.example"},
			},
		},
		{
			name:    "length mismatch",
			ids:     "app.new.example,app.old.example",
			origins: "https://app.new.example",
			wantErr: true,
		},
		{
			name:    "empty entry",
			ids:     "app.new.example,",
			origins: "https://app.new.example,https://app.old.example",
			wantErr: true,
		},
		{
			name:    "empty",
			ids:     "",
			origins: "",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseRelyingParties(tt.ids, tt.origins)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected an error, got %v", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(got) != len(tt.want) {
				t.Fatalf("got %d parties, want %d", len(got), len(tt.want))
			}
			for i := range got {
				if got[i].id != tt.want[i].id || got[i].origin != tt.want[i].origin {
					t.Errorf("party %d = (%s, %s), want (%s, %s)", i, got[i].id, got[i].origin, tt.want[i].id, tt.want[i].origin)
				}
			}
		})
	}
}

func TestNewWebAuthnPicksPartyByOrigin(t *testing.T) {
	t.Setenv("WEBAUTHN_RP_ID", "app.new.example,app.old.example")
	t.Setenv("WEBAUTHN_RP_ORIGIN", "https://app.new.example,https://app.old.example")

	wa, err := NewWebAuthn(Repository{})
	if err != nil {
		t.Fatalf("NewWebAuthn: %v", err)
	}

	tests := []struct {
		origin string
		wantID string
	}{
		{"https://app.new.example", "app.new.example"},
		{"https://app.old.example", "app.old.example"},
		{"https://APP.OLD.example/", "app.old.example"},
		{"", "app.new.example"},
		{"https://evil.example", "app.new.example"},
	}
	for _, tt := range tests {
		party := wa.partyFor(tt.origin)
		if party.id != tt.wantID {
			t.Errorf("partyFor(%q) = %s, want %s", tt.origin, party.id, tt.wantID)
		}
		if party.webAuthn == nil {
			t.Errorf("partyFor(%q) has no webauthn instance", tt.origin)
		}
		if got := party.webAuthn.Config.RPID; got != tt.wantID {
			t.Errorf("partyFor(%q) instance RPID = %s, want %s", tt.origin, got, tt.wantID)
		}
	}
}

func TestNewWebAuthnSinglePairStillWorks(t *testing.T) {
	t.Setenv("WEBAUTHN_RP_ID", "localhost")
	t.Setenv("WEBAUTHN_RP_ORIGIN", "http://localhost:5174")

	wa, err := NewWebAuthn(Repository{})
	if err != nil {
		t.Fatalf("NewWebAuthn: %v", err)
	}
	if len(wa.parties) != 1 || wa.parties[0].id != "localhost" || wa.parties[0].origin != "http://localhost:5174" {
		t.Fatalf("unexpected parties: %+v", wa.parties)
	}
}

func TestNewWebAuthnRejectsMismatchedLists(t *testing.T) {
	t.Setenv("WEBAUTHN_RP_ID", "app.new.example,app.old.example")
	t.Setenv("WEBAUTHN_RP_ORIGIN", "https://app.new.example")

	if _, err := NewWebAuthn(Repository{}); err == nil {
		t.Fatal("expected an error for mismatched lists")
	}
}
