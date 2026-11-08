package db

import (
	"os"
	"testing"
)

// The Telegram cleanup script (scripts/telegram-cleanup.sql) must clear the
// names and the bot session, keep the account and its data, and leave rows
// the code can still read (NULL names).
func TestTelegramCleanupScript(t *testing.T) {
	d := testDB(t)
	sqlText, err := os.ReadFile("../../scripts/telegram-cleanup.sql")
	if err != nil {
		t.Fatal(err)
	}

	tgID := testUser(t, d)
	email := uniq("tg") + "@example.com"
	if err := d.conn.Exec(`UPDATE users SET tg_username = ?, tg_firstname = 'Mario', tg_lastname = 'Rossi', name = 'Mario',
		email = ?, session = '{"state":"inserting_expense","body":"pizza 12"}' WHERE tg_id = ?`, uniq("mario"), email, tgID).Error; err != nil {
		t.Fatal(err)
	}
	keep := testUser(t, d)
	if err := d.conn.Exec(`UPDATE users SET tg_firstname = 'Anna', name = 'Anna Bianchi' WHERE tg_id = ?`, keep).Error; err != nil {
		t.Fatal(err)
	}

	if err := d.conn.Exec(string(sqlText)).Error; err != nil {
		t.Fatal(err)
	}

	u, err := d.GetUser(tgID)
	if err != nil {
		t.Fatalf("user not readable after cleanup: %v", err)
	}
	if u.TgUsername != "" || u.TgFirstname != "" || u.TgLastname != "" || u.Session.State != "" || u.Session.Body != "" {
		t.Fatalf("Telegram data left: %+v", u)
	}
	if u.Name == "Mario" || u.Name == "" {
		t.Fatalf("name should no longer be the Telegram name: %q", u.Name)
	}
	if u.Email == nil || *u.Email != email {
		t.Fatal("email must stay")
	}

	k, err := d.GetUser(keep)
	if err != nil || k.Name != "Anna Bianchi" || k.TgFirstname != "" {
		t.Fatalf("other user: %+v %v", k, err)
	}

	// Saving a cleaned row (as the web server may) still works.
	if err := d.SetUser(u); err != nil {
		t.Fatalf("save after cleanup: %v", err)
	}
	var n int64
	d.conn.Raw(`SELECT count(*) FROM users WHERE tg_id = ? AND coalesce(tg_username, '') = '' AND coalesce(tg_firstname, '') = ''`, tgID).Scan(&n)
	if n != 1 {
		t.Fatal("saving the row must not write Telegram names back")
	}
}
