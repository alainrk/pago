package db

import "pago/internal/model"

// GetUser retrieves a user by their Telegram ID
func (db *DB) GetUser(tgID int64) (*model.User, error) {
	var user model.User
	result := db.conn.Where("tg_id = ?", tgID).First(&user)
	if result.Error != nil {
		return nil, result.Error
	}
	return &user, nil
}

// GetUserByUsername retrieves a user by their Telegram username
func (db *DB) GetUserByUsername(username string) (*model.User, error) {
	var user model.User
	result := db.conn.Where("tg_username = ?", username).First(&user)
	if result.Error != nil {
		return nil, result.Error
	}
	return &user, nil
}

// GetUserByEmail retrieves a user by their email
func (db *DB) GetUserByEmail(email string) (*model.User, error) {
	var user model.User
	result := db.conn.Where("email = ?", email).First(&user)
	if result.Error != nil {
		return nil, result.Error
	}
	return &user, nil
}

// SetUser creates or updates a user. google_sub is left out: a caller saving
// a row it loaded a while ago must not undo a Google link made in the
// meantime. It changes only through GoogleSignIn.
func (db *DB) SetUser(user *model.User) error {
	// Use upsert functionality (create if not exists, update if exists)
	result := db.conn.Omit("google_sub").Save(user)
	return result.Error
}

// ListTelegramUsers returns the accounts made by the old Telegram bot
// (positive tg_id, which is their Telegram chat id). Used once, to tell them
// that the bot is going away.
func (db *DB) ListTelegramUsers() ([]model.User, error) {
	var users []model.User
	err := db.conn.Where("tg_id > 0").Order("tg_id").Find(&users).Error
	return users, err
}
