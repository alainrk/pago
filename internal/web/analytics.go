package web

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"time"

	"pago/internal/client"
	"pago/internal/db"
	"pago/internal/model"
)

// handleAPIAnalyticsMonthly returns category breakdown + totals for a month.
//
//	@Summary		Monthly category breakdown
//	@Description	Returns total income/expenses and per-category aggregates for a given month.
//	@Tags			analytics
//	@Produce		json
//	@Param			month	query		string	false	"Month in YYYY-MM (defaults to current month)"
//	@Success		200		{object}	MonthlyAnalyticsResponse
//	@Failure		401		{object}	ErrorResponse
//	@Failure		500		{object}	ErrorResponse
//	@Security		BearerAuth
//	@Router			/api/analytics/monthly [get]
func (s *Server) handleAPIAnalyticsMonthly(w http.ResponseWriter, r *http.Request) {
	user := client.GetUserFromContext(r.Context())
	if user == nil {
		s.sendJSONError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	monthStr := r.URL.Query().Get("month")
	current, err := time.Parse(monthLayout, monthStr)
	if err != nil {
		current = time.Now()
	}

	startDate := time.Date(current.Year(), current.Month(), 1, 0, 0, 0, 0, time.UTC)
	endDate := startDate.AddDate(0, 1, -1)

	expense, err := s.repositories.Transactions.GetCategoryAggregates(user.TgID, startDate, endDate, model.TypeExpense)
	if err != nil {
		s.logger.Errorf("analytics monthly expense: %v", err)
		s.sendJSONError(w, "Failed to load analytics", http.StatusInternalServerError)
		return
	}
	income, err := s.repositories.Transactions.GetCategoryAggregates(user.TgID, startDate, endDate, model.TypeIncome)
	if err != nil {
		s.logger.Errorf("analytics monthly income: %v", err)
		s.sendJSONError(w, "Failed to load analytics", http.StatusInternalServerError)
		return
	}

	expenseEntries, totalExpense := buildCategoryEntries(expense)
	incomeEntries, totalIncome := buildCategoryEntries(income)

	s.sendJSONSuccess(w, MonthlyAnalyticsResponse{
		Month:         current.Format(monthLayout),
		TotalIncome:   totalIncome,
		TotalExpenses: totalExpense,
		Balance:       totalIncome - totalExpense,
		ByCategory: CategoryBreakdown{
			Expense: expenseEntries,
			Income:  incomeEntries,
		},
	})
}

// handleAPIAnalyticsTrend returns trailing N-month income/expense/balance.
//
//	@Summary		Monthly trend over the trailing N months
//	@Tags			analytics
//	@Produce		json
//	@Param			months	query		int	false	"Number of trailing months (1..60, default 12)"
//	@Success		200		{object}	TrendResponse
//	@Failure		401		{object}	ErrorResponse
//	@Failure		500		{object}	ErrorResponse
//	@Security		BearerAuth
//	@Router			/api/analytics/trend [get]
func (s *Server) handleAPIAnalyticsTrend(w http.ResponseWriter, r *http.Request) {
	user := client.GetUserFromContext(r.Context())
	if user == nil {
		s.sendJSONError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	months := 12
	if v := r.URL.Query().Get("months"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 60 {
			months = n
		}
	}

	now := time.Now().UTC()
	endMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, 1, -1)
	startMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, -(months - 1), 0)

	rows, err := s.repositories.Transactions.GetMonthlyTotalsByRange(user.TgID, startMonth, endMonth)
	if err != nil {
		s.logger.Errorf("analytics trend: %v", err)
		s.sendJSONError(w, "Failed to load trend", http.StatusInternalServerError)
		return
	}

	points := buildMonthPoints(startMonth, months, rows)

	s.sendJSONSuccess(w, TrendResponse{
		From:   points[0].Month,
		To:     points[len(points)-1].Month,
		Points: points,
	})
}

// handleAPIAnalyticsYear returns per-month totals and category breakdown for a year.
//
//	@Summary		Annual breakdown by month and category
//	@Tags			analytics
//	@Produce		json
//	@Param			year	query		int	false	"4-digit year (defaults to current year)"
//	@Success		200		{object}	YearAnalyticsResponse
//	@Failure		401		{object}	ErrorResponse
//	@Failure		500		{object}	ErrorResponse
//	@Security		BearerAuth
//	@Router			/api/analytics/year [get]
func (s *Server) handleAPIAnalyticsYear(w http.ResponseWriter, r *http.Request) {
	user := client.GetUserFromContext(r.Context())
	if user == nil {
		s.sendJSONError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	year := time.Now().Year()
	if v := r.URL.Query().Get("year"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 1970 && n <= 9999 {
			year = n
		}
	}

	startDate := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	endDate := time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)

	rows, err := s.repositories.Transactions.GetMonthlyTotalsByRange(user.TgID, startDate, endDate)
	if err != nil {
		s.logger.Errorf("analytics year monthly: %v", err)
		s.sendJSONError(w, "Failed to load year analytics", http.StatusInternalServerError)
		return
	}
	points := buildMonthPoints(startDate, 12, rows)

	byMonth := make([]YearMonthEntry, 12)
	var totalIncome, totalExpense float64
	for i, p := range points {
		byMonth[i] = YearMonthEntry{
			Month:   i + 1,
			Income:  p.Income,
			Expense: p.Expense,
			Balance: p.Balance,
		}
		totalIncome += p.Income
		totalExpense += p.Expense
	}

	expense, err := s.repositories.Transactions.GetCategoryAggregates(user.TgID, startDate, endDate, model.TypeExpense)
	if err != nil {
		s.logger.Errorf("analytics year expense: %v", err)
		s.sendJSONError(w, "Failed to load year analytics", http.StatusInternalServerError)
		return
	}
	income, err := s.repositories.Transactions.GetCategoryAggregates(user.TgID, startDate, endDate, model.TypeIncome)
	if err != nil {
		s.logger.Errorf("analytics year income: %v", err)
		s.sendJSONError(w, "Failed to load year analytics", http.StatusInternalServerError)
		return
	}
	expenseEntries, _ := buildCategoryEntries(expense)
	incomeEntries, _ := buildCategoryEntries(income)

	s.sendJSONSuccess(w, YearAnalyticsResponse{
		Year:          year,
		TotalIncome:   totalIncome,
		TotalExpenses: totalExpense,
		Balance:       totalIncome - totalExpense,
		ByMonth:       byMonth,
		ByCategory: CategoryBreakdown{
			Expense: expenseEntries,
			Income:  incomeEntries,
		},
	})
}

// handleAPIAnalyticsYearCategories returns per-category totals split by month for a year.
//
//	@Summary		Annual per-category totals by month
//	@Description	Returns, for each category, the year total and a 12-entry array of monthly totals (January first). Categories are sorted by total descending.
//	@Tags			analytics
//	@Produce		json
//	@Param			year	query		int		false	"4-digit year (defaults to current year)"
//	@Param			type	query		string	false	"Transaction type: Expense (default) or Income"
//	@Success		200		{object}	YearCategoriesResponse
//	@Failure		401		{object}	ErrorResponse
//	@Failure		500		{object}	ErrorResponse
//	@Security		BearerAuth
//	@Router			/api/analytics/year-categories [get]
func (s *Server) handleAPIAnalyticsYearCategories(w http.ResponseWriter, r *http.Request) {
	user := client.GetUserFromContext(r.Context())
	if user == nil {
		s.sendJSONError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	year := time.Now().Year()
	if v := r.URL.Query().Get("year"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 1970 && n <= 9999 {
			year = n
		}
	}
	txType := model.TypeExpense
	if r.URL.Query().Get("type") == string(model.TypeIncome) {
		txType = model.TypeIncome
	}

	startDate := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	endDate := time.Date(year, 12, 31, 0, 0, 0, 0, time.UTC)

	rows, err := s.repositories.Transactions.GetCategoryMonthlyTotals(user.TgID, startDate, endDate, txType)
	if err != nil {
		s.logger.Errorf("analytics year categories: %v", err)
		s.sendJSONError(w, "Failed to load year analytics", http.StatusInternalServerError)
		return
	}

	s.sendJSONSuccess(w, YearCategoriesResponse{
		Year:       year,
		Type:       string(txType),
		Categories: buildCategoryYearEntries(year, rows),
	})
}

// buildCategoryYearEntries pivots (month, category) rows into one entry per
// category with a 12-slot monthly array. Rows outside the year are ignored.
func buildCategoryYearEntries(year int, rows []db.CategoryMonthTotal) []CategoryYearEntry {
	byCat := make(map[string]*CategoryYearEntry)
	order := make([]string, 0)
	for _, r := range rows {
		var y, m int
		if _, err := fmt.Sscanf(r.YM, "%d-%d", &y, &m); err != nil || y != year || m < 1 || m > 12 {
			continue
		}
		key := string(r.Category)
		e, ok := byCat[key]
		if !ok {
			e = &CategoryYearEntry{Category: key, ByMonth: make([]float64, 12)}
			byCat[key] = e
			order = append(order, key)
		}
		e.ByMonth[m-1] += r.Total
		e.Total += r.Total
		e.Count += r.Count
	}

	entries := make([]CategoryYearEntry, 0, len(order))
	for _, key := range order {
		entries = append(entries, *byCat[key])
	}
	sort.SliceStable(entries, func(i, j int) bool { return entries[i].Total > entries[j].Total })
	return entries
}

func buildCategoryEntries(rows []db.CategoryAggregate) ([]CategoryEntry, float64) {
	var total float64
	for _, r := range rows {
		total += r.Amount
	}
	entries := make([]CategoryEntry, len(rows))
	for i, r := range rows {
		pct := 0.0
		if total > 0 {
			pct = (r.Amount / total) * 100
		}
		entries[i] = CategoryEntry{
			Category: string(r.Category),
			Amount:   r.Amount,
			Count:    r.Count,
			Pct:      pct,
		}
	}
	return entries, total
}

func buildMonthPoints(start time.Time, months int, rows []db.MonthTotal) []MonthPoint {
	idx := make(map[string]int, months)
	points := make([]MonthPoint, months)
	for i := range months {
		ym := start.AddDate(0, i, 0).Format(monthLayout)
		points[i] = MonthPoint{Month: ym}
		idx[ym] = i
	}
	for _, r := range rows {
		i, ok := idx[r.YM]
		if !ok {
			continue
		}
		switch r.Type {
		case model.TypeIncome:
			points[i].Income = r.Total
		case model.TypeExpense:
			points[i].Expense = r.Total
		}
	}
	for i := range points {
		points[i].Balance = points[i].Income - points[i].Expense
	}
	return points
}
