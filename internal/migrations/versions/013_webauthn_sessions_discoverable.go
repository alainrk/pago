package versions

import (
	"pago/internal/migrations"

	"gorm.io/gorm"
)

func init() {
	migrations.RegisterMigrationWithRollback("013", "Allow WebAuthn sessions without a user (discoverable passkey login)", allowDiscoverableWebAuthnSessions, rollbackDiscoverableWebAuthnSessions)
}

// Discoverable (usernameless) passkey login starts a ceremony before we know
// who the user is. Those sessions are stored with tg_id = 0, so the foreign key
// to users has to go. Sessions live for 5 minutes and are cleaned up anyway.
func allowDiscoverableWebAuthnSessions(tx *gorm.DB) error {
	return tx.Exec(`
		ALTER TABLE webauthn_sessions DROP CONSTRAINT IF EXISTS fk_webauthn_sessions_tg_id;
	`).Error
}

func rollbackDiscoverableWebAuthnSessions(tx *gorm.DB) error {
	return tx.Exec(`
		DELETE FROM webauthn_sessions WHERE tg_id = 0;
		ALTER TABLE webauthn_sessions ADD CONSTRAINT fk_webauthn_sessions_tg_id
			FOREIGN KEY (tg_id) REFERENCES users (tg_id) ON DELETE CASCADE;
	`).Error
}
