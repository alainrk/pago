package repository

import (
	"pago/internal/db"
	"pago/internal/model"
	"time"
)

// GetCategoryAggregates exposes per-category aggregates (amount + count).
func (r *Transactions) GetCategoryAggregates(tgID int64, startDate, endDate time.Time, t model.TransactionType) ([]db.CategoryAggregate, error) {
	return r.DB.GetCategoryAggregates(tgID, startDate, endDate, t)
}

// GetMonthlyTotalsByRange exposes month/type pivoted totals over a date range.
func (r *Transactions) GetMonthlyTotalsByRange(tgID int64, startDate, endDate time.Time) ([]db.MonthTotal, error) {
	return r.DB.GetMonthlyTotalsByRange(tgID, startDate, endDate)
}

// GetCategoryMonthlyTotals exposes per (month, category) totals over a date range.
func (r *Transactions) GetCategoryMonthlyTotals(tgID int64, startDate, endDate time.Time, t model.TransactionType) ([]db.CategoryMonthTotal, error) {
	return r.DB.GetCategoryMonthlyTotals(tgID, startDate, endDate, t)
}
