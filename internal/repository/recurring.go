package repository

import (
	"time"

	"pago/internal/db"
	"pago/internal/model"
)

type Recurring struct {
	Repository
}

func (r *Recurring) List(tgID int64) ([]model.RecurringTransaction, error) {
	return r.DB.ListRecurring(tgID)
}

func (r *Recurring) Count(tgID int64) (int64, error) {
	return r.DB.CountRecurring(tgID)
}

func (r *Recurring) Get(id, tgID int64) (*model.RecurringTransaction, error) {
	return r.DB.GetRecurring(id, tgID)
}

func (r *Recurring) Create(rule *model.RecurringTransaction, linkTxID *int64, linkPeriod string) error {
	return r.DB.CreateRecurring(rule, linkTxID, linkPeriod)
}

func (r *Recurring) CreateWithTransaction(t *model.Transaction, rule *model.RecurringTransaction, link bool) error {
	return r.DB.CreateTransactionWithRecurring(t, rule, link)
}

func (r *Recurring) Update(id, tgID int64, apply func(rule *model.RecurringTransaction) error) (*model.RecurringTransaction, error) {
	return r.DB.UpdateRecurring(id, tgID, apply)
}

func (r *Recurring) Delete(id, tgID int64) error {
	return r.DB.DeleteRecurring(id, tgID)
}

func (r *Recurring) DueIDs(today time.Time) ([]int64, error) {
	return r.DB.DueRecurringIDs(today)
}

func (r *Recurring) ApplyOnce(id int64, today time.Time) (db.ApplyResult, error) {
	return r.DB.ApplyRecurringOnce(id, today)
}
