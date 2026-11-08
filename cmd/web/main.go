// Package main is the pago web server entrypoint (API and old dashboard).
//
//	@title			Pago API
//	@version		1.0
//	@description	Personal finance tracking API. All /api/* endpoints require either a session cookie (browser) or an Authorization: Bearer <token> header (machine clients).
//	@BasePath		/web
//
//	@securityDefinitions.apikey	BearerAuth
//	@in							header
//	@name						Authorization
//	@description				Provide the value as: Bearer <token>
package main

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"time"

	"pago/internal/ai"
	"pago/internal/db"
	"pago/internal/email"
	"pago/internal/logging"
	"pago/internal/repository"
	"pago/internal/scheduler"
	"pago/internal/web"

	"github.com/joho/godotenv"
)

func main() {
	err := godotenv.Load()
	if err != nil {
		fmt.Println("Error loading .env file")
	}

	logger := logging.GetLogger(os.Getenv("LOG_LEVEL"))

	// Initialize email service (optional: without BREVO_API_KEY the email
	// login method is disabled and everything else keeps working).
	var emailService *email.EmailService
	if key := os.Getenv("BREVO_API_KEY"); key != "" {
		emailService, err = email.NewEmailService(key, os.Getenv("EMAIL_FROM_NAME"), os.Getenv("EMAIL_FROM_ADDRESS"))
		if err != nil {
			logger.Fatalf("Failed to initialize email service: %s\n", err.Error())
		}
	} else {
		logger.Warnln("BREVO_API_KEY is empty: email login is disabled")
	}

	// OpenAI API Compatible LLM Setup (if needed for dashboard features)
	llm := ai.LLM{
		Logger:          logger,
		APIKey:          os.Getenv("OPENAI_API_KEY"),
		Model:           os.Getenv("LLM_MODEL"),
		Endpoint:        fmt.Sprintf("%s/chat/completions", os.Getenv("OPENAI_BASE_URL")),
		DisableThinking: os.Getenv("LLM_DISABLE_THINKING") == "true",
	}

	// Initialize database
	postgresURL := os.Getenv("DATABASE_URL")
	if postgresURL == "" {
		logger.Fatalln("DATABASE_URL environment variable is empty")
	}

	database, err := db.NewDB(postgresURL)
	if err != nil {
		logger.Fatalf("Failed to initialize database: %s\n", err.Error())
	}

	defer func() {
		err = errors.Join(err, database.Close())
	}()

	// For repositories structs embedding common fields
	repo := repository.Repository{
		DB:     database,
		Logger: logger,
	}

	// Initialize WebAuthn repository
	webAuthnRepo, err := repository.NewWebAuthn(repo)
	if err != nil {
		logger.Fatalf("Failed to initialize WebAuthn repository: %s\n", err.Error())
	}

	repositories := web.Repositories{
		Users:        repository.Users{Repository: repo},
		Transactions: repository.Transactions{Repository: repo},
		Auth:         repository.Auth{Repository: repo},
		WebAuthn:     webAuthnRepo,
		Budgets:      repository.Budgets{Repository: repo},
		Recurring:    repository.Recurring{Repository: repo},
	}

	// Start periodic WebAuthn session cleanup (every hour)
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			if err := webAuthnRepo.CleanupExpiredSessions(); err != nil {
				logger.Errorf("Failed to cleanup expired WebAuthn sessions: %v", err)
			} else {
				logger.Debugf("Successfully cleaned up expired WebAuthn sessions")
			}
			if err := repositories.Auth.CleanupExpiredTokens(); err != nil {
				logger.Errorf("Failed to cleanup expired auth data: %v", err)
			}
		}
	}()

	// Initialize web server
	// Legacy Telegram login code, only on hosts without Google (the old
	// address) and only while TELEGRAM_BOT_API_TOKEN is set. Remove the token
	// when the bot is switched off.
	telegram, err := web.NewTelegramSender(os.Getenv("TELEGRAM_BOT_API_TOKEN"))
	if err != nil {
		logger.Fatalf("Failed to set up the Telegram sender: %s\n", err.Error())
	}
	if telegram == nil {
		logger.Infoln("TELEGRAM_BOT_API_TOKEN is empty: Telegram login codes are off")
	}

	webServer := web.NewServer(logger, repositories, llm, emailService, telegram)

	// Background jobs: monthly recurring transactions (this used to run in
	// the Telegram bot).
	sched := scheduler.NewScheduler(&repositories.Recurring, logger)
	sched.Start()
	defer sched.Stop()

	// Get web server configuration
	webHost := os.Getenv("WEB_HOST")
	if webHost == "" {
		webHost = "localhost"
	}

	webPort := os.Getenv("WEB_PORT")
	if webPort == "" {
		webPort = "8091"
	}

	addr := fmt.Sprintf("%s:%s", webHost, webPort)
	logger.Infof("Starting web server on %s", addr)

	if err := http.ListenAndServe(addr, web.Router(webServer)); err != nil {
		logger.Fatalf("Web server failed: %s", err.Error())
	}
}
