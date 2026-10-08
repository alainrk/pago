package web

import (
	"encoding/json"
	"math"
	"testing"
	"time"

	"pago/internal/model"
)

func ymd(s string) time.Time {
	t, err := time.Parse(dateLayout, s)
	if err != nil {
		panic(err)
	}
	return t
}

func TestValidateRecurringInput(t *testing.T) {
	ok := recurringInput{Type: "Expense", Category: "House", Amount: 900, Description: "  Rent ", DayOfMonth: 5}

	desc, msg := validateRecurringInput(ok)
	if msg != "" || desc != "Rent" {
		t.Fatalf("valid input: got (%q, %q)", desc, msg)
	}

	cases := []struct {
		name string
		edit func(*recurringInput)
		want string
	}{
		{"bad type", func(in *recurringInput) { in.Type = "Transfer" }, "Invalid transaction type"},
		{"bad category", func(in *recurringInput) { in.Category = "Nope" }, "Invalid category"},
		{"income category on expense", func(in *recurringInput) { in.Category = "Salary" }, "Category does not match the type"},
		{"expense category on income", func(in *recurringInput) { in.Type = "Income" }, "Category does not match the type"},
		{"zero amount", func(in *recurringInput) { in.Amount = 0 }, "Amount must be greater than 0"},
		{"negative amount", func(in *recurringInput) { in.Amount = -3 }, "Amount must be greater than 0"},
		{"infinite amount", func(in *recurringInput) { in.Amount = math.Inf(1) }, "Amount must be greater than 0"},
		{"blank description", func(in *recurringInput) { in.Description = "   " }, "Description cannot be empty"},
		{"day 0", func(in *recurringInput) { in.DayOfMonth = 0 }, "Day of month must be between 1 and 28"},
		{"day 29", func(in *recurringInput) { in.DayOfMonth = 29 }, "Day of month must be between 1 and 28"},
		{"day 31", func(in *recurringInput) { in.DayOfMonth = 31 }, "Day of month must be between 1 and 28"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			in := ok
			c.edit(&in)
			if _, msg := validateRecurringInput(in); msg != c.want {
				t.Errorf("got %q; want %q", msg, c.want)
			}
		})
	}

	income := recurringInput{Type: "Income", Category: "Salary", Amount: 2800, Description: "Salary", DayOfMonth: 27}
	if _, msg := validateRecurringInput(income); msg != "" {
		t.Errorf("valid income rejected: %q", msg)
	}
}

func TestToRecurringDTO(t *testing.T) {
	rule := model.RecurringTransaction{
		ID: 3, Type: model.TypeExpense, Category: model.CategoryHouse, Amount: 900,
		Currency: model.CurrencyEUR, Description: "Rent", DayOfMonth: 5, NextDueDate: ymd("2026-11-05"),
	}
	dto := toRecurringDTO(rule)
	if dto.ID != 3 || dto.Type != "Expense" || dto.Category != "House" || dto.Amount != 900 ||
		dto.Currency != "EUR" || dto.Description != "Rent" || dto.DayOfMonth != 5 || dto.NextDueDate != "2026-11-05" {
		t.Fatalf("unexpected DTO: %+v", dto)
	}
}

func TestBuildRecurringList(t *testing.T) {
	rules := []model.RecurringTransaction{
		{ID: 1, Type: model.TypeExpense, Amount: 900.10, NextDueDate: ymd("2026-11-05")},
		{ID: 2, Type: model.TypeExpense, Amount: 12.99, NextDueDate: ymd("2026-10-14")},
		{ID: 3, Type: model.TypeIncome, Amount: 2800, NextDueDate: ymd("2026-10-27")},
	}
	resp := buildRecurringList(rules)
	if resp.Count != 3 || len(resp.Recurring) != 3 {
		t.Fatalf("count = %d", resp.Count)
	}
	if resp.TotalExpense != 913.09 || resp.TotalIncome != 2800 {
		t.Errorf("totals = %v / %v", resp.TotalExpense, resp.TotalIncome)
	}

	empty := buildRecurringList(nil)
	// An empty list must encode as [], not null, for the frontend.
	b, _ := json.Marshal(empty)
	if string(b) != `{"recurring":[],"count":0,"totalExpense":0,"totalIncome":0}` {
		t.Errorf("empty list JSON = %s", b)
	}
}

func TestApplyRecurringEdit(t *testing.T) {
	base := func() model.RecurringTransaction {
		return model.RecurringTransaction{
			Type: model.TypeExpense, Category: model.CategoryHouse, Amount: 900,
			Description: "Rent", DayOfMonth: 20, NextDueDate: ymd("2026-10-20"),
		}
	}

	t.Run("day change moves inside owed month", func(t *testing.T) {
		rule := base()
		applyRecurringEdit(&rule, EditRecurringRequest{Type: "Expense", Category: "House", Amount: 900, DayOfMonth: 5}, "Rent")
		if rule.DayOfMonth != 5 || !rule.NextDueDate.Equal(ymd("2026-10-05")) {
			t.Errorf("got day %d next %s", rule.DayOfMonth, rule.NextDueDate.Format(dateLayout))
		}
	})

	t.Run("other fields keep next date", func(t *testing.T) {
		rule := base()
		applyRecurringEdit(&rule, EditRecurringRequest{Type: "Expense", Category: "Bills", Amount: 950, DayOfMonth: 20}, "Flat")
		if !rule.NextDueDate.Equal(ymd("2026-10-20")) || rule.Amount != 950 || rule.Category != model.CategoryBills || rule.Description != "Flat" {
			t.Errorf("unexpected rule: %+v", rule)
		}
	})

	t.Run("type change", func(t *testing.T) {
		rule := base()
		applyRecurringEdit(&rule, EditRecurringRequest{Type: "Income", Category: "OtherIncomes", Amount: 50, DayOfMonth: 20}, "Sublet")
		if rule.Type != model.TypeIncome || rule.Category != model.CategoryOtherIncomes {
			t.Errorf("unexpected rule: %+v", rule)
		}
	})
}

func TestRecurringFromNewTransaction(t *testing.T) {
	today := ymd("2026-10-08")
	tx := func(date string) model.Transaction {
		return model.Transaction{
			TgID: 9, Type: model.TypeExpense, Category: model.CategoryHouse, Amount: 900,
			Currency: model.CurrencyEUR, Description: " Rent ", Date: ymd(date),
		}
	}

	cases := []struct {
		date     string
		wantDay  int
		wantLink bool
		wantNext string
	}{
		{"2026-10-05", 5, true, "2026-11-05"},
		{"2026-10-31", 28, true, "2026-11-28"},
		{"2026-11-02", 2, true, "2026-12-02"},
		{"2026-09-20", 20, false, "2026-10-20"},
		{"2026-09-05", 5, false, "2026-11-05"},
	}
	for _, c := range cases {
		rule, link := recurringFromNewTransaction(tx(c.date), today)
		if rule.DayOfMonth != c.wantDay || link != c.wantLink || rule.NextDueDate.Format(dateLayout) != c.wantNext {
			t.Errorf("%s: got day %d link %v next %s; want %d %v %s", c.date, rule.DayOfMonth, link,
				rule.NextDueDate.Format(dateLayout), c.wantDay, c.wantLink, c.wantNext)
		}
		if rule.TgID != 9 || rule.Description != "Rent" || rule.Amount != 900 || rule.Category != model.CategoryHouse {
			t.Errorf("%s: fields not copied: %+v", c.date, rule)
		}
	}
}

func TestToTransactionDTORecurringID(t *testing.T) {
	id := int64(4)
	dto := toTransactionDTO(model.Transaction{ID: 1, RecurringID: &id})
	if dto.RecurringID == nil || *dto.RecurringID != 4 {
		t.Errorf("recurringId = %v", dto.RecurringID)
	}
	b, _ := json.Marshal(toTransactionDTO(model.Transaction{ID: 2}))
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	if v, ok := m["recurringId"]; !ok || v != nil {
		t.Errorf("plain transaction should have recurringId: null, got %s", b)
	}
}
