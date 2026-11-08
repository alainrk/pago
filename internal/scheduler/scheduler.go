// Package scheduler runs the background jobs of the web server. Today that
// is only the monthly recurring transactions. (The Telegram bot used to run
// this, together with weekly and monthly recaps sent on Telegram; the bot is
// gone.)
package scheduler

import (
	"time"

	"github.com/go-co-op/gocron"
	"github.com/sirupsen/logrus"
)

type Scheduler struct {
	scheduler *gocron.Scheduler
	recurring recurringStore
	logger    *logrus.Logger
}

func NewScheduler(recurring recurringStore, logger *logrus.Logger) *Scheduler {
	return &Scheduler{
		scheduler: gocron.NewScheduler(time.UTC),
		recurring: recurring,
		logger:    logger,
	}
}

func (s *Scheduler) Start() {
	// Apply recurring transactions. Runs right away at startup, then every
	// hour, so a missed hour or day is picked up by the next run.
	// SingletonMode keeps a slow catch-up from overlapping the next run.
	// Running twice at the same time (for example the old bot and this
	// server during the move) is safe: each month is inserted once.
	_, err := s.scheduler.Every(RECURRING_PROCESSING_MIN).Minute().SingletonMode().Do(func() {
		if err := s.processRecurring(); err != nil {
			s.logger.Errorf("Failed to process recurring transactions: %v", err)
		}
	})
	if err != nil {
		s.logger.Errorf("Failed to schedule recurring transactions: %v", err)
	}

	s.scheduler.StartAsync()
	s.logger.Info("Scheduler started successfully")
}

func (s *Scheduler) Stop() {
	s.scheduler.Stop()
	s.logger.Info("Scheduler stopped")
}
