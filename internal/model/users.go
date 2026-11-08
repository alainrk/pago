// Package model provides the data models for the application
package model

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"
)

// StateType represents the last state of the user (if any)
type StateType string

// State type constants
const (
	// Normal state where the user has to give commands.
	StateNormal StateType = "normal"
	// Only when the user has started the bot.
	StateStart StateType = "start"
	// The user has to add an expense after having set the bot to accept it.
	StateInsertingExpense StateType = "inserting_expense"
	// The user has to add an income after having set the bot to accept it.
	StateInsertingIncome StateType = "inserting_income"
	// The user has to edit the transaction, during an insert flow
	StateEditingTransactionDate        StateType = "editing_transaction_date"
	StateEditingTransactionAmount      StateType = "editing_transaction_amount"
	StateEditingTransactionDescription StateType = "editing_transaction_description"
	// The user has to edit the transaction, during an edit flow
	StateTopLevelEditingTransactionDate        StateType = "top_level_editing_transaction_date"
	StateTopLevelEditingTransactionAmount      StateType = "top_level_editing_transaction_amount"
	StateTopLevelEditingTransactionDescription StateType = "top_level_editing_transaction_description"
	// Search-related states
	StateSelectingSearchCategory StateType = "selecting_search_category"
	StateEnteringSearchQuery     StateType = "entering_search_query"
	// Edit search-related states
	StateSelectingEditSearchCategory StateType = "selecting_edit_search_category"
	StateEnteringEditSearchQuery     StateType = "entering_edit_search_query"
	// Delete search-related states
	StateSelectingDeleteSearchCategory StateType = "selecting_delete_search_category"
	StateEnteringDeleteSearchQuery     StateType = "entering_delete_search_query"
	// Clone-related states
	StateSelectingCloneTransaction    StateType = "selecting_clone_transaction"
	StateSelectingCloneSearchCategory StateType = "selecting_clone_search_category"
	StateEnteringCloneSearchQuery     StateType = "entering_clone_search_query"
	// The user has to confirm an action.
	StateWaitingConfirm StateType = "waiting_confirm"
	// The user is editing a newly added transaction.
	StateEditingNewTransaction StateType = "editing_new_transaction"
	// The user is entering the amount for their monthly budget.
	StateBudgetSetWaitAmount StateType = "budget_set_wait_amount"
)

// CommandType represents the type of command sent by the user
type CommandType string

// User represents the users table structure
//
// TgID is the account id. For accounts made by the old Telegram bot it is the
// Telegram id, for accounts made with Google it is negative.
type User struct {
	TgID        int64   `gorm:"column:tg_id;primaryKey"`
	TgUsername  string  `gorm:"column:tg_username"`
	TgFirstname string  `gorm:"column:tg_firstname"`
	TgLastname  string  `gorm:"column:tg_lastname"`
	Name        string  `gorm:"column:name"`
	Email       *string `gorm:"column:email;uniqueIndex:idx_users_email,where:email IS NOT NULL"`
	// GoogleSub is Google's stable account id ("sub"), or nil.
	GoogleSub *string `gorm:"column:google_sub"`
	// Quick entry (DeepSeek) choice: AIConsentAccepted, AIConsentDeclined or
	// nil (not asked yet), when, and the privacy policy version shown.
	AIConsent        *string     `gorm:"column:ai_consent"`
	AIConsentAt      *time.Time  `gorm:"column:ai_consent_at"`
	AIConsentVersion *string     `gorm:"column:ai_consent_version"`
	Session          UserSession `gorm:"column:session;type:jsonb"`
	CreatedAt        time.Time   `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt        time.Time   `gorm:"column:updated_at;autoUpdateTime"`

	// WebAuthn credentials (loaded via preload)
	// Note: Foreign key constraints are handled in migration files
	Credentials []WebAuthnCredential `gorm:"foreignKey:TgID;references:TgID"`
}

type UserSession struct {
	State StateType `json:"state"`
	Body  string    `json:"body"`
}

// Value makes the UserSession struct implement the driver.Valuer interface
func (s UserSession) Value() (driver.Value, error) {
	return json.Marshal(s)
}

// Scan makes the UserSession struct implement the sql.Scanner interface
func (s *UserSession) Scan(value any) error {
	if value == nil {
		*s = UserSession{State: ""}
		return nil
	}

	bytes, ok := value.([]byte)
	if !ok {
		return errors.New("type assertion to []byte failed")
	}

	return json.Unmarshal(bytes, s)
}

// JSONData is a custom type for handling JSON in the database
type JSONData map[string]any

// Value makes the JSONData struct implement the driver.Valuer interface
func (j JSONData) Value() (driver.Value, error) {
	if j == nil {
		return nil, nil
	}
	return json.Marshal(j)
}

// Scan makes the JSONData struct implement the sql.Scanner interface
func (j *JSONData) Scan(value any) error {
	if value == nil {
		*j = make(JSONData)
		return nil
	}

	bytes, ok := value.([]byte)
	if !ok {
		return errors.New("type assertion to []byte failed")
	}

	return json.Unmarshal(bytes, j)
}

// Quick entry consent values.
const (
	AIConsentAccepted = "accepted"
	AIConsentDeclined = "declined"
	// AIPolicyVersion is the privacy policy version (its "last updated" date,
	// https://faccio.app/pago/privacy) the quick entry sheet describes. Change
	// it when the DeepSeek part of the policy changes: everyone is asked again.
	AIPolicyVersion = "2026-11-08"
)

// QuickEntryChoice is the person's choice for the current policy version:
// AIConsentAccepted, AIConsentDeclined, or "" when they must be asked.
func (u *User) QuickEntryChoice() string {
	if u.AIConsent == nil || u.AIConsentVersion == nil || *u.AIConsentVersion != AIPolicyVersion {
		return ""
	}
	switch *u.AIConsent {
	case AIConsentAccepted, AIConsentDeclined:
		return *u.AIConsent
	}
	return ""
}

// TableName overrides the table name
func (User) TableName() string {
	return "users"
}
