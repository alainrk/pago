package web

import (
	"testing"

	"pago/internal/db"
)

func TestBuildCategoryYearEntries(t *testing.T) {
	rows := []db.CategoryMonthTotal{
		{YM: "2026-01", Category: "Grocery", Total: 100, Count: 4},
		{YM: "2026-03", Category: "Grocery", Total: 50, Count: 2},
		{YM: "2026-02", Category: "House", Total: 400, Count: 1},
		{YM: "2025-12", Category: "House", Total: 999, Count: 9}, // outside the year, ignored
		{YM: "bad", Category: "House", Total: 999, Count: 9},     // malformed, ignored
	}
	got := buildCategoryYearEntries(2026, rows)

	if len(got) != 2 {
		t.Fatalf("got %d entries, want 2", len(got))
	}
	// Sorted by total descending: House (400) before Grocery (150).
	if got[0].Category != "House" || got[1].Category != "Grocery" {
		t.Fatalf("order = %s, %s; want House, Grocery", got[0].Category, got[1].Category)
	}
	house, grocery := got[0], got[1]
	if house.Total != 400 || house.Count != 1 {
		t.Errorf("House total/count = %v/%d; want 400/1", house.Total, house.Count)
	}
	if len(house.ByMonth) != 12 || house.ByMonth[1] != 400 || house.ByMonth[11] != 0 {
		t.Errorf("House byMonth = %v", house.ByMonth)
	}
	if grocery.Total != 150 || grocery.Count != 6 {
		t.Errorf("Grocery total/count = %v/%d; want 150/6", grocery.Total, grocery.Count)
	}
	if grocery.ByMonth[0] != 100 || grocery.ByMonth[2] != 50 {
		t.Errorf("Grocery byMonth = %v", grocery.ByMonth)
	}
}

func TestBuildCategoryYearEntriesEmpty(t *testing.T) {
	got := buildCategoryYearEntries(2026, nil)
	if len(got) != 0 {
		t.Fatalf("got %d entries, want 0", len(got))
	}
}
