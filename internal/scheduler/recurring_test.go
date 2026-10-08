package scheduler

import (
	"errors"
	"io"
	"testing"
	"time"

	"pago/internal/client"
	"pago/internal/db"
	"pago/internal/model"
	"pago/internal/recurring"

	"github.com/sirupsen/logrus"
)

func day(s string) time.Time {
	t, err := time.Parse(time.DateOnly, s)
	if err != nil {
		panic(err)
	}
	return t
}

type fakeRule struct {
	id   int64
	typ  model.TransactionType
	next time.Time
	// failAt makes ApplyOnce fail when the rule reaches this due date.
	failAt time.Time
	// conflictAt makes ApplyOnce report a unique index conflict on this date.
	conflictAt time.Time
}

// fakeStore mimics the DB: one ApplyOnce consumes one owed month.
type fakeStore struct {
	rules   map[int64]*fakeRule
	dueErr  error
	created []model.Transaction
}

func (f *fakeStore) DueIDs(today time.Time) ([]int64, error) {
	if f.dueErr != nil {
		return nil, f.dueErr
	}
	var ids []int64
	for id := int64(1); id <= int64(len(f.rules)); id++ {
		if r, ok := f.rules[id]; ok && !r.next.After(today) {
			ids = append(ids, id)
		}
	}
	return ids, nil
}

func (f *fakeStore) ApplyOnce(id int64, today time.Time) (db.ApplyResult, error) {
	r, ok := f.rules[id]
	if !ok || r.next.After(today) {
		return db.ApplyResult{}, nil
	}
	if r.next.Equal(r.failAt) {
		return db.ApplyResult{}, errors.New("boom")
	}
	due := r.next
	r.next = recurring.NextAfter(due)
	if due.Equal(r.conflictAt) {
		return db.ApplyResult{Applied: true, Conflict: true}, nil
	}
	tx := model.Transaction{ID: int64(len(f.created) + 1), Type: r.typ, Date: due, Amount: 10}
	f.created = append(f.created, tx)
	return db.ApplyResult{Applied: true, Transaction: &tx}, nil
}

func quietLogger() *logrus.Logger {
	l := logrus.New()
	l.SetOutput(io.Discard)
	return l
}

func dates(txs []model.Transaction) []string {
	out := make([]string, len(txs))
	for i, t := range txs {
		out[i] = t.Date.Format(time.DateOnly)
	}
	return out
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestApplyDueRecurring_CatchUp(t *testing.T) {
	store := &fakeStore{rules: map[int64]*fakeRule{
		1: {id: 1, typ: model.TypeExpense, next: day("2026-08-05")},
	}}
	var seen []model.Transaction
	stats, err := applyDueRecurring(store, day("2026-10-08"), quietLogger(), func(tx model.Transaction) { seen = append(seen, tx) })
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"2026-08-05", "2026-09-05", "2026-10-05"}
	if got := dates(store.created); !equalStrings(got, want) {
		t.Fatalf("created %v; want %v", got, want)
	}
	if len(seen) != 3 {
		t.Errorf("onCreated called %d times; want 3", len(seen))
	}
	if !store.rules[1].next.Equal(day("2026-11-05")) {
		t.Errorf("next due = %s; want 2026-11-05", store.rules[1].next.Format(time.DateOnly))
	}
	if stats.Rules != 1 || stats.Created != 3 || stats.Errors != 0 {
		t.Errorf("stats = %+v", stats)
	}
}

func TestApplyDueRecurring_DueTodayAndNotYetDue(t *testing.T) {
	store := &fakeStore{rules: map[int64]*fakeRule{
		1: {id: 1, typ: model.TypeExpense, next: day("2026-10-08")},
		2: {id: 2, typ: model.TypeExpense, next: day("2026-10-09")},
	}}
	stats, err := applyDueRecurring(store, day("2026-10-08"), quietLogger(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := dates(store.created); !equalStrings(got, []string{"2026-10-08"}) {
		t.Fatalf("created %v; want only 2026-10-08", got)
	}
	if !store.rules[2].next.Equal(day("2026-10-09")) {
		t.Errorf("rule 2 moved but was not due")
	}
	if stats.Rules != 1 {
		t.Errorf("stats = %+v", stats)
	}
}

func TestApplyDueRecurring_SecondRunDoesNothing(t *testing.T) {
	store := &fakeStore{rules: map[int64]*fakeRule{
		1: {id: 1, typ: model.TypeExpense, next: day("2026-09-05")},
	}}
	today := day("2026-10-08")
	if _, err := applyDueRecurring(store, today, quietLogger(), nil); err != nil {
		t.Fatal(err)
	}
	stats, err := applyDueRecurring(store, today, quietLogger(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if stats.Created != 0 || len(store.created) != 2 {
		t.Errorf("second run created rows: stats=%+v total=%d", stats, len(store.created))
	}
}

func TestApplyDueRecurring_ErrorDoesNotBlockOthers(t *testing.T) {
	store := &fakeStore{rules: map[int64]*fakeRule{
		1: {id: 1, typ: model.TypeExpense, next: day("2026-09-05"), failAt: day("2026-10-05")},
		2: {id: 2, typ: model.TypeIncome, next: day("2026-10-01")},
	}}
	stats, err := applyDueRecurring(store, day("2026-10-08"), quietLogger(), nil)
	if err != nil {
		t.Fatal(err)
	}
	// Rule 1 keeps September, fails on October and stays owed. Rule 2 still runs.
	if got := dates(store.created); !equalStrings(got, []string{"2026-09-05", "2026-10-01"}) {
		t.Fatalf("created %v", got)
	}
	if !store.rules[1].next.Equal(day("2026-10-05")) {
		t.Errorf("failed rule should still owe October, next = %s", store.rules[1].next.Format(time.DateOnly))
	}
	if stats.Errors != 1 || stats.Rules != 2 || stats.Created != 2 {
		t.Errorf("stats = %+v", stats)
	}

	// Once the problem is gone, the next run picks October up.
	store.rules[1].failAt = time.Time{}
	if _, err := applyDueRecurring(store, day("2026-10-08"), quietLogger(), nil); err != nil {
		t.Fatal(err)
	}
	if !store.rules[1].next.Equal(day("2026-11-05")) {
		t.Errorf("retry did not apply October, next = %s", store.rules[1].next.Format(time.DateOnly))
	}
}

func TestApplyDueRecurring_ConflictMovesOn(t *testing.T) {
	store := &fakeStore{rules: map[int64]*fakeRule{
		1: {id: 1, typ: model.TypeExpense, next: day("2026-09-05"), conflictAt: day("2026-09-05")},
	}}
	var calls int
	stats, err := applyDueRecurring(store, day("2026-10-08"), quietLogger(), func(model.Transaction) { calls++ })
	if err != nil {
		t.Fatal(err)
	}
	if stats.Conflicts != 1 || stats.Created != 1 || calls != 1 {
		t.Errorf("stats = %+v, calls = %d", stats, calls)
	}
}

func TestApplyDueRecurring_DueIDsError(t *testing.T) {
	store := &fakeStore{dueErr: errors.New("db down")}
	if _, err := applyDueRecurring(store, day("2026-10-08"), quietLogger(), nil); err == nil {
		t.Fatal("expected an error")
	}
}

// stuckStore never moves the rule forward, to check the loop cap.
type stuckStore struct{ calls int }

func (s *stuckStore) DueIDs(time.Time) ([]int64, error) { return []int64{1}, nil }
func (s *stuckStore) ApplyOnce(int64, time.Time) (db.ApplyResult, error) {
	s.calls++
	return db.ApplyResult{Applied: true, Transaction: &model.Transaction{}}, nil
}

func TestApplyDueRecurring_LoopCap(t *testing.T) {
	store := &stuckStore{}
	if _, err := applyDueRecurring(store, day("2026-10-08"), quietLogger(), nil); err != nil {
		t.Fatal(err)
	}
	if store.calls != maxCatchUpPerRule {
		t.Errorf("calls = %d; want %d", store.calls, maxCatchUpPerRule)
	}
}

func TestShouldCheckBudget(t *testing.T) {
	today := day("2026-10-08")
	cases := []struct {
		name string
		tx   model.Transaction
		want bool
	}{
		{"current month expense", model.Transaction{Type: model.TypeExpense, Date: day("2026-10-05")}, true},
		{"past month expense", model.Transaction{Type: model.TypeExpense, Date: day("2026-09-05")}, false},
		{"current month income", model.Transaction{Type: model.TypeIncome, Date: day("2026-10-05")}, false},
		{"same month last year", model.Transaction{Type: model.TypeExpense, Date: day("2025-10-05")}, false},
	}
	for _, c := range cases {
		if got := shouldCheckBudget(c.tx, today); got != c.want {
			t.Errorf("%s: got %v; want %v", c.name, got, c.want)
		}
	}
}

func TestShouldSendBudgetAlert(t *testing.T) {
	cases := []struct {
		name   string
		p      *client.BudgetProgress
		amount float64
		want   bool
	}{
		{"no budget", nil, 10, false},
		{"no alert", &client.BudgetProgress{Limit: 100, Spent: 50}, 10, false},
		{"crossed 80", &client.BudgetProgress{Limit: 100, Spent: 85, NewAlerts: []int16{80}}, 10, true},
		{"crossed 100", &client.BudgetProgress{Limit: 100, Spent: 105, NewAlerts: []int16{100}}, 10, true},
		{"already over", &client.BudgetProgress{Limit: 100, Spent: 130, NewAlerts: []int16{100}}, 10, false},
		{"landed exactly on 100", &client.BudgetProgress{Limit: 100, Spent: 100, NewAlerts: []int16{100}}, 10, true},
	}
	for _, c := range cases {
		if got := shouldSendBudgetAlert(c.p, c.amount); got != c.want {
			t.Errorf("%s: got %v; want %v", c.name, got, c.want)
		}
	}
}
