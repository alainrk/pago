package versions

import (
	"pago/internal/migrations"

	"gorm.io/gorm"
)

func init() {
	migrations.RegisterMigrationWithRollback("015", "Google sign-in, hand-off tokens and passkey domains", googleSignIn, rollbackGoogleSignIn)
}

// googleSignIn prepares the users table for accounts that start on the web
// with Google instead of on Telegram.
//
//   - users.tg_id stays the account id (every other table points at it). For
//     the accounts that exist today it is the Telegram id from the old bot.
//     Accounts created with Google get a negative id from users_web_id_seq, so
//     they can never clash with those. The Telegram columns are kept as they
//     are (no data is dropped here).
//   - users.google_sub is Google's stable account id.
//   - tg_username is only unique when set: web accounts have none.
//   - link_tokens holds one-time tokens for the hand-off from the old address
//     to the new one. Only a sha256 of the token is kept.
//   - oauth_states holds the short-lived state of a Google sign-in, with the
//     hand-off token hash when there is one.
//   - webauthn_credentials.rp_id is the domain a passkey belongs to. Rows from
//     before this migration have NULL: they all belong to the old domain.
//
// Old code keeps working on this schema, so the migration can run before the
// deploy.
func googleSignIn(tx *gorm.DB) error {
	return tx.Exec(`
		ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255) NULL;
		CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL;

		ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tg_username_key;
		ALTER TABLE users DROP CONSTRAINT IF EXISTS uni_users_tg_username;
		CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tg_username ON users (tg_username)
			WHERE tg_username IS NOT NULL AND tg_username <> '';

		CREATE SEQUENCE IF NOT EXISTS users_web_id_seq INCREMENT BY -1 MAXVALUE -1 START WITH -1;

		CREATE TABLE IF NOT EXISTS link_tokens (
			id          BIGSERIAL PRIMARY KEY,
			tg_id       BIGINT NOT NULL REFERENCES users (tg_id) ON DELETE CASCADE,
			purpose     VARCHAR(16) NOT NULL,
			token_hash  CHAR(64) NOT NULL UNIQUE,
			expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
			used_at     TIMESTAMP WITH TIME ZONE NULL,
			created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_link_tokens_expires_at ON link_tokens (expires_at);

		CREATE TABLE IF NOT EXISTS oauth_states (
			state_hash     CHAR(64) PRIMARY KEY,
			nonce          VARCHAR(64) NOT NULL,
			code_verifier  VARCHAR(128) NOT NULL,
			redirect_url   TEXT NOT NULL,
			return_origin  TEXT NOT NULL,
			return_path    TEXT NOT NULL,
			handoff_hash   CHAR(64) NULL,
			expires_at     TIMESTAMP WITH TIME ZONE NOT NULL,
			created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states (expires_at);

		ALTER TABLE webauthn_credentials ADD COLUMN IF NOT EXISTS rp_id VARCHAR(255) NULL;
	`).Error
}

// The rollback refuses to run while web-only accounts exist, because their
// rows would lose the only link to their owner.
func rollbackGoogleSignIn(tx *gorm.DB) error {
	return tx.Exec(`
		DO $$
		BEGIN
			IF EXISTS (SELECT 1 FROM users WHERE tg_id < 0) THEN
				RAISE EXCEPTION 'web-only accounts exist (tg_id < 0), roll back by hand';
			END IF;
		END $$;

		ALTER TABLE webauthn_credentials DROP COLUMN IF EXISTS rp_id;
		DROP TABLE IF EXISTS oauth_states;
		DROP TABLE IF EXISTS link_tokens;
		DROP SEQUENCE IF EXISTS users_web_id_seq;
		DROP INDEX IF EXISTS idx_users_tg_username;
		ALTER TABLE users ADD CONSTRAINT users_tg_username_key UNIQUE (tg_username);
		DROP INDEX IF EXISTS idx_users_google_sub;
		ALTER TABLE users DROP COLUMN IF EXISTS google_sub;
	`).Error
}
