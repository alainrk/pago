package versions

import (
	"pago/internal/migrations"

	"gorm.io/gorm"
)

func init() {
	migrations.RegisterMigrationWithRollback("016", "Quick entry (DeepSeek) consent on users", addAIConsent, rollbackAIConsent)
}

// Quick entry sends the typed text to DeepSeek in China. Before the first use
// the person chooses: ai_consent is 'accepted' or 'declined' (NULL = not asked
// yet), with the time and the privacy policy version they saw. The server only
// calls the AI for 'accepted' on the current policy version.
func addAIConsent(tx *gorm.DB) error {
	return tx.Exec(`
		ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_consent VARCHAR(16) NULL;
		ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_consent_at TIMESTAMP WITH TIME ZONE NULL;
		ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_consent_version VARCHAR(32) NULL;
	`).Error
}

func rollbackAIConsent(tx *gorm.DB) error {
	return tx.Exec(`
		ALTER TABLE users DROP COLUMN IF EXISTS ai_consent_version;
		ALTER TABLE users DROP COLUMN IF EXISTS ai_consent_at;
		ALTER TABLE users DROP COLUMN IF EXISTS ai_consent;
	`).Error
}
