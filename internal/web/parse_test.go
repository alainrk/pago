package web

import (
	"testing"

	"pago/internal/model"
)

func TestDescriptionsMatch(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"Irish pub with Laura", "irish pub with laura", true},
		{"Irish  pub", "irish pub", true},
		{"Irish pub", "Irish pub with Laura", true},
		{"Groceries", "Rent", false},
		{"", "", true},
		{"", "Rent", false},
	}
	for _, c := range cases {
		if got := descriptionsMatch(c.a, c.b); got != c.want {
			t.Errorf("descriptionsMatch(%q,%q) = %v; want %v", c.a, c.b, got, c.want)
		}
	}
}

func TestNormalizeCategory(t *testing.T) {
	cases := []struct {
		raw  string
		typ  model.TransactionType
		want string
	}{
		{"Grocery", model.TypeExpense, "Grocery"},
		{"grocery", model.TypeExpense, "Grocery"},
		{"eatingout", model.TypeExpense, "EatingOut"},
		{"Food", model.TypeExpense, "OtherExpenses"},
		{"Salary", model.TypeIncome, "Salary"},
		{"Grocery", model.TypeIncome, "OtherIncomes"},
		{"", model.TypeIncome, "OtherIncomes"},
	}
	for _, c := range cases {
		if got := normalizeCategory(c.raw, c.typ); got != c.want {
			t.Errorf("normalizeCategory(%q,%s) = %q; want %q", c.raw, c.typ, got, c.want)
		}
	}
}
