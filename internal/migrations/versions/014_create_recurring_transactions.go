package versions

import (
	"pago/internal/migrations"

	"gorm.io/gorm"
)

func init() {
	migrations.RegisterMigrationWithRollback("014", "Create recurring_transactions and link transactions to them", createRecurringTransactions, rollbackRecurringTransactions)
}

func createRecurringTransactions(tx *gorm.DB) error {
	return tx.Exec(`
		CREATE TABLE IF NOT EXISTS recurring_transactions (
			id             BIGSERIAL PRIMARY KEY,
			tg_id          BIGINT NOT NULL,
			type           transaction_type NOT NULL,
			category       transaction_category NOT NULL,
			amount         DECIMAL(15,2) NOT NULL CHECK (amount > 0),
			currency       currency_type NOT NULL DEFAULT 'EUR',
			description    TEXT NOT NULL CHECK (description <> ''),
			day_of_month   SMALLINT NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
			next_due_date  DATE NOT NULL,
			created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
		);

		CREATE INDEX IF NOT EXISTS idx_recurring_transactions_tg_id ON recurring_transactions (tg_id);
		CREATE INDEX IF NOT EXISTS idx_recurring_transactions_next_due_date ON recurring_transactions (next_due_date);

		ALTER TABLE recurring_transactions ADD CONSTRAINT fk_recurring_transactions_tg_id FOREIGN KEY (tg_id) REFERENCES users (tg_id);

		ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurring_id BIGINT NULL;
		ALTER TABLE transactions ADD COLUMN IF NOT EXISTS recurring_period CHAR(7) NULL;

		ALTER TABLE transactions ADD CONSTRAINT fk_transactions_recurring_id
			FOREIGN KEY (recurring_id) REFERENCES recurring_transactions (id) ON DELETE SET NULL;

		CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_recurring_period
			ON transactions (recurring_id, recurring_period)
			WHERE recurring_id IS NOT NULL;
	`).Error
}

func rollbackRecurringTransactions(tx *gorm.DB) error {
	return tx.Exec(`
		DROP INDEX IF EXISTS idx_transactions_recurring_period;
		ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_recurring_id;
		ALTER TABLE transactions DROP COLUMN IF EXISTS recurring_period;
		ALTER TABLE transactions DROP COLUMN IF EXISTS recurring_id;
		DROP TABLE IF EXISTS recurring_transactions;
	`).Error
}
