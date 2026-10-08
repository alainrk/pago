package web

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"strings"
	"time"

	"pago/internal/client"
	"pago/internal/db"
	"pago/internal/model"
	"pago/internal/recurring"

	"gorm.io/gorm"
)

// maxRecurringPerUser is a guard against misuse, far above real needs.
const maxRecurringPerUser = 100

// recurringInput is the part of create and edit requests that describes a rule.
type recurringInput struct {
	Type        string
	Category    string
	Amount      float64
	Description string
	DayOfMonth  int
}

// validateRecurringInput checks a rule and returns the trimmed description,
// or a user-facing error message.
func validateRecurringInput(in recurringInput) (string, string) {
	if in.Type != string(model.TypeIncome) && in.Type != string(model.TypeExpense) {
		return "", "Invalid transaction type"
	}
	if !model.IsValidTransactionCategory(in.Category) {
		return "", "Invalid category"
	}
	if (in.Type == string(model.TypeIncome)) != isIncomeCategory(in.Category) {
		return "", "Category does not match the type"
	}
	if in.Amount <= 0 || math.IsInf(in.Amount, 0) || math.IsNaN(in.Amount) {
		return "", "Amount must be greater than 0"
	}
	desc := strings.TrimSpace(in.Description)
	if desc == "" {
		return "", "Description cannot be empty"
	}
	if !recurring.ValidDay(in.DayOfMonth) {
		return "", "Day of month must be between 1 and 28"
	}
	return desc, ""
}

func toRecurringDTO(rule model.RecurringTransaction) RecurringDTO {
	return RecurringDTO{
		ID:          rule.ID,
		Type:        string(rule.Type),
		Category:    string(rule.Category),
		Amount:      rule.Amount,
		Currency:    string(rule.Currency),
		Description: rule.Description,
		DayOfMonth:  rule.DayOfMonth,
		NextDueDate: rule.NextDueDate.Format(dateLayout),
	}
}

func buildRecurringList(rules []model.RecurringTransaction) RecurringListResponse {
	resp := RecurringListResponse{Recurring: make([]RecurringDTO, len(rules)), Count: len(rules)}
	for i, rule := range rules {
		resp.Recurring[i] = toRecurringDTO(rule)
		if rule.Type == model.TypeIncome {
			resp.TotalIncome += rule.Amount
		} else {
			resp.TotalExpense += rule.Amount
		}
	}
	resp.TotalIncome = math.Round(resp.TotalIncome*100) / 100
	resp.TotalExpense = math.Round(resp.TotalExpense*100) / 100
	return resp
}

// checkRecurringLimit sends an error and returns false when the user already
// has the maximum number of rules.
func (s *Server) checkRecurringLimit(w http.ResponseWriter, tgID int64) bool {
	n, err := s.repositories.Recurring.Count(tgID)
	if err != nil {
		s.logger.Errorf("Failed to count recurring transactions: %v", err)
		s.sendJSONError(w, "Failed to create recurring transaction", http.StatusInternalServerError)
		return false
	}
	if n >= maxRecurringPerUser {
		s.sendJSONError(w, "You have reached the limit of recurring transactions", http.StatusBadRequest)
		return false
	}
	return true
}

// handleAPIRecurring lists the user's recurring rules.
//
//	@Summary		List recurring transactions
//	@Description	Monthly rules, sorted by day of month, with monthly totals per type.
//	@Tags			recurring
//	@Produce		json
//	@Success		200	{object}	RecurringListResponse
//	@Failure		401	{object}	ErrorResponse
//	@Failure		500	{object}	ErrorResponse
//	@Security		BearerAuth
//	@Router			/api/recurring [get]
func (s *Server) handleAPIRecurring(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	user := client.GetUserFromContext(r.Context())
	if user == nil {
		s.sendJSONError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	rules, err := s.repositories.Recurring.List(user.TgID)
	if err != nil {
		s.logger.Errorf("Failed to list recurring transactions: %v", err)
		s.sendJSONError(w, "Failed to get recurring transactions", http.StatusInternalServerError)
		return
	}
	s.sendJSONSuccess(w, buildRecurringList(rules))
}

// handleAPICreateRecurring creates a recurring rule.
//
//	@Summary		Create recurring transaction
//	@Description	The first transaction is added on the first matching day strictly after today. With sourceTransactionId, a source transaction in the current month or later counts as that month's payment and the rule starts the month after.
//	@Tags			recurring
//	@Accept			json
//	@Produce		json
//	@Param			body	body		CreateRecurringRequest	true	"Rule"
//	@Success		200		{object}	RecurringDTO
//	@Failure		400		{object}	ErrorResponse
//	@Failure		401		{object}	ErrorResponse
//	@Failure		404		{object}	ErrorResponse
//	@Failure		409		{object}	ErrorResponse
//	@Failure		500		{object}	ErrorResponse
//	@Security		BearerAuth
//	@Router			/api/recurring/create [post]
func (s *Server) handleAPICreateRecurring(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	user := client.GetUserFromContext(r.Context())
	if user == nil {
		s.sendJSONError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req CreateRecurringRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendJSONError(w, "Invalid request", http.StatusBadRequest)
		return
	}
	desc, msg := validateRecurringInput(recurringInput{req.Type, req.Category, req.Amount, req.Description, req.DayOfMonth})
	if msg != "" {
		s.sendJSONError(w, msg, http.StatusBadRequest)
		return
	}
	if !s.checkRecurringLimit(w, user.TgID) {
		return
	}

	today := recurring.Today()
	rule := model.RecurringTransaction{
		TgID:        user.TgID,
		Type:        model.TransactionType(req.Type),
		Category:    model.TransactionCategory(req.Category),
		Amount:      req.Amount,
		Currency:    model.CurrencyEUR,
		Description: desc,
		DayOfMonth:  req.DayOfMonth,
		NextDueDate: recurring.FirstDue(today, req.DayOfMonth),
	}

	var linkTxID *int64
	var linkPeriod string
	if req.SourceTransactionID != nil {
		src, err := s.repositories.Transactions.GetByID(*req.SourceTransactionID)
		if err != nil || src.TgID != user.TgID {
			s.sendJSONError(w, "Transaction not found", http.StatusNotFound)
			return
		}
		// A transaction already added by another rule stays with that rule
		// and is only used as a template.
		if src.RecurringID == nil {
			link, next := recurring.FromTransaction(src.Date, today, req.DayOfMonth)
			rule.NextDueDate = next
			if link {
				linkTxID = &src.ID
				linkPeriod = recurring.Period(src.Date)
			}
		}
	}

	if err := s.repositories.Recurring.Create(&rule, linkTxID, linkPeriod); err != nil {
		if errors.Is(err, db.ErrSourceTransactionTaken) {
			s.sendJSONError(w, "That transaction is already linked to a recurring transaction", http.StatusConflict)
			return
		}
		s.logger.Errorf("Failed to create recurring transaction: %v", err)
		s.sendJSONError(w, "Failed to create recurring transaction", http.StatusInternalServerError)
		return
	}

	s.sendJSONSuccess(w, toRecurringDTO(rule))
}

// handleAPIEditRecurring replaces the fields of a recurring rule.
//
//	@Summary		Edit recurring transaction
//	@Description	Changes apply to future transactions only. A new day moves the next date inside the month still owed, so a month is never skipped or doubled.
//	@Tags			recurring
//	@Accept			json
//	@Produce		json
//	@Param			body	body		EditRecurringRequest	true	"Rule"
//	@Success		200		{object}	RecurringDTO
//	@Failure		400		{object}	ErrorResponse
//	@Failure		401		{object}	ErrorResponse
//	@Failure		404		{object}	ErrorResponse
//	@Failure		500		{object}	ErrorResponse
//	@Security		BearerAuth
//	@Router			/api/recurring/edit [patch]
func (s *Server) handleAPIEditRecurring(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	user := client.GetUserFromContext(r.Context())
	if user == nil {
		s.sendJSONError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req EditRecurringRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendJSONError(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if req.ID <= 0 {
		s.sendJSONError(w, "Invalid recurring transaction ID", http.StatusBadRequest)
		return
	}
	desc, msg := validateRecurringInput(recurringInput{req.Type, req.Category, req.Amount, req.Description, req.DayOfMonth})
	if msg != "" {
		s.sendJSONError(w, msg, http.StatusBadRequest)
		return
	}

	rule, err := s.repositories.Recurring.Update(req.ID, user.TgID, func(rule *model.RecurringTransaction) error {
		applyRecurringEdit(rule, req, desc)
		return nil
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			s.sendJSONError(w, "Recurring transaction not found", http.StatusNotFound)
			return
		}
		s.logger.Errorf("Failed to update recurring transaction: %v", err)
		s.sendJSONError(w, "Failed to update recurring transaction", http.StatusInternalServerError)
		return
	}

	s.sendJSONSuccess(w, toRecurringDTO(*rule))
}

// applyRecurringEdit copies validated fields onto a locked rule.
func applyRecurringEdit(rule *model.RecurringTransaction, req EditRecurringRequest, desc string) {
	if req.DayOfMonth != rule.DayOfMonth {
		rule.NextDueDate = recurring.WithDay(rule.NextDueDate, req.DayOfMonth)
		rule.DayOfMonth = req.DayOfMonth
	}
	rule.Type = model.TransactionType(req.Type)
	rule.Category = model.TransactionCategory(req.Category)
	rule.Amount = req.Amount
	rule.Description = desc
}

// handleAPIDeleteRecurring deletes a recurring rule. Transactions it already
// added are kept.
//
//	@Summary		Delete recurring transaction
//	@Description	Stops future transactions. Past transactions are kept and lose their link to the rule.
//	@Tags			recurring
//	@Accept			json
//	@Produce		json
//	@Param			body	body		DeleteRecurringRequest	true	"Rule ID"
//	@Success		200		{object}	MessageResponse
//	@Failure		400		{object}	ErrorResponse
//	@Failure		401		{object}	ErrorResponse
//	@Failure		404		{object}	ErrorResponse
//	@Failure		500		{object}	ErrorResponse
//	@Security		BearerAuth
//	@Router			/api/recurring/delete [delete]
func (s *Server) handleAPIDeleteRecurring(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	user := client.GetUserFromContext(r.Context())
	if user == nil {
		s.sendJSONError(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req DeleteRecurringRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendJSONError(w, "Invalid request", http.StatusBadRequest)
		return
	}
	if req.ID <= 0 {
		s.sendJSONError(w, "Invalid recurring transaction ID", http.StatusBadRequest)
		return
	}

	if err := s.repositories.Recurring.Delete(req.ID, user.TgID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			s.sendJSONError(w, "Recurring transaction not found", http.StatusNotFound)
			return
		}
		s.logger.Errorf("Failed to delete recurring transaction: %v", err)
		s.sendJSONError(w, "Failed to delete recurring transaction", http.StatusInternalServerError)
		return
	}

	s.sendJSONSuccess(w, MessageResponse{Message: "Recurring transaction deleted"})
}

// recurringFromNewTransaction builds the rule for "Repeat monthly" on a new
// transaction, and whether the transaction counts as this month's payment.
func recurringFromNewTransaction(t model.Transaction, today time.Time) (model.RecurringTransaction, bool) {
	day := recurring.DayFromDate(t.Date)
	link, next := recurring.FromTransaction(t.Date, today, day)
	return model.RecurringTransaction{
		TgID:        t.TgID,
		Type:        t.Type,
		Category:    t.Category,
		Amount:      t.Amount,
		Currency:    t.Currency,
		Description: strings.TrimSpace(t.Description),
		DayOfMonth:  day,
		NextDueDate: next,
	}, link
}

// createTransactionWithRecurring saves a new transaction together with the
// rule built from it ("Repeat monthly").
func (s *Server) createTransactionWithRecurring(w http.ResponseWriter, t *model.Transaction) {
	if strings.TrimSpace(t.Description) == "" {
		s.sendJSONError(w, "Add a description to repeat this monthly", http.StatusBadRequest)
		return
	}
	if (t.Type == model.TypeIncome) != isIncomeCategory(string(t.Category)) {
		s.sendJSONError(w, "Category does not match the type", http.StatusBadRequest)
		return
	}
	if !s.checkRecurringLimit(w, t.TgID) {
		return
	}

	rule, link := recurringFromNewTransaction(*t, recurring.Today())
	if err := s.repositories.Recurring.CreateWithTransaction(t, &rule, link); err != nil {
		s.logger.Errorf("Failed to create transaction with recurring rule: %v", err)
		s.sendJSONError(w, "Failed to create transaction", http.StatusInternalServerError)
		return
	}

	dto := toRecurringDTO(rule)
	s.sendJSONSuccess(w, CreateTransactionResponse{Message: "Transaction created successfully", Recurring: &dto})
}
