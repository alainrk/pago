package db

import (
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"pago/internal/migrations"
	_ "pago/internal/migrations/versions" // Import all migrations
	"pago/internal/model"
	"pago/internal/recurring"

	"gorm.io/gorm"
)

// These tests need a real Postgres. Point TEST_DATABASE_URL at a throwaway
// database; migrations are applied to it and each test cleans up its rows.
//
//	docker run -d --rm --name pago-test -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:16-alpine
//	TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/postgres?sslmode=disable go test ./internal/db/
func testDB(t *testing.T) *DB {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	d, err := NewDB(url)
	if err != nil {
		t.Fatal(err)
	}
	if err := migrations.NewMigrator(d.conn).MigrateUp(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Close() })
	return d
}

// testUser creates a user with a unique id and removes all of its rows when
// the test ends.
func testUser(t *testing.T, d *DB) int64 {
	t.Helper()
	tgID := time.Now().UnixNano()
	if err := d.conn.Exec(`INSERT INTO users (tg_id, session) VALUES (?, '{}')`, tgID).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		d.conn.Exec(`DELETE FROM transactions WHERE tg_id = ?`, tgID)
		d.conn.Exec(`DELETE FROM recurring_transactions WHERE tg_id = ?`, tgID)
		d.conn.Exec(`DELETE FROM users WHERE tg_id = ?`, tgID)
	})
	return tgID
}

func ymd(s string) time.Time {
	t, err := time.Parse(time.DateOnly, s)
	if err != nil {
		panic(err)
	}
	return t
}

func newRule(t *testing.T, d *DB, tgID int64, day int, next string) *model.RecurringTransaction {
	t.Helper()
	rule := &model.RecurringTransaction{
		TgID: tgID, Type: model.TypeExpense, Category: model.CategoryHouse, Amount: 900,
		Currency: model.CurrencyEUR, Description: "Rent", DayOfMonth: day, NextDueDate: ymd(next),
	}
	if err := d.CreateRecurring(rule, nil, ""); err != nil {
		t.Fatal(err)
	}
	return rule
}

// applyAll applies a rule until it is up to date, like the scheduler does.
func applyAll(t *testing.T, d *DB, id int64, today time.Time) int {
	t.Helper()
	n := 0
	for range 200 {
		res, err := d.ApplyRecurringOnce(id, today)
		if err != nil {
			t.Fatal(err)
		}
		if !res.Applied {
			return n
		}
		n++
	}
	t.Fatal("rule never caught up")
	return n
}

func ruleTransactions(t *testing.T, d *DB, ruleID int64) []model.Transaction {
	t.Helper()
	var txs []model.Transaction
	if err := d.conn.Where("recurring_id = ?", ruleID).Order("date ASC").Find(&txs).Error; err != nil {
		t.Fatal(err)
	}
	return txs
}

func nextDue(t *testing.T, d *DB, rule *model.RecurringTransaction) string {
	t.Helper()
	got, err := d.GetRecurring(rule.ID, rule.TgID)
	if err != nil {
		t.Fatal(err)
	}
	return got.NextDueDate.Format(time.DateOnly)
}

func TestApplyRecurringOnce_CatchUp(t *testing.T) {
	d := testDB(t)
	tgID := testUser(t, d)
	rule := newRule(t, d, tgID, 5, "2026-08-05")
	today := ymd("2026-10-08")

	if n := applyAll(t, d, rule.ID, today); n != 3 {
		t.Fatalf("applied %d months; want 3", n)
	}
	txs := ruleTransactions(t, d, rule.ID)
	want := []struct{ date, period string }{
		{"2026-08-05", "2026-08"}, {"2026-09-05", "2026-09"}, {"2026-10-05", "2026-10"},
	}
	if len(txs) != len(want) {
		t.Fatalf("got %d transactions; want %d", len(txs), len(want))
	}
	for i, w := range want {
		tx := txs[i]
		if tx.Date.Format(time.DateOnly) != w.date || tx.RecurringPeriod == nil || *tx.RecurringPeriod != w.period {
			t.Errorf("tx %d: date %s period %v; want %s %s", i, tx.Date.Format(time.DateOnly), tx.RecurringPeriod, w.date, w.period)
		}
		if tx.Amount != 900 || tx.Description != "Rent" || tx.Category != model.CategoryHouse || tx.Type != model.TypeExpense || tx.TgID != tgID {
			t.Errorf("tx %d: fields not copied: %+v", i, tx)
		}
	}
	if got := nextDue(t, d, rule); got != "2026-11-05" {
		t.Errorf("next due = %s; want 2026-11-05", got)
	}

	// Running again the same day does nothing.
	if n := applyAll(t, d, rule.ID, today); n != 0 {
		t.Errorf("second run applied %d months", n)
	}
}

func TestApplyRecurringOnce_NotDue(t *testing.T) {
	d := testDB(t)
	tgID := testUser(t, d)
	rule := newRule(t, d, tgID, 20, "2026-10-20")

	res, err := d.ApplyRecurringOnce(rule.ID, ymd("2026-10-08"))
	if err != nil || res.Applied {
		t.Fatalf("got %+v, %v; want nothing applied", res, err)
	}
	ids, err := d.DueRecurringIDs(ymd("2026-10-08"))
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range ids {
		if id == rule.ID {
			t.Error("rule listed as due before its date")
		}
	}
	ids, _ = d.DueRecurringIDs(ymd("2026-10-20"))
	found := false
	for _, id := range ids {
		found = found || id == rule.ID
	}
	if !found {
		t.Error("rule not listed as due on its date")
	}
}

func TestApplyRecurringOnce_DeletedTransactionNotRecreated(t *testing.T) {
	d := testDB(t)
	tgID := testUser(t, d)
	rule := newRule(t, d, tgID, 5, "2026-10-05")
	today := ymd("2026-10-08")

	applyAll(t, d, rule.ID, today)
	txs := ruleTransactions(t, d, rule.ID)
	if len(txs) != 1 {
		t.Fatalf("got %d transactions", len(txs))
	}
	if err := d.DeleteTransactionByID(txs[0].ID, tgID); err != nil {
		t.Fatal(err)
	}
	if n := applyAll(t, d, rule.ID, today); n != 0 {
		t.Errorf("deleted month was applied again")
	}
	if len(ruleTransactions(t, d, rule.ID)) != 0 {
		t.Error("deleted transaction came back")
	}
}

func TestApplyRecurringOnce_ConcurrentWorkers(t *testing.T) {
	d := testDB(t)
	tgID := testUser(t, d)
	rule := newRule(t, d, tgID, 5, "2025-10-05")
	today := ymd("2026-10-08")

	// Several workers race on the same rule. SKIP LOCKED lets one of them
	// take each month; the others see nothing to do or wait their turn.
	var wg sync.WaitGroup
	var mu sync.Mutex
	conflicts := 0
	errs := make(chan error, 8)
	for range 8 {
		wg.Go(func() {
			for range 50 {
				res, err := d.ApplyRecurringOnce(rule.ID, today)
				if err != nil {
					errs <- err
					return
				}
				if res.Conflict {
					mu.Lock()
					conflicts++
					mu.Unlock()
				}
				if !res.Applied {
					// Locked or done. Try a few more times in case it was locked.
					time.Sleep(time.Millisecond)
				}
			}
		})
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatal(err)
	}
	// The lock alone must prevent double work; the unique index is only a
	// safety net and should never fire.
	if conflicts != 0 {
		t.Errorf("%d unique index conflicts; the row lock did not serialize workers", conflicts)
	}
	// Whatever the workers left, a final pass finishes.
	applyAll(t, d, rule.ID, today)

	txs := ruleTransactions(t, d, rule.ID)
	if len(txs) != 13 {
		t.Fatalf("got %d transactions; want 13 (Oct 2025 to Oct 2026)", len(txs))
	}
	seen := map[string]bool{}
	for _, tx := range txs {
		if seen[*tx.RecurringPeriod] {
			t.Errorf("month %s created twice", *tx.RecurringPeriod)
		}
		seen[*tx.RecurringPeriod] = true
	}
	if got := nextDue(t, d, rule); got != "2026-11-05" {
		t.Errorf("next due = %s; want 2026-11-05", got)
	}
}

func TestApplyRecurringOnce_UniqueIndexConflict(t *testing.T) {
	d := testDB(t)
	tgID := testUser(t, d)
	rule := newRule(t, d, tgID, 5, "2026-10-05")

	// A row for October already exists for this rule (as if a bug wrote it).
	period := "2026-10"
	existing := model.Transaction{
		TgID: tgID, Date: ymd("2026-10-05"), Type: model.TypeExpense, Category: model.CategoryHouse,
		Amount: 900, Currency: model.CurrencyEUR, Description: "Rent", RecurringID: &rule.ID, RecurringPeriod: &period,
	}
	if err := d.CreateTransaction(&existing); err != nil {
		t.Fatal(err)
	}

	res, err := d.ApplyRecurringOnce(rule.ID, ymd("2026-10-08"))
	if err != nil {
		t.Fatal(err)
	}
	if !res.Applied || !res.Conflict || res.Transaction != nil {
		t.Errorf("got %+v; want applied with conflict", res)
	}
	if len(ruleTransactions(t, d, rule.ID)) != 1 {
		t.Error("a second row was inserted for the same month")
	}
	if got := nextDue(t, d, rule); got != "2026-11-05" {
		t.Errorf("rule did not move forward: %s", got)
	}
}

func TestDeleteRecurring_KeepsTransactions(t *testing.T) {
	d := testDB(t)
	tgID := testUser(t, d)
	rule := newRule(t, d, tgID, 5, "2026-09-05")
	applyAll(t, d, rule.ID, ymd("2026-10-08"))
	txs := ruleTransactions(t, d, rule.ID)
	if len(txs) != 2 {
		t.Fatalf("got %d transactions", len(txs))
	}

	if err := d.DeleteRecurring(rule.ID, tgID+1); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Errorf("other user could delete the rule: %v", err)
	}
	if err := d.DeleteRecurring(rule.ID, tgID); err != nil {
		t.Fatal(err)
	}
	for _, old := range txs {
		tx, err := d.GetTransactionByID(old.ID)
		if err != nil {
			t.Fatalf("transaction %d was deleted with the rule", old.ID)
		}
		if tx.RecurringID != nil {
			t.Errorf("transaction %d still linked to a deleted rule", old.ID)
		}
	}
	if err := d.DeleteRecurring(rule.ID, tgID); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Errorf("second delete: %v", err)
	}
}

func TestUpdateRecurring(t *testing.T) {
	d := testDB(t)
	tgID := testUser(t, d)
	rule := newRule(t, d, tgID, 20, "2026-10-20")

	if _, err := d.UpdateRecurring(rule.ID, tgID+1, func(*model.RecurringTransaction) error { return nil }); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Errorf("other user could edit the rule: %v", err)
	}

	updated, err := d.UpdateRecurring(rule.ID, tgID, func(r *model.RecurringTransaction) error {
		r.Amount = 950
		r.NextDueDate = recurring.WithDay(r.NextDueDate, 5)
		r.DayOfMonth = 5
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Amount != 950 || updated.DayOfMonth != 5 {
		t.Errorf("unexpected rule: %+v", updated)
	}
	if got := nextDue(t, d, rule); got != "2026-10-05" {
		t.Errorf("next due = %s; want 2026-10-05", got)
	}
	// October is now owed and gets applied on Oct 5.
	if n := applyAll(t, d, rule.ID, ymd("2026-10-08")); n != 1 {
		t.Errorf("applied %d; want 1", n)
	}
	txs := ruleTransactions(t, d, rule.ID)
	if len(txs) != 1 || txs[0].Amount != 950 || txs[0].Date.Format(time.DateOnly) != "2026-10-05" {
		t.Errorf("unexpected transactions: %+v", txs)
	}

	// An error from apply rolls back.
	_, err = d.UpdateRecurring(rule.ID, tgID, func(r *model.RecurringTransaction) error {
		r.Amount = 1
		return errors.New("stop")
	})
	if err == nil {
		t.Fatal("expected error")
	}
	got, _ := d.GetRecurring(rule.ID, tgID)
	if got.Amount != 950 {
		t.Errorf("failed update was saved: amount %v", got.Amount)
	}
}

func TestCreateRecurring_LinkSource(t *testing.T) {
	d := testDB(t)
	tgID := testUser(t, d)

	src := model.Transaction{
		TgID: tgID, Date: ymd("2026-10-05"), Type: model.TypeExpense, Category: model.CategoryHouse,
		Amount: 900, Currency: model.CurrencyEUR, Description: "Rent",
	}
	if err := d.CreateTransaction(&src); err != nil {
		t.Fatal(err)
	}

	rule := &model.RecurringTransaction{
		TgID: tgID, Type: model.TypeExpense, Category: model.CategoryHouse, Amount: 900,
		Currency: model.CurrencyEUR, Description: "Rent", DayOfMonth: 5, NextDueDate: ymd("2026-11-05"),
	}
	if err := d.CreateRecurring(rule, &src.ID, "2026-10"); err != nil {
		t.Fatal(err)
	}
	linked, _ := d.GetTransactionByID(src.ID)
	if linked.RecurringID == nil || *linked.RecurringID != rule.ID || *linked.RecurringPeriod != "2026-10" {
		t.Errorf("source not linked: %+v", linked)
	}

	// The same transaction cannot be linked to a second rule, and the second
	// rule is not saved.
	second := *rule
	second.ID = 0
	if err := d.CreateRecurring(&second, &src.ID, "2026-10"); !errors.Is(err, ErrSourceTransactionTaken) {
		t.Errorf("got %v; want ErrSourceTransactionTaken", err)
	}
	if n, _ := d.CountRecurring(tgID); n != 1 {
		t.Errorf("rule count = %d; want 1 (second create must roll back)", n)
	}

	// Another user's transaction cannot be linked.
	other := testUser(t, d)
	stolen := *rule
	stolen.ID = 0
	stolen.TgID = other
	if err := d.CreateRecurring(&stolen, &src.ID, "2026-10"); !errors.Is(err, ErrSourceTransactionTaken) {
		t.Errorf("got %v; want ErrSourceTransactionTaken", err)
	}
}

func TestCreateTransactionWithRecurring(t *testing.T) {
	d := testDB(t)
	tgID := testUser(t, d)

	newTx := func(date string) *model.Transaction {
		return &model.Transaction{
			TgID: tgID, Date: ymd(date), Type: model.TypeExpense, Category: model.CategoryBills,
			Amount: 13, Currency: model.CurrencyEUR, Description: "Phone",
		}
	}
	newRule := func(next string) *model.RecurringTransaction {
		return &model.RecurringTransaction{
			TgID: tgID, Type: model.TypeExpense, Category: model.CategoryBills, Amount: 13,
			Currency: model.CurrencyEUR, Description: "Phone", DayOfMonth: 14, NextDueDate: ymd(next),
		}
	}

	tx, rule := newTx("2026-10-14"), newRule("2026-11-14")
	if err := d.CreateTransactionWithRecurring(tx, rule, true); err != nil {
		t.Fatal(err)
	}
	if tx.RecurringID == nil || *tx.RecurringID != rule.ID || *tx.RecurringPeriod != "2026-10" {
		t.Errorf("not linked: %+v", tx)
	}

	tx2, rule2 := newTx("2026-09-14"), newRule("2026-10-14")
	if err := d.CreateTransactionWithRecurring(tx2, rule2, false); err != nil {
		t.Fatal(err)
	}
	saved, _ := d.GetTransactionByID(tx2.ID)
	if saved.RecurringID != nil {
		t.Errorf("past-month transaction should not be linked")
	}
	if n, _ := d.CountRecurring(tgID); n != 2 {
		t.Errorf("rule count = %d; want 2", n)
	}
}

func TestRecurringChecks(t *testing.T) {
	d := testDB(t)
	tgID := testUser(t, d)
	bad := &model.RecurringTransaction{
		TgID: tgID, Type: model.TypeExpense, Category: model.CategoryHouse, Amount: 900,
		Currency: model.CurrencyEUR, Description: "Rent", DayOfMonth: 29, NextDueDate: ymd("2026-10-29"),
	}
	if err := d.CreateRecurring(bad, nil, ""); err == nil {
		t.Error("day 29 accepted by the database")
	}
	bad.DayOfMonth, bad.Description = 5, ""
	if err := d.CreateRecurring(bad, nil, ""); err == nil {
		t.Error("empty description accepted by the database")
	}
}
