# Recurring transactions

Date: 2026-10-08

## Problem

Rent, subscriptions and salary come back every month. Today the user
has to add them by hand each time, or clone last month's row.

## Scope

- Monthly only. A rule has a day of month from 1 to 28, so every month
  has that day.
- Expenses and income.
- Managed on the web only. The bot does not get new commands.
- No end date and no pause. A rule is either there or deleted.
- No Telegram message when a rule is applied. Budget alerts still fire
  as for any other expense.
- All dates are UTC. Users have no timezone field.

## Data model

New table `recurring_transactions`:

| column        | type                 | notes                              |
|---------------|----------------------|------------------------------------|
| id            | BIGSERIAL PK         |                                    |
| tg_id         | BIGINT NOT NULL      | FK users, indexed                  |
| type          | transaction_type     |                                    |
| category      | transaction_category |                                    |
| amount        | DECIMAL(15,2)        | CHECK (amount > 0)                 |
| currency      | currency_type        | default 'EUR', like web create     |
| description   | TEXT NOT NULL        | required, names the rule           |
| day_of_month  | SMALLINT NOT NULL    | CHECK (day_of_month BETWEEN 1 AND 28) |
| next_due_date | DATE NOT NULL        | the next date this rule owes       |
| created_at    | TIMESTAMPTZ          |                                    |
| updated_at    | TIMESTAMPTZ          |                                    |

Index on `next_due_date` for the scheduler query.

New columns on `transactions`:

- `recurring_id BIGINT NULL`, FK to `recurring_transactions(id)`
  `ON DELETE SET NULL`. Deleting a rule keeps its past transactions and
  drops their badge.
- `recurring_period CHAR(7) NULL`, the month a generated transaction
  pays for (`2026-10`). It does not change if the user later edits the
  transaction date.
- Partial unique index on `(recurring_id, recurring_period)` where
  `recurring_id IS NOT NULL`. This is a safety net: a bug can never
  create the same month twice for one rule.

One migration (`014`) creates the table and adds the columns, with a
rollback that drops them.

## How applying works

### The cursor

Each rule stores `next_due_date`. That is the only thing that says
what has been applied. Once a month is applied, the cursor moves on and
never comes back. So:

- If the user deletes a generated transaction, it is not created again.
- No need to look at existing transactions to guess what is missing.

### The job

`applyDueRecurring` runs in the bot process (`cmd/server`) scheduler:
once at startup, then every hour. Nothing depends on running at one
exact time, so a missed hour or a missed day is picked up by the next
run.

Steps:

1. Load the ids of rules where `next_due_date <= today (UTC)`.
2. For each rule, apply one occurrence in a single DB transaction:
   - `SELECT ... FOR UPDATE SKIP LOCKED` on the rule, with
     `next_due_date <= today` again. If no row comes back, another run
     or an edit has it, so move on.
   - Insert a transaction: the rule's type, category, amount, currency
     and description, `date = next_due_date`, `recurring_id`,
     `recurring_period = month of next_due_date`.
   - Set `next_due_date` to the same day next month.
   - Commit.
3. Repeat step 2 for the same rule until its `next_due_date` is in the
   future. Each month is its own DB transaction, so a crash keeps the
   months already done.
4. After each commit, for expenses dated in the current month, call the
   budget check (`EvaluateAfterExpenseInsert`) and send any alert, like
   the bot does today. A message is sent only when this transaction
   crossed 80% or 100% (the bot's "still over budget" line is not
   repeated as a standalone message). Catch-up rows for past months do
   not trigger alerts, so a long outage does not cause a burst of
   stale messages.
   An alert error is logged and never undoes the insert.
5. An error on one rule is logged with the rule id and the job moves
   on to the next rule. The next hourly run tries again.
6. Log one line per run: rules applied, transactions created, errors.

If the unique index rejects an insert (should never happen), the rule
still moves forward and the conflict is logged as an error.

### Catch-up example

Server down from Aug 3 to Oct 8. Rule for the 5th with
`next_due_date = 2026-08-05`. The first run after restart creates
Aug 5, Sep 5 and Oct 5, each dated on its real due date, and leaves
`next_due_date = 2026-11-05`.

### Concurrency

- Two job runs, or a second bot instance: `SKIP LOCKED` means each rule
  occurrence is taken by one of them only. The cursor check inside the
  lock stops double inserts.
- A web edit or delete at the same time: the web side locks the rule
  with a plain `FOR UPDATE`, so it waits for the job (or the job skips
  the rule this round). The two never interleave.

## Date rules

All in one small pure Go package so they are easy to test, mirrored in
`frontend/src/lib/recurring.ts` for the form preview.

- **First due date** for a new rule: the first date with that day of
  month strictly after today. Created Oct 8 for day 20: Oct 20.
  Created Oct 15 for day 10: Nov 10. Created Oct 10 for day 10: Nov 10
  (the user most likely logged today's payment by hand).
- **Next month**: same day, month + 1. Days are 1 to 28, so no
  clamping is needed.
- **Editing the day**: only the day changes, inside the month still
  owed: `next_due_date = (year, month of next_due_date, new day)`.
  Due Oct 20, today Oct 8, day set to 5: Oct 5, applied by the next
  run (within the hour, the form says so). A month is never skipped
  or doubled.
- **Editing other fields** (amount, category, description, type) only
  affects future transactions.
- **From a transaction** ("Repeat monthly" and "Make recurring"):
  - Day = day of the transaction date, or 28 if it is 29 to 31.
  - If the transaction is in the current month or later, it is linked
    as that month's payment (`recurring_id`, `recurring_period`) and
    `next_due_date` is the same day in the following month.
  - If it is in an earlier month, it is not linked and the rule uses
    the normal first due date.

## API

Same style as the transaction endpoints. All require auth and only
touch the user's own rows.

- `GET /api/recurring` lists rules, with monthly totals for expenses
  and income.
- `POST /api/recurring/create` with type, category, amount,
  description, dayOfMonth, and an optional `sourceTransactionId`
  (for "Make recurring"). Returns the rule with `nextDueDate`.
- `POST /api/recurring/edit` with id and the same fields. Returns the
  rule with the new `nextDueDate`.
- `POST /api/recurring/delete` with id.
- `POST /api/transactions/create` gets an optional `repeatMonthly`
  flag. The transaction and the rule are created in one DB transaction.
- Transaction DTOs get `recurringId` (nullable) for the badge.

Validation: same type and category checks as transactions, amount > 0,
description not empty, day 1 to 28, category matches the type. Limit
of 100 rules per user.

## UI

### Settings

A "Recurring" card under "Monthly budget": number of rules and monthly
totals ("1,240 EUR out / 2,800 EUR in"). Tapping it opens `/recurring`.
Empty text: "Add rent, subscriptions or salary once, and they're added
each month."

### `/recurring` page

- Header with back to Settings and an "Add recurring" button.
- Two groups, Expenses then Income, sorted by day.
- Row: category pill, description, amount, "Every 5th · next Nov 5".
- Desktop: click opens the edit sheet, right-click menu has Edit and
  Delete. Mobile: tap to edit, swipe to delete (`SwipeAction`).
- Empty state with the add button.
- `/recurring?edit=<id>` opens that rule's sheet (used by the badge).

### Create / edit sheet

One sheet for both, built from the add page parts: Expense/Income
switch, category select, amount, description, day of month (1 to 28).
A preview line under the day: "First one on Nov 10", or "Next one on
Nov 10" when editing. Delete sits at the bottom of the edit sheet, with
a confirm dialog: "Past transactions are kept."

### Ways to create

1. "Add recurring" on the page: empty sheet.
2. "Make recurring" next to Clone in the right-click menu, and as a
   button in the phone edit sheet (swipe keeps its single Clone
   action): the sheet, prefilled from the transaction. On a
   transaction already added by a rule, it reads "Edit recurring".
3. "Repeat monthly" toggle on the Add transaction page, under the
   date. Hint when on: "Repeats on the 5th each month" (or "on the
   28th" for days 29 to 31). Works the same after an LLM parse. The
   parser is not changed.

### Badge

Linked transactions show a small repeat icon in the transaction list,
tooltip "Recurring: Rent". Tapping it opens `/recurring?edit=<id>`.

### Toasts

"Recurring added. First one on Nov 10." and "Saved. Repeats on the 5th
each month."

## Testing

- **Date rules** (pure Go, table tests): first due date before, on and
  after the day; year rollover (Dec to Jan); day edits forward and
  back, in the current month and in a month still owed after an outage;
  rule from a transaction in past, current and future months; days 29
  to 31 mapped to 28. Same cases for the TypeScript mirror.
- **Apply loop**: the job takes a small interface for "load due ids"
  and "apply one occurrence", so it can be tested with a fake: catch-up
  over several months, stops at today, one failing rule does not block
  others, alerts only for current-month expenses.
- **Web handlers**: validation errors, ownership (cannot edit another
  user's rule), `repeatMonthly` creates and links in one go,
  `sourceTransactionId` linking rules.
- **Locking and the unique index**: there is no DB test setup in the
  repo today. These are checked by hand against a local Postgres: run
  two apply calls at once and check one row per month.
