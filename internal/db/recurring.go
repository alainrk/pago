package db

import (
	"errors"
	"time"

	"pago/internal/model"
	"pago/internal/recurring"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ErrSourceTransactionTaken is returned when the transaction a rule was built
// from is gone, belongs to someone else, or is already linked to a rule.
var ErrSourceTransactionTaken = errors.New("source transaction cannot be linked")

// ApplyResult tells what ApplyRecurringOnce did.
type ApplyResult struct {
	// Applied is true when a month was consumed and the rule moved forward.
	Applied bool
	// Transaction is the row that was inserted. Nil when the month already
	// had a row for this rule (Conflict) or when nothing was applied.
	Transaction *model.Transaction
	// Conflict is true when the unique (rule, month) index rejected the
	// insert. The rule still moved forward. It should never happen.
	Conflict bool
}

// ListRecurring returns a user's rules, sorted by day of month.
func (db *DB) ListRecurring(tgID int64) ([]model.RecurringTransaction, error) {
	var rules []model.RecurringTransaction
	err := db.conn.Where("tg_id = ?", tgID).Order("day_of_month ASC, id ASC").Find(&rules).Error
	return rules, err
}

// CountRecurring returns how many rules a user has.
func (db *DB) CountRecurring(tgID int64) (int64, error) {
	var n int64
	err := db.conn.Model(&model.RecurringTransaction{}).Where("tg_id = ?", tgID).Count(&n).Error
	return n, err
}

// GetRecurring returns one of the user's rules or gorm.ErrRecordNotFound.
func (db *DB) GetRecurring(id, tgID int64) (*model.RecurringTransaction, error) {
	var rule model.RecurringTransaction
	if err := db.conn.Where("id = ? AND tg_id = ?", id, tgID).First(&rule).Error; err != nil {
		return nil, err
	}
	return &rule, nil
}

// CreateRecurring inserts a rule. When linkTxID is set, that transaction is
// linked to the new rule as the payment for linkPeriod, in the same DB
// transaction. The link only happens if the transaction belongs to the same
// user and is not linked yet; otherwise ErrSourceTransactionTaken is returned
// and nothing is saved.
func (db *DB) CreateRecurring(rule *model.RecurringTransaction, linkTxID *int64, linkPeriod string) error {
	return db.conn.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(rule).Error; err != nil {
			return err
		}
		if linkTxID == nil {
			return nil
		}
		res := tx.Model(&model.Transaction{}).
			Where("id = ? AND tg_id = ? AND recurring_id IS NULL", *linkTxID, rule.TgID).
			Updates(map[string]any{"recurring_id": rule.ID, "recurring_period": linkPeriod})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected != 1 {
			return ErrSourceTransactionTaken
		}
		return nil
	})
}

// CreateTransactionWithRecurring inserts a transaction and a rule together.
// When link is true, the transaction is the payment for its own month and is
// linked to the rule; otherwise both are saved but stay independent.
func (db *DB) CreateTransactionWithRecurring(t *model.Transaction, rule *model.RecurringTransaction, link bool) error {
	return db.conn.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(rule).Error; err != nil {
			return err
		}
		if link {
			period := recurring.Period(t.Date)
			t.RecurringID = &rule.ID
			t.RecurringPeriod = &period
		}
		return tx.Create(t).Error
	})
}

// UpdateRecurring locks one of the user's rules, lets apply change it, and
// saves it. The lock waits for a running scheduler step on the same rule, so
// an edit and an apply never interleave.
func (db *DB) UpdateRecurring(id, tgID int64, apply func(rule *model.RecurringTransaction) error) (*model.RecurringTransaction, error) {
	var rule model.RecurringTransaction
	err := db.conn.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND tg_id = ?", id, tgID).First(&rule).Error; err != nil {
			return err
		}
		if err := apply(&rule); err != nil {
			return err
		}
		return tx.Save(&rule).Error
	})
	if err != nil {
		return nil, err
	}
	return &rule, nil
}

// DeleteRecurring deletes one of the user's rules. Transactions it created
// stay; the foreign key clears their link. Returns gorm.ErrRecordNotFound if
// there is no such rule.
func (db *DB) DeleteRecurring(id, tgID int64) error {
	res := db.conn.Where("id = ? AND tg_id = ?", id, tgID).Delete(&model.RecurringTransaction{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

// DueRecurringIDs returns the ids of all rules that owe a month on or before today.
func (db *DB) DueRecurringIDs(today time.Time) ([]int64, error) {
	var ids []int64
	err := db.conn.Model(&model.RecurringTransaction{}).
		Where("next_due_date <= ?", today.Format(time.DateOnly)).
		Order("id ASC").
		Pluck("id", &ids).Error
	return ids, err
}

// ApplyRecurringOnce applies a single owed month of one rule, in one DB
// transaction: it locks the rule (skipping it if another worker holds it),
// inserts the transaction dated on the due date, and moves the rule to the
// next month. A crash leaves both undone. When the rule is locked elsewhere
// or no longer due, it returns a zero ApplyResult and no error.
func (db *DB) ApplyRecurringOnce(id int64, today time.Time) (ApplyResult, error) {
	var result ApplyResult
	err := db.conn.Transaction(func(tx *gorm.DB) error {
		var rule model.RecurringTransaction
		res := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("id = ? AND next_due_date <= ?", id, today.Format(time.DateOnly)).
			Limit(1).Find(&rule)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return nil
		}

		due := recurring.Date(rule.NextDueDate.Year(), rule.NextDueDate.Month(), rule.NextDueDate.Day())
		period := recurring.Period(due)
		t := model.Transaction{
			TgID:            rule.TgID,
			Date:            due,
			Type:            rule.Type,
			Category:        rule.Category,
			Amount:          rule.Amount,
			Currency:        rule.Currency,
			Description:     rule.Description,
			RecurringID:     &rule.ID,
			RecurringPeriod: &period,
		}
		ins := tx.Clauses(clause.OnConflict{
			Columns:     []clause.Column{{Name: "recurring_id"}, {Name: "recurring_period"}},
			TargetWhere: clause.Where{Exprs: []clause.Expression{clause.Expr{SQL: "recurring_id IS NOT NULL"}}},
			DoNothing:   true,
		}).Create(&t)
		if ins.Error != nil {
			return ins.Error
		}

		if err := tx.Model(&rule).UpdateColumns(map[string]any{
			"next_due_date": recurring.NextAfter(due).Format(time.DateOnly),
			"updated_at":    time.Now().UTC(),
		}).Error; err != nil {
			return err
		}

		result.Applied = true
		if ins.RowsAffected == 1 {
			result.Transaction = &t
		} else {
			result.Conflict = true
		}
		return nil
	})
	if err != nil {
		return ApplyResult{}, err
	}
	return result, nil
}
