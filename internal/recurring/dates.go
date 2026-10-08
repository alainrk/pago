// Package recurring holds the date rules for monthly recurring transactions.
// Everything here is pure: callers pass "today" in, as a UTC date.
package recurring

import "time"

// MaxDay is the last day of month a rule can use. Every month has it, so a
// rule never needs clamping.
const MaxDay = 28

// ValidDay reports whether day can be used by a rule.
func ValidDay(day int) bool {
	return day >= 1 && day <= MaxDay
}

// Date returns the UTC midnight for a calendar day.
func Date(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

// Today returns the current UTC date at midnight.
func Today() time.Time {
	now := time.Now().UTC()
	return Date(now.Year(), now.Month(), now.Day())
}

// FirstDue is the first date with the given day of month strictly after today.
// A rule created on its own day starts next month, since that day's payment
// was most likely logged by hand.
func FirstDue(today time.Time, day int) time.Time {
	due := Date(today.Year(), today.Month(), day)
	if due.After(today) {
		return due
	}
	return Date(today.Year(), today.Month()+1, day)
}

// NextAfter returns the same day one month later.
func NextAfter(due time.Time) time.Time {
	return Date(due.Year(), due.Month()+1, due.Day())
}

// WithDay moves a due date to another day inside the same month, so that a
// day edit never skips or doubles the month still owed.
func WithDay(due time.Time, day int) time.Time {
	return Date(due.Year(), due.Month(), day)
}

// DayFromDate returns the rule day for a transaction date. Days 29 to 31
// become 28.
func DayFromDate(d time.Time) int {
	return min(d.Day(), MaxDay)
}

// Period returns the month a date belongs to, as "2006-01".
func Period(d time.Time) string {
	return d.Format("2006-01")
}

func monthIndex(d time.Time) int {
	return d.Year()*12 + int(d.Month())
}

// FromTransaction works out how a new rule built from a transaction starts.
// When the transaction is in the current month or later, it counts as that
// month's payment (link is true) and the rule starts the month after, on the
// given day. Otherwise the transaction is only a template and the rule starts
// on its first due date.
func FromTransaction(txDate, today time.Time, day int) (link bool, next time.Time) {
	if monthIndex(txDate) >= monthIndex(today) {
		return true, Date(txDate.Year(), txDate.Month()+1, day)
	}
	return false, FirstDue(today, day)
}
