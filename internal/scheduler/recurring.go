package scheduler

import (
	"fmt"
	"html"
	"slices"
	"time"

	"pago/internal/client"
	"pago/internal/db"
	"pago/internal/model"
	"pago/internal/recurring"

	gotgbot "github.com/PaulSonOfLars/gotgbot/v2"
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

// shouldCheckBudget reports whether a generated transaction should run the
// budget check. Catch-up rows for past months are skipped, so a long outage
// does not send a burst of stale alerts.
func shouldCheckBudget(tx model.Transaction, today time.Time) bool {
	return tx.Type == model.TypeExpense && recurring.Period(tx.Date) == recurring.Period(today)
}

// shouldSendBudgetAlert reports whether a budget result is worth a message.
// The bot repeats the over-budget line on every expense it confirms, but a
// standalone message is only sent when this transaction crossed 80% or 100%.
func shouldSendBudgetAlert(p *client.BudgetProgress, amount float64) bool {
	if p == nil {
		return false
	}
	if slices.Contains(p.NewAlerts, 80) {
		return true
	}
	return slices.Contains(p.NewAlerts, 100) && p.Spent-amount < p.Limit
}

func (s *Scheduler) processRecurring() error {
	today := recurring.Today()
	stats, err := applyDueRecurring(&s.repositories.Recurring, today, s.logger, func(tx model.Transaction) {
		s.checkRecurringBudget(tx, today)
	})
	if err != nil {
		return err
	}
	if stats.Rules > 0 || stats.Errors > 0 {
		s.logger.Infof("Recurring transactions: %d rules applied, %d transactions created, %d conflicts, %d errors",
			stats.Rules, stats.Created, stats.Conflicts, stats.Errors)
	}
	return nil
}

// checkRecurringBudget runs the usual budget check for a generated expense and
// sends a message when a threshold was crossed. Failures are logged only:
// the transaction is already saved.
func (s *Scheduler) checkRecurringBudget(tx model.Transaction, today time.Time) {
	if !shouldCheckBudget(tx, today) {
		return
	}
	c := &client.Client{Logger: s.logger, Repositories: s.repositories}
	progress, err := c.EvaluateAfterExpenseInsert(tx)
	if err != nil {
		s.logger.Warnf("Budget check failed for recurring transaction %d: %v", tx.ID, err)
		return
	}
	if !shouldSendBudgetAlert(progress, tx.Amount) {
		return
	}
	msg := fmt.Sprintf("🔁 Recurring: <b>%s</b> %.2f € added.", html.EscapeString(tx.Description), tx.Amount) + client.FormatBudgetSuffix(progress)
	if _, err := s.bot.SendMessage(tx.TgID, msg, &gotgbot.SendMessageOpts{ParseMode: "HTML"}); err != nil {
		s.logger.Warnf("Failed to send budget alert for recurring transaction %d: %v", tx.ID, err)
	}
}
