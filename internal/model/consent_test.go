package model

import "testing"

func strp(s string) *string { return &s }

func TestQuickEntryChoice(t *testing.T) {
	cases := []struct {
		name    string
		consent *string
		version *string
		want    string
	}{
		{"not asked", nil, nil, ""},
		{"accepted", strp(AIConsentAccepted), strp(AIPolicyVersion), AIConsentAccepted},
		{"declined", strp(AIConsentDeclined), strp(AIPolicyVersion), AIConsentDeclined},
		{"old policy version asks again", strp(AIConsentAccepted), strp("2020-01-01"), ""},
		{"unknown value", strp("maybe"), strp(AIPolicyVersion), ""},
	}
	for _, c := range cases {
		u := User{AIConsent: c.consent, AIConsentVersion: c.version}
		if got := u.QuickEntryChoice(); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}
