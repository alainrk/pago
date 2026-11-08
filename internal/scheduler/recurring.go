package scheduler

import (
	"fmt"
	"time"

	"pago/internal/db"
	"pago/internal/model"
	"pago/internal/recurring"

	"github.com/sirupsen/logrus"
)

const RECURRING_PROCESSING_MIN = 60

// maxCatchUpPerRule caps how many months one rule can apply in a single run.
// Ten years of downtime is far more than any real outage; the cap only stops
// a runaway loop if a rule ever fails to move forward.
const maxCatchUpPerRule = 120

type recurringStore interface {
	DueIDs(today time.Time) ([]int64, error)
	ApplyOnce(id int64, today time.Time) (db.ApplyResult, error)
}

type recurringRunStats struct {
	Rules     int
	Created   int
	Conflicts int
	Errors    int
}

// applyDueRecurring applies every month owed by every due rule, up to today.
// Each month is its own DB transaction, so a crash keeps the months already
// done and the next run carries on. An error on one rule is logged and the
// run moves on to the next rule. onCreated is called after each insert.
func applyDueRecurring(store recurringStore, today time.Time, logger *logrus.Logger, onCreated func(model.Transaction)) (recurringRunStats, error) {
	var stats recurringRunStats

	ids, err := store.DueIDs(today)
	if err != nil {
		return stats, fmt.Errorf("failed to list due recurring transactions: %w", err)
	}

	for _, id := range ids {
		applied := false
		for range maxCatchUpPerRule {
			res, err := store.ApplyOnce(id, today)
			if err != nil {
				stats.Errors++
				logger.Errorf("Failed to apply recurring transaction %d: %v", id, err)
				break
			}
			if !res.Applied {
				// Up to date, deleted, or held by another worker.
				break
			}
			applied = true
			if res.Conflict {
				stats.Conflicts++
				logger.Errorf("Recurring transaction %d already had a row for this month; moved forward without inserting", id)
				continue
			}
			stats.Created++
			if onCreated != nil && res.Transaction != nil {
				onCreated(*res.Transaction)
			}
		}
		if applied {
			stats.Rules++
		}
	}

	return stats, nil
}

// processRecurring applies every due recurring transaction.
func (s *Scheduler) processRecurring() error {
	stats, err := applyDueRecurring(s.recurring, recurring.Today(), s.logger, nil)
	if err != nil {
		return err
	}
	if stats.Rules > 0 || stats.Errors > 0 {
		s.logger.Infof("Recurring transactions: %d rules applied, %d transactions created, %d conflicts, %d errors",
			stats.Rules, stats.Created, stats.Conflicts, stats.Errors)
	}
	return nil
}
