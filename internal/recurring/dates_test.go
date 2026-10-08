package recurring

import (
	"testing"
	"time"
)

func d(s string) time.Time {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestValidDay(t *testing.T) {
	cases := map[int]bool{-1: false, 0: false, 1: true, 15: true, 28: true, 29: false, 31: false}
	for day, want := range cases {
		if got := ValidDay(day); got != want {
			t.Errorf("ValidDay(%d) = %v; want %v", day, got, want)
		}
	}
}

func TestFirstDue(t *testing.T) {
	cases := []struct {
		today string
		day   int
		want  string
	}{
		{"2026-10-08", 20, "2026-10-20"}, // day still ahead this month
		{"2026-10-15", 10, "2026-11-10"}, // day already passed
		{"2026-10-10", 10, "2026-11-10"}, // created on its own day
		{"2026-10-09", 10, "2026-10-10"}, // day is tomorrow
		{"2026-12-20", 5, "2027-01-05"},  // year rollover
		{"2026-12-31", 28, "2027-01-28"}, // last day of year
		{"2026-02-28", 28, "2026-03-28"}, // short month, on the day
		{"2026-02-01", 28, "2026-02-28"}, // short month, ahead
		{"2026-01-31", 1, "2026-02-01"},  // end of month to start of next
	}
	for _, c := range cases {
		got := FirstDue(d(c.today), c.day)
		if !got.Equal(d(c.want)) {
			t.Errorf("FirstDue(%s, %d) = %s; want %s", c.today, c.day, got.Format(time.DateOnly), c.want)
		}
	}
}

func TestNextAfter(t *testing.T) {
	cases := []struct{ due, want string }{
		{"2026-10-05", "2026-11-05"},
		{"2026-12-28", "2027-01-28"},
		{"2026-01-28", "2026-02-28"},
		{"2027-11-01", "2027-12-01"},
	}
	for _, c := range cases {
		got := NextAfter(d(c.due))
		if !got.Equal(d(c.want)) {
			t.Errorf("NextAfter(%s) = %s; want %s", c.due, got.Format(time.DateOnly), c.want)
		}
	}
}

func TestWithDay(t *testing.T) {
	cases := []struct {
		name string
		due  string
		day  int
		want string
	}{
		// Due Oct 20, today Oct 8, moved to the 5th: October is still owed,
		// so it becomes Oct 5 and the next run applies it.
		{"earlier day in owed month", "2026-10-20", 5, "2026-10-05"},
		{"later day in owed month", "2026-10-05", 20, "2026-10-20"},
		// Already applied this month, next due is November: stays in November.
		{"next month stays next month", "2026-11-10", 2, "2026-11-02"},
		// After an outage the owed month can be in the past. Only the day moves.
		{"owed month in the past", "2026-08-05", 20, "2026-08-20"},
		{"same day", "2026-10-05", 5, "2026-10-05"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := WithDay(d(c.due), c.day)
			if !got.Equal(d(c.want)) {
				t.Errorf("WithDay(%s, %d) = %s; want %s", c.due, c.day, got.Format(time.DateOnly), c.want)
			}
		})
	}
}

func TestDayFromDate(t *testing.T) {
	cases := map[string]int{
		"2026-10-01": 1,
		"2026-10-28": 28,
		"2026-10-29": 28,
		"2026-10-30": 28,
		"2026-10-31": 28,
		"2026-02-28": 28,
	}
	for date, want := range cases {
		if got := DayFromDate(d(date)); got != want {
			t.Errorf("DayFromDate(%s) = %d; want %d", date, got, want)
		}
	}
}

func TestPeriod(t *testing.T) {
	if got := Period(d("2026-03-09")); got != "2026-03" {
		t.Errorf("Period = %q; want 2026-03", got)
	}
}

func TestFromTransaction(t *testing.T) {
	cases := []struct {
		name     string
		txDate   string
		today    string
		wantDay  int
		wantLink bool
		wantNext string
	}{
		{"current month, before today", "2026-10-05", "2026-10-08", 5, true, "2026-11-05"},
		{"current month, after today", "2026-10-20", "2026-10-08", 20, true, "2026-11-20"},
		{"current month, today", "2026-10-08", "2026-10-08", 8, true, "2026-11-08"},
		{"current month, day 31", "2026-10-31", "2026-10-08", 28, true, "2026-11-28"},
		{"future month", "2026-11-03", "2026-10-08", 3, true, "2026-12-03"},
		{"december rolls over", "2026-12-15", "2026-12-01", 15, true, "2027-01-15"},
		// Past months are only a template. The rule starts on its first due date.
		{"last month, day ahead", "2026-09-20", "2026-10-08", 20, false, "2026-10-20"},
		{"last month, day passed", "2026-09-05", "2026-10-08", 5, false, "2026-11-05"},
		{"last month, day 30", "2026-09-30", "2026-10-08", 28, false, "2026-10-28"},
		{"last year same month", "2025-10-05", "2026-10-08", 5, false, "2026-11-05"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			day := DayFromDate(d(c.txDate))
			link, next := FromTransaction(d(c.txDate), d(c.today), day)
			if day != c.wantDay || link != c.wantLink || !next.Equal(d(c.wantNext)) {
				t.Errorf("FromTransaction(%s, %s) = (%d, %v, %s); want (%d, %v, %s)",
					c.txDate, c.today, day, link, next.Format(time.DateOnly), c.wantDay, c.wantLink, c.wantNext)
			}
		})
	}
}

func TestFromTransactionUserDay(t *testing.T) {
	// The form may change the day before saving. The month rule stays the same.
	link, next := FromTransaction(d("2026-10-05"), d("2026-10-08"), 12)
	if !link || !next.Equal(d("2026-11-12")) {
		t.Errorf("linked: got (%v, %s); want (true, 2026-11-12)", link, next.Format(time.DateOnly))
	}
	link, next = FromTransaction(d("2026-09-05"), d("2026-10-08"), 12)
	if link || !next.Equal(d("2026-10-12")) {
		t.Errorf("template: got (%v, %s); want (false, 2026-10-12)", link, next.Format(time.DateOnly))
	}
}

func TestCatchUpSequence(t *testing.T) {
	// Walking NextAfter from a due date in the past lists every missed month.
	today := d("2026-10-08")
	due := d("2026-08-05")
	var got []string
	for !due.After(today) {
		got = append(got, due.Format(time.DateOnly))
		due = NextAfter(due)
	}
	want := []string{"2026-08-05", "2026-09-05", "2026-10-05"}
	if len(got) != len(want) {
		t.Fatalf("got %v; want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v; want %v", got, want)
		}
	}
	if !due.Equal(d("2026-11-05")) {
		t.Errorf("next due after catch-up = %s; want 2026-11-05", due.Format(time.DateOnly))
	}
}
