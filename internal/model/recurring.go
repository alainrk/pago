package model

import "time"

// RecurringTransaction is a monthly rule that adds a transaction on a fixed
// day of month. NextDueDate is the next date the rule owes: once a month is
// applied it moves forward and never comes back.
type RecurringTransaction struct {
	ID          int64               `gorm:"column:id;primaryKey;autoIncrement"`
	TgID        int64               `gorm:"column:tg_id;not null;index"`
	Type        TransactionType     `gorm:"column:type;not null;type:transaction_type"`
	Category    TransactionCategory `gorm:"column:category;not null;type:transaction_category"`
	Amount      float64             `gorm:"column:amount;not null;type:decimal(15,2)"`
	Currency    CurrencyType        `gorm:"column:currency;not null;type:currency_type;default:'EUR'"`
	Description string              `gorm:"column:description;not null;type:text"`
	DayOfMonth  int                 `gorm:"column:day_of_month;not null"`
	NextDueDate time.Time           `gorm:"column:next_due_date;not null;type:date;index"`
	CreatedAt   time.Time           `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt   time.Time           `gorm:"column:updated_at;autoUpdateTime"`
}

// TableName overrides the table name
func (RecurringTransaction) TableName() string {
	return "recurring_transactions"
}
