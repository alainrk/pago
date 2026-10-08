# Recurring transactions: implementation plan

Date: 2026-10-08
Design: `2026-10-08-recurring-transactions-design.md`

Each step ends with `make lint` and `go test ./...` (or `npm test` and
`npm run typecheck` in `frontend/`) passing.

## 1. Date rules (pure Go)

`internal/recurring/dates.go`, no DB, no clock reads (today is passed
in, always a UTC date).

- `FirstDue(today time.Time, day int) time.Time`
- `NextAfter(due time.Time) time.Time` (same day, next month)
- `WithDay(due time.Time, day int) time.Time` (day edit)
- `DayFromDate(d time.Time) int` (29-31 become 28)
- `Period(d time.Time) string` (`2026-10`)
- `FromTransaction(txDate, today time.Time) (day int, link bool, next time.Time)`
- `ValidDay(day int) bool`

`dates_test.go`: table tests for every case in the design's Testing
section.

## 2. Migration 014

`internal/migrations/versions/014_create_recurring_transactions.go`:
table, `next_due_date` index, `tg_id` index and FK, the two columns on
`transactions`, FK `ON DELETE SET NULL`, partial unique index. Rollback
drops them in reverse order.

## 3. Model

- `internal/model/recurring.go`: `RecurringTransaction` struct.
- `Transaction` gets `RecurringID *int64` and `RecurringPeriod *string`.

## 4. DB layer

`internal/db/recurring.go`:

- `ListRecurring(tgID)`, `CountRecurring(tgID)`, `GetRecurring(id, tgID)`
- `CreateRecurring(rule, linkTxID *int64)`: in one transaction, insert
  the rule and, if given, set `recurring_id` and `recurring_period` on
  the source transaction (checked to belong to the user).
- `CreateTransactionWithRecurring(tx, rule)`: for `repeatMonthly`.
  Insert the rule, then the transaction already linked.
- `UpdateRecurring(id, tgID, fn)`: `SELECT ... FOR UPDATE`, apply
  changes, save.
- `DeleteRecurring(id, tgID)`: lock, delete (FK clears links).
- `DueRecurringIDs(today)`
- `ApplyRecurringOnce(id, today) (*model.Transaction, bool, error)`:
  the locked one-occurrence step from the design. Returns the created
  transaction, or `false` when nothing was due or the row was locked.

`internal/repository/recurring.go` wraps these, like `Budgets`.

## 5. Scheduler job

`internal/scheduler/recurring.go`:

- `applier` interface: `DueRecurringIDs`, `ApplyRecurringOnce`.
- `applyDueRecurring(today)` loops as in the design, logs a summary,
  never stops on one rule's error. A cap of 120 occurrences per rule
  per run guards against a runaway loop.
- After each created current-month expense, the budget check runs
  through a small `alerter` func. It sends a standalone Telegram
  message only when there is a new 80% or 100% alert.
- Registered in `Start()`: every hour, starting right away.

`recurring_test.go`: fake applier and alerter.

## 6. Web API

- `internal/web/recurring.go`: list, create, edit, delete handlers,
  with swag annotations.
- `validateRecurringInput` as a pure function, with tests.
- `toRecurringDTO`, totals helper, with tests.
- `CreateTransactionRequest.RepeatMonthly`; the create handler uses
  `CreateTransactionWithRecurring` when set.
- `TransactionDTO.RecurringID`, filled in `toTransactionDTO` and the
  list in `dashboard.go`.
- Routes in `web.go`, `Recurring` in `web.Repositories` and in
  `cmd/web` wiring. `client.Repositories` gets it for the scheduler.
- `make openapi` to refresh `api/swagger.*`.

## 7. DB integration test

`internal/db/recurring_test.go`, skipped unless `TEST_DATABASE_URL` is
set. It runs migrations on a scratch database, then checks catch-up,
"deleted transaction not re-created", day edit, delete keeps history,
the unique index, and two `ApplyRecurringOnce` loops running at the
same time producing one row per month.

## 8. Frontend

- `api/types.ts`, `api/endpoints.ts`: recurring types and calls,
  `recurringId` on `TransactionDTO`, `repeatMonthly` on create.
- `lib/recurring.ts` (+ test): the same date rules, plus labels like
  "Every 5th · next Nov 5".
- `pages/RecurringPage.tsx` (+ css): grouped list, empty state,
  context menu and swipe delete, `?edit=<id>`, prefill from router
  state for "Make recurring".
- `pages/RecurringSheet.tsx`: create and edit form. Bottom sheet on
  phones, centered panel on desktop.
- Settings: "Recurring" card.
- Transactions: badge on linked rows, "Make recurring" in the
  right-click menu and in the phone edit sheet (swipe has one action
  only, Clone).
- Add page: "Repeat monthly" toggle and hint.
- Route `/recurring` in `App.tsx`.
- Icon for repeat in `components/icons.ts` if missing.

## 9. Check end to end

Run Postgres in Docker, migrate, run the web server and the frontend,
and walk through the three ways to create a rule, editing, deleting,
the badge, and a forced catch-up (set `next_due_date` in the past and
call the job).
