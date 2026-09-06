package web

import (
	"testing"

	"pago/internal/model"
)

func TestDisplayNameAndInitials(t *testing.T) {
	email := "mario@example.com"
	cases := []struct {
		user     model.User
		wantName string
		wantIni  string
	}{
		{model.User{Name: "Mario R.", TgUsername: "test"}, "Mario R.", "MR"},
		{model.User{TgFirstname: "Mario", TgLastname: "Rossi", TgUsername: "mrossi"}, "Mario Rossi", "MR"},
		{model.User{TgFirstname: "Mario", TgUsername: "test"}, "Mario", "MA"},
		{model.User{TgUsername: "test"}, "test", "TE"},
		{model.User{Name: "Anna Maria Bianchi", TgUsername: "amb", Email: &email}, "Anna Maria Bianchi", "AM"},
	}
	for _, c := range cases {
		u := c.user
		got := buildMeResponse(&u)
		if got.Name != c.wantName || got.Initials != c.wantIni {
			t.Errorf("user %+v: got name=%q initials=%q; want %q %q", c.user, got.Name, got.Initials, c.wantName, c.wantIni)
		}
	}
	u := model.User{Name: "X", TgUsername: "x", Email: &email}
	if got := buildMeResponse(&u); !got.HasEmail || got.Email != email || got.Currency != "EUR" {
		t.Fatalf("unexpected: %+v", got)
	}
}
