package web

import (
	"encoding/json"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"cashout/internal/ai"
	"cashout/internal/client"
	"cashout/internal/model"
	"cashout/internal/repository"
)

const (
	// duplicateLookbackDays is how far back we look for a transaction that
	// looks like the one being added.
	duplicateLookbackDays = 60
	// duplicateMaxResults caps the number of candidates returned.
	duplicateMaxResults = 3
	// parseMaxTextLen bounds the free text sent to the LLM.
	parseMaxTextLen = 500
)

// ParseTransactionRequest is the body of POST /api/transactions/parse.
type ParseTransactionRequest struct {
	Text string `json:"text" example:"irish pub with laura 12.50 yesterday"`
}

// ParseTransactionResponse is the body of POST /api/transactions/parse.
// The fields are a suggestion the client shows for review; nothing is saved.
type ParseTransactionResponse struct {
	Type        string           `json:"type"        example:"Expense"`
	Category    string           `json:"category"    example:"EatingOut"`
	Amount      float64          `json:"amount"      example:"12.50"`
	Description string           `json:"description" example:"Irish pub with Laura"`
	Date        string           `json:"date"        example:"2026-09-03"`
	Duplicates  []TransactionDTO `json:"duplicates"`
}

// DuplicateCheckRequest is the body of POST /api/transactions/duplicates.
type DuplicateCheckRequest struct {
	Description string  `json:"description" example:"Irish pub with Laura"`
	Amount      float64 `json:"amount"      example:"12.50"`
	Date        string  `json:"date"        example:"2026-09-03"`
}

// DuplicateCheckResponse is the body of POST /api/transactions/parse and
// POST /api/transactions/duplicates.
type DuplicateCheckResponse struct {
	Duplicates []TransactionDTO `json:"duplicates"`
}

// handleAPIParseTransaction turns free text into a transaction suggestion.
//
//	@Summary		Parse free text into a transaction (AI)
//	@Description	Uses the configured LLM to extract type, amount, category, description and date from a short sentence. Nothing is saved. Also returns recent transactions that look like duplicates.
//	@Tags			transactions
//	@Accept			json
//	@Produce		json
//	@Param			body	body		ParseTransactionRequest	true	"Free text"
//	@Success		200		{object}	ParseTransactionResponse
//	@Failure		400		{object}	ErrorResponse
//	@Failure		401		{object}	ErrorResponse
//	@Failure		429		{object}	ErrorResponse
//	@Failure		503		{object}	ErrorResponse
//	@Security		BearerAuth
//	@Router			/api/transactions/parse [post]
func (s *Server) handleAPIParseTransaction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	user := client.GetUserFromContext(r.Context())
	if user == nil {
		s.sendJSONError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if s.llm.APIKey == "" || s.llm.Model == "" {
		s.sendJSONError(w, "AI parsing is not configured on this server", http.StatusServiceUnavailable)
		return
	}

	var req ParseTransactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendJSONError(w, "Invalid request", http.StatusBadRequest)
		return
	}
	text := strings.TrimSpace(req.Text)
	if text == "" {
		s.sendJSONError(w, "Text is required", http.StatusBadRequest)
		return
	}
	if len(text) > parseMaxTextLen {
		s.sendJSONError(w, "Text is too long", http.StatusBadRequest)
		return
	}

	// LLM calls are slow and cost money: cap them per user.
	if !s.getLimiterWithRate("parse:"+strconv.FormatInt(user.TgID, 10), 3*time.Second, 10).Allow() {
		s.sendJSONError(w, "Too many requests", http.StatusTooManyRequests)
		return
	}

	txType := model.TypeExpense
	if intent, err := s.llm.ClassifyIntent(text); err == nil && intent.Intent == ai.IntentAddIncome {
		txType = model.TypeIncome
	}

	extracted, err := s.llm.ExtractTransaction(text, txType)
	if err != nil {
		s.logger.Errorf("Failed to parse transaction text: %v", err)
		s.sendJSONError(w, "Could not understand that. Try again or fill the fields by hand.", http.StatusBadGateway)
		return
	}

	category := normalizeCategory(extracted.Category, txType)
	amount := math.Round(extracted.Amount*100) / 100
	date := extracted.Date
	if date.IsZero() || date.After(time.Now().AddDate(0, 0, 1)) {
		date = time.Now()
	}

	resp := ParseTransactionResponse{
		Type:        string(txType),
		Category:    category,
		Amount:      amount,
		Description: strings.TrimSpace(extracted.Description),
		Date:        date.Format("2006-01-02"),
		Duplicates:  []TransactionDTO{},
	}
	if amount > 0 {
		dups, err := s.findDuplicates(user.TgID, resp.Description, amount, date)
		if err != nil {
			s.logger.Warnf("Duplicate lookup failed: %v", err)
		} else {
			resp.Duplicates = dups
		}
	}
	s.sendJSONSuccess(w, resp)
}

// handleAPIDuplicateCheck looks for recent transactions that match the given
// description and amount, so the client can warn before saving.
//
//	@Summary		Find possible duplicates
//	@Description	Returns recent transactions (last 60 days before the given date) with the same amount and a matching description.
//	@Tags			transactions
//	@Accept			json
//	@Produce		json
//	@Param			body	body		DuplicateCheckRequest	true	"Candidate transaction"
//	@Success		200		{object}	DuplicateCheckResponse
//	@Failure		400		{object}	ErrorResponse
//	@Failure		401		{object}	ErrorResponse
//	@Failure		500		{object}	ErrorResponse
//	@Security		BearerAuth
//	@Router			/api/transactions/duplicates [post]
func (s *Server) handleAPIDuplicateCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	user := client.GetUserFromContext(r.Context())
	if user == nil {
		s.sendJSONError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	var req DuplicateCheckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendJSONError(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if req.Amount <= 0 {
		s.sendJSONError(w, "Amount must be greater than 0", http.StatusBadRequest)
		return
	}
	date := time.Now()
	if req.Date != "" {
		d, err := time.Parse("2006-01-02", req.Date)
		if err != nil {
			s.sendJSONError(w, "Invalid date format", http.StatusBadRequest)
			return
		}
		date = d
	}
	dups, err := s.findDuplicates(user.TgID, req.Description, req.Amount, date)
	if err != nil {
		s.logger.Errorf("Duplicate lookup failed: %v", err)
		s.sendJSONError(w, "Failed to check duplicates", http.StatusInternalServerError)
		return
	}
	s.sendJSONSuccess(w, DuplicateCheckResponse{Duplicates: dups})
}

// findDuplicates queries recent transactions with the same amount and keeps the
// ones whose description matches.
func (s *Server) findDuplicates(tgID int64, description string, amount float64, date time.Time) ([]TransactionDTO, error) {
	to := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, 1)
	from := to.AddDate(0, 0, -duplicateLookbackDays-1)
	lo := amount - 0.005
	hi := amount + 0.005
	filter := repository.TransactionFilter{
		DateFrom:  &from,
		DateTo:    &to,
		AmountMin: &lo,
		AmountMax: &hi,
	}
	txs, _, err := s.repositories.Transactions.SearchUserTransactionsFiltered(tgID, filter, 0, 50)
	if err != nil {
		return nil, err
	}
	out := make([]TransactionDTO, 0, duplicateMaxResults)
	for _, tx := range txs {
		if descriptionsMatch(description, tx.Description) {
			out = append(out, toTransactionDTO(tx))
			if len(out) == duplicateMaxResults {
				break
			}
		}
	}
	return out, nil
}

// descriptionsMatch is a loose comparison: same text ignoring case and spacing,
// or one contains the other. Empty descriptions only match empty ones.
func descriptionsMatch(a, b string) bool {
	na := normalizeText(a)
	nb := normalizeText(b)
	if na == "" || nb == "" {
		return na == nb
	}
	return na == nb || strings.Contains(na, nb) || strings.Contains(nb, na)
}

func normalizeText(s string) string {
	return strings.Join(strings.Fields(strings.ToLower(s)), " ")
}

// normalizeCategory maps whatever the LLM returned onto a valid category for
// the given type, falling back to the "other" bucket.
func normalizeCategory(raw string, txType model.TransactionType) string {
	raw = strings.TrimSpace(raw)
	if model.IsValidTransactionCategory(raw) && isIncomeCategory(raw) == (txType == model.TypeIncome) {
		return raw
	}
	for _, c := range model.GetTransactionCategories() {
		if strings.EqualFold(c, raw) && isIncomeCategory(c) == (txType == model.TypeIncome) {
			return c
		}
	}
	if txType == model.TypeIncome {
		return string(model.CategoryOtherIncomes)
	}
	return string(model.CategoryOtherExpenses)
}
