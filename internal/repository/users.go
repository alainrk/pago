package repository

import (
	"errors"

	"pago/internal/model"

	"gorm.io/gorm"
)

type Users struct {
	Repository
}

func (r *Users) Update(user *model.User) error {
	return r.DB.SetUser(user)
}

// GetByEmail retrieves a user by their email
func (r *Users) GetByEmail(email string) (model.User, bool, error) {
	user, err := r.DB.GetUserByEmail(email)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.User{}, false, nil
		}
		return model.User{}, false, err
	}
	return *user, true, nil
}

// GetByTgID retrieves a user by their Telegram ID
func (r *Users) GetByTgID(tgID int64) (model.User, error) {
	user, err := r.DB.GetUser(tgID)
	if err != nil {
		return model.User{}, err
	}
	return *user, nil
}
