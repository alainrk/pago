// Package repository provides a generic repository for the application
package repository

import (
	"pago/internal/db"

	"github.com/sirupsen/logrus"
)

type Repository struct {
	DB     *db.DB
	Logger *logrus.Logger
}
