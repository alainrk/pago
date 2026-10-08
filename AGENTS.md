# pago Development Guidelines

## Active Technologies

- Go 1.26 + gotgbot/v2 (Telegram bot framework), GORM with PostgreSQL, OpenAI-compatible LLM (internal/ai)
- Frontend: React + Vite + TypeScript (frontend/)

## Project Structure

```text
cmd/server/   Telegram bot entry point
cmd/web/      web server entry point
cmd/          also email, migrate, seed
internal/     app code (ai, db, model, repository, scheduler, server, web, ...)
frontend/     React app
specs/        feature specs (001-003)
```

## Commands

- `make test` runs lint, then tests with -race
- `make lint` runs golangci-lint
- `make build` / `make build-web` build the bot / web server
- `make run` / `make run-web` build and run them

## Code Style

Code must pass `make lint` (config in golangci.yml).
