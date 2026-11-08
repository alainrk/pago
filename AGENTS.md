# pago Development Guidelines

## Active Technologies

- Go 1.26, GORM with PostgreSQL, OpenAI-compatible LLM (internal/ai)
- Sign-in: Google (only way to sign up) and passkeys. The Telegram bot was removed.
- Frontend: React + Vite + TypeScript (frontend/)

## Project Structure

```text
cmd/web/      web server entry point (API, legacy dashboard, recurring job)
cmd/          also email, migrate, seed, telegram-farewell (one-off)
internal/     app code (ai, db, model, repository, scheduler, web, ...)
frontend/     React app
specs/        feature specs (001-003)
```

## Commands

- `make test` runs lint, then tests with -race
- `make lint` runs golangci-lint
- `make build-web` / `make run-web` build / run the web server

## Code Style

Code must pass `make lint` (config in golangci.yml).
