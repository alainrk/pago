# Pago

**AI Agent** and **App** for Income and Expense Management.

You can self-host it following the Developer section down below.

<p align="center">
  <img src="/assets/demo.gif" alt="Pago demo" width="420">
</p>

## Screenshots

| Add a transaction in plain words | Filter by month and category |
| :---: | :---: |
| ![Add transaction](/assets/screenshots/add-transaction.png) | ![Transactions with filters](/assets/screenshots/transactions-filters.png) |
| **Full text search across years** | **Monthly report** |
| ![Transactions search](/assets/screenshots/transactions-search.png) | ![Monthly report](/assets/screenshots/reports-month.png) |
| **Yearly report** | **Settings: budget, passkeys, export** |
| ![Yearly report](/assets/screenshots/reports-year.png) | ![Settings](/assets/screenshots/settings.png) |

## Features

Pago is an intelligent Telegram bot that leverages AI to make expense tracking effortless. Simply send a message in natural language, and the bot will understand and categorize your transactions automatically.

### AI-Powered Transaction Processing

- **Intelligent Intent Routing**: Just type naturally, no commands needed. The AI understands whether you want to add a transaction, check your weekly summary, search, edit, delete, or export. Simply say "show me this week", "delete expense" or "irish pub 4.50" and the bot figures out the rest. If there is no match or you prefer to do otherwise, you can always fall back to a completely deterministic and classic flow.
- **Smart Categorization**: Automatically assigns the right category based on your description.
- **Duplicate Detection**: The AI detects when a new transaction looks like a recent one already saved and asks you to confirm before storing it, preventing accidental double-entries.
- **Flexible Date Recognition**: Understands various date formats (dd/mm, dd-mm-yyyy, "yesterday", etc.).
- **Multi-language Support**: Works with transaction descriptions in any language.

### Transaction Management

- **Quick Entry**: Add expenses and income with a single message.
- **Inline Editing**: Modify amount, category, description, or date before confirming.
- **Bulk Operations**: Edit or delete existing transactions with paginated navigation.
- **Transaction Types**: Track both expenses (17 categories) and income (2 categories).
- **Search and Full Listing**: Find transactions by full text search and category or full listing.
- **Export Functionality**: Download all your transactions as CSV files.

### Financial Insights

- **Weekly Recap**: Get detailed breakdowns of your current week's spending.
- **Monthly Summary**: View month-by-month financial performance with category breakdowns.
- **Yearly Overview**: See annual trends and top spending categories.
- **Balance Tracking**: Instant calculation of income vs expenses for any period.
- **Category Analysis**: Understand where your money goes with percentage breakdowns.

### Monthly Budget

- **One Monthly Limit**: Set a total spending limit that applies to every month.
- **Telegram Alerts**: The bot warns you once as spending gets close to the limit, and again when you go over it.
- **Managed Anywhere**: Set, change or remove the budget from the web app settings or with `/budget` in the bot.

### Web App

- **Responsive SPA** (`frontend/`): desktop sidebar layout and a mobile layout with bottom tabs.
- **AI quick add**: type "irish pub 12.50 yesterday", review the parsed fields, confirm. Warns about likely duplicates.
- **Multiple Authentication Methods**:
  - Passkey/WebAuthn sign-in, usernameless (the browser picks the passkey).
  - Telegram-based login with verification codes.
  - Email-based passwordless authentication (API only).
- **Transaction Management**:
  - Add new transactions directly from the web interface, with auto-save on creation.
  - Edit and delete existing transactions inline.
  - View detailed transaction history with search and filtering.
  - Monthly navigation with intuitive controls.
- **Visual Analytics**:
  - Real-time balance, income, and expense statistics.
  - Interactive charts for category breakdowns and monthly trends.
  - Transaction counts and summaries.
- **Budget Management**:
  - Set or remove the monthly spending limit from the settings page.
- **Security Features**:
  - Rate-limited authentication endpoints.
  - Secure session management with configurable duration.
  - Support for multiple passkeys per user.
  - Passkey management (register, list, delete).

### Smart Reminders

- **Automated Weekly Recaps**: Receive your previous week's summary every Monday.
- **Automated Monthly Recaps**: Receive your previous month's summary on the 1st of each month.
- **Intelligent Scheduling**: Only sends reminders to active users.
- **Reliable Delivery**: Built-in retry mechanism for failed notifications.

### Available Commands

- `/start` or `/new` - Show the main menu
- `/edit` - Edit an existing transaction
- `/delete` - Delete a transaction
- `/clone` - Copy an existing transaction to a new date
- `/list` - View all transactions (paginated)
- `/search` - Search transactions by description
- `/week` - Get current week's financial summary
- `/month` - Get current month's financial summary
- `/year` - Get current year's financial summary
- `/budget` - View or change the monthly spending limit
- `/export` - Export all transactions to CSV
- `/cancel` - Cancel the current operation

### User Experience

- **Intuitive Interface**: Clean inline keyboards for all operations, with a homogeneous category selector across add, edit, search, and budget flows.
- **Smart Navigation**: Year/month selectors for browsing historical data, with the year shown in list and search results to avoid ambiguity.
- **Pagination**: Handle large transaction lists with ease.
- **Live Typing Indicator**: The bot signals "typing..." while the AI thinks, so you always know it is working.
- **Quick Actions**: Home screen with instant access to all major functions, kept stable to avoid flicker on updates.
- **Cancel Anytime**: Every operation can be cancelled mid-flow.

### Technical Features

- **Database Migrations**: Version-controlled schema management
- **Webhook & Polling Support**: Flexible deployment options.
- **Development Tools**: Built-in database seeder for testing.
- **Modular Architecture**: Clean separation of concerns for easy maintenance.
- **Configurable Access**: Optional user whitelist for private deployments.

## Getting Started

### Prerequisites

- Go 1.26 or higher
- PostgreSQL Database (or Docker, to run one locally)
- Node 22 or higher, only for the web app in `frontend/`
- Access to an OpenAI-compatible API model, with its API Key and Endpoint (e.g. DeepSeek, OpenAI, etc.)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/alainrk/pago.git
cd pago
```

2. Install dependencies:

```bash
go mod download
```

### Environment Setup

```bash
cp .env.example .env
```

Then edit `.env`. The full list with comments is in `.env.example`. The main
settings are:

```env
TELEGRAM_BOT_API_TOKEN='XXXXXXXXXX:AAAA_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
DATABASE_URL='postgres://postgres:postgres@localhost:5433/postgres'
OPENAI_API_KEY='sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
OPENAI_BASE_URL='https://api.deepseek.com/v1'
LLM_MODEL='deepseek-v4-flash'
LLM_DISABLE_THINKING='true'
RUN_MODE='polling' # webhook or polling
WEBHOOK_DOMAIN=''
WEBHOOK_SECRET=''
WEBHOOK_HOST='localhost'
WEBHOOK_PORT='8080'
LOG_LEVEL='info'
# Dev purpose, comma separated Telegram usernames. Keep it empty to allow all
ALLOWED_USERS=''
# Seed purpose - set the Telegram ID of the user to seed transactions for
SEED_USER_TG_ID=''
# Web server (API and legacy dashboard)
WEB_HOST=127.0.0.1
WEB_PORT=8091
WEB_DASHBOARD_URL='http://localhost:8091/web/dashboard'
SESSION_SECRET='your-random-session-secret-here'
SESSION_DURATION_MIN=43200
# Browser app served from another origin (see "Web App" below)
WEB_CORS_ORIGINS='http://localhost:5174'
WEB_COOKIE_SAMESITE='lax'
# Passkeys. RP ID is the domain, RP origin is the exact frontend origin
WEBAUTHN_RP_ID='localhost'
WEBAUTHN_RP_ORIGIN='http://localhost:5174'
# Email login codes are sent through Brevo. Leave the key empty to disable email login
BREVO_API_KEY=''
EMAIL_FROM_NAME='Pago App'
EMAIL_FROM_ADDRESS='noreply@your-domain.com'
# Bot health check endpoint
HEALTH_CHECK_TOKEN='your-secret-token'
HEALTH_CHECK_PORT=8082
```

Start a local PostgreSQL (the `docker-compose.yml` in the repo root only
holds the database, mapped to port 5433), then apply the migrations:

```bash
docker compose up -d
go run ./cmd/migrate/main.go -command up
```

## Database Management

Pago uses a version-based migration system to manage database schema changes.

Use the following commands to manage database migrations:

```bash
# Run all pending migrations
go run ./cmd/migrate/main.go -command up

# Run all pending migrations with another .env file
go run ./cmd/migrate/main.go -command up -env .prod.env

# Create a new migration just by copy-pasting a previous one and editing it accordingly
cp internal/migrations/versions/001*.go internal/migrations/versions/00X_your_migration.go
```

For migrations that support rollback, use the `RegisterMigrationWithRollback` function:

```go
func init() {
    migrations.RegisterMigrationWithRollback("003", "Add email column",
        add_email_column, rollback_email_column)
}

func rollback_email_column(tx *gorm.DB) error {
    return tx.Exec(`ALTER TABLE users DROP COLUMN email`).Error
}
```

## Development

### Building and Running

#### Telegram Bot

```bash
# Build the bot
make build

# Run the bot
make run

# Run the bot with live reloading (requires Air)
make run/live
```

#### Web Server

```bash
# Build the web server
make build-web

# Run the web server
make run-web

# Run the web server with live reloading
make run/live-web
```

#### Web App (frontend/)

The `frontend/` folder holds the single page app (Vite + React + TypeScript).
It talks to the web server API under `/web/api/*` and is what you deploy for
users; the Go web server only serves the API (and the legacy templates).

```bash
# Install dependencies once (Node 22 or newer)
make fe/install

# Start the dev server on http://localhost:5174.
# It proxies /web to the Go web server on localhost:8091, so run `make run-web` too.
make fe/dev

# Typecheck and run unit tests
make fe/check
```

For passkeys to work in development set `WEBAUTHN_RP_ID=localhost` and
`WEBAUTHN_RP_ORIGIN=http://localhost:5174` in `.env`.

#### Both Services

```bash
# Build both applications
make build-all

# Build both for Linux
make build-linux-all

# Note: Running both requires two terminals
# Terminal 1: make run
# Terminal 2: make run-web
```

### Database Seeding

The Dev DB Seeder generates test transaction data for development. The user
must already exist: send `/start` to your bot once, or insert a row in the
`users` table by hand.

```bash
# Set the user's Telegram ID you want to seed data for (or put it in .env)
export SEED_USER_TG_ID=123456789

# Seed the database with random transactions
make db/seed
```

The seeder will:

- Generate 5 years of transaction history.
- Create 90% expenses and 10% income transactions.
- Distribute transactions across all categories.
- Ensure at least one salary per month.
- Delete existing transactions before seeding (idempotent).
- Leave budgets untouched. Create those from the web app or the `/budget` command.

## Deployment

### Docker Images

The repo ships two images, one per process:

- `Dockerfile` builds the Telegram bot (`/app/pago`). It listens on 8080 for
  the webhook and on 8082 for the health check.
- `Dockerfile.web` builds the web server (`/app/pago-web`). It serves the API
  and the legacy dashboard on 8081 (set `WEB_HOST=0.0.0.0` and `WEB_PORT=8081`).

```bash
docker build -t pago -f Dockerfile .
docker build -t pago-web -f Dockerfile.web .
```

Run them with your own compose file or orchestrator behind a reverse proxy
that terminates TLS. Point `/health*` at the bot's health port, `/web/*` at
the web server, and everything else at the bot's webhook port. Migrations are
not run by the images: run `go run ./cmd/migrate/main.go -command up` against
the database before the first start and after each upgrade.

The `docker-compose.yml` in the repo root is for local development only. It
starts just PostgreSQL.

### Web App on Cloudflare

The SPA is a static build, so any static host works. The repo ships a generic
config for Cloudflare Workers static assets (`frontend/wrangler.jsonc`).

1. Point the app at your API. Create `frontend/.env.production.local`
   (it is git-ignored) with the public URL of your Go web server:

   ```env
   VITE_API_URL=https://api.your-domain.example
   ```

2. Log in to Cloudflare once with `npx wrangler login` (inside `frontend/`).

3. Build and upload:

   ```bash
   make fe/deploy
   ```

4. Attach your domain to the `pago-web` worker in the Cloudflare dashboard
   (Workers & Pages, Settings, Domains & Routes). Nothing about your domain or
   account needs to be committed to this repository.

5. Configure the Go web server for the browser app:

   ```env
   WEB_CORS_ORIGINS=https://app.your-domain.example
   WEB_COOKIE_SAMESITE=lax
   WEBAUTHN_RP_ID=your-domain.example
   WEBAUTHN_RP_ORIGIN=https://app.your-domain.example
   ```

   Keep the app and the API under the same parent domain (for example
   `app.example.com` and `api.example.com`) so the session cookie works with
   `SameSite=Lax`. If they are on unrelated domains set
   `WEB_COOKIE_SAMESITE=none` (HTTPS only).

The build also writes a `_headers` file with a Content-Security-Policy that
only allows API calls to the `VITE_API_URL` origin.

### Manual Deployment

#### Telegram Bot

The bot can run both in `webhook` and `polling` mode.

**Webhook Mode:**

```env
RUN_MODE='webhook'
WEBHOOK_DOMAIN='https://your-domain.com'
WEBHOOK_SECRET='xxxyyyzzz'
WEBHOOK_PORT='8080'
```

**Polling Mode:**

```env
RUN_MODE='polling'
```

#### Web Server

The web server runs independently and can be configured:

```env
WEB_HOST=0.0.0.0  # For production
WEB_PORT=8091
SESSION_SECRET=your-random-session-secret-here
SESSION_DURATION_MIN=43200  # 30 days
WEB_CORS_ORIGINS=https://app.your-domain.example
WEBAUTHN_RP_ID=your-domain.example
WEBAUTHN_RP_ORIGIN=https://app.your-domain.example
```

### LLM Setup

Any OpenAI compatible API LLM can be used:

**Example with DeepSeek:**

```env
OPENAI_API_KEY='sk-xxx'
OPENAI_BASE_URL='https://api.deepseek.com/v1'
LLM_MODEL='deepseek-v4-flash'
LLM_DISABLE_THINKING='true'
```

**Example with OpenAI:**

```env
OPENAI_API_KEY='sk-xxx'
OPENAI_BASE_URL='https://api.openai.com/v1'
LLM_MODEL='gpt-4'
```

## Web App Usage

### Authentication Options

The web app supports three authentication methods:

1. **Telegram Login** (code-based):
   - Enter your Telegram username.
   - Check Telegram for a 6-digit verification code.
   - Enter the code to access your dashboard.

2. **Email Login** (passwordless):
   - Enter your registered email address.
   - Check your email for a 6-digit verification code.
   - Enter the code to access your dashboard.

3. **Passkey Login** (WebAuthn):
   - Register a passkey from your dashboard settings after initial login.
   - Use biometric authentication (fingerprint, face recognition) on subsequent logins.
   - No codes needed - instant secure access.

### App Features

1. **Access**: Open `http://localhost:5174` in development (`make fe/dev`) or the
   domain where you deployed `frontend/`. The older server-rendered dashboard is
   still available from the Go web server at `http://localhost:8091/web/dashboard`.
2. **Login**: Choose your preferred authentication method.
3. **Dashboard**: View your financial data with month navigation.
4. **Statistics**: See real-time balance, income, expenses, and transaction counts.
5. **Transactions**:
   - Add new transactions directly from the web interface, with AI quick add.
   - Browse detailed transaction history with search and filtering.
   - View transactions by category.
6. **Settings**: Set the monthly budget, register and delete passkeys, export
   your data as CSV.

The web app provides a complementary interface to the Telegram bot, offering:

- Better visualization for large datasets.
- Month-by-month navigation.
- Desktop and mobile-friendly transaction management.
- Multiple secure authentication options.
- Direct transaction creation without needing Telegram.

## HTTP API & SDKs

The dashboard endpoints under `/web/api/*` also accept programmatic clients via
`Authorization: Bearer <token>` in addition to the existing browser session cookie.

### Issuing a token (admin-only, direct DB insert)

There is no token-management UI on purpose (as of now); tokens are inserted manually by an
operator. The plaintext token is shown to the user once and only its SHA-256
hex digest is stored.

```bash
# Generate locally:
TOKEN="pago_$(openssl rand -base64 24 | tr -d '=+/' | head -c 32)"
HASH=$(printf %s "$TOKEN" | shasum -a 256 | awk '{print $1}')
echo "token=$TOKEN"

# Then in psql, replace <tg_id> with the target user's Telegram ID:
# INSERT INTO api_tokens (tg_id, name, token_hash, prefix)
#   VALUES (<tg_id>, 'my-cli', '<HASH>', substring('<TOKEN>' from 1 for 8));
```

Optional `expires_at` is supported; leave NULL for non-expiring tokens.

### Calling the API

```bash
curl -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8091/web/api/stats?month=2026-05"
```

### OpenAPI spec & generated SDKs

The spec lives at `api/swagger.{yaml,json}` and is generated from `swaggo/swag`
annotations on the handlers. SDKs are committed under `sdks/{python,go,typescript}/`.

```bash
make openapi        # regenerate the spec
make sdks           # regenerate spec + all three SDKs
make sdk-python     # individual languages
make sdk-go
make sdk-ts
```

SDK generation uses the `@openapitools/openapi-generator-cli` npm wrapper and
requires `npx` and Java 11+ on PATH.

### Consuming the TypeScript SDK (npm / pnpm / yarn)

The TypeScript SDK is generated and committed under `sdks/typescript/`, but a
proper consumer install path is **on standby** until there's a concrete need.

Unlike pip and Go, npm has no first-class way to install a package from a
subdirectory of a git repo, so shipping this SDK to external consumers requires
extra work: either publishing to npm under a real scope, or distributing
packed tarballs. That will be wired up when the first consumer needs it; for
now the generated code sits in the repo as a starting point and is kept in
sync with the OpenAPI spec by `make sdk-ts`.

### Consuming the Python SDK (uv / pip)

The Python SDK is a standard PEP 621 package rooted at `sdks/python/`. uv and
pip can install it directly from this repo using the `subdirectory` fragment:

```bash
# Add it to a uv-managed project
uv add "git+https://github.com/alainrk/pago.git#subdirectory=sdks/python"

# Or one-off into the current environment
uv pip install "git+https://github.com/alainrk/pago.git#subdirectory=sdks/python"

# Plain pip works too
pip install "git+https://github.com/alainrk/pago.git#subdirectory=sdks/python"
```

To pin to a specific commit or tag, append `@<ref>` before the `#`:

```bash
uv add "git+https://github.com/alainrk/pago.git@v0.1.0#subdirectory=sdks/python"
```

Usage:

```python
import pago_sdk
from pago_sdk.api.transactions_api import TransactionsApi

cfg = pago_sdk.Configuration(
    host="http://localhost:8091/web",
    access_token="pago_...",
)
with pago_sdk.ApiClient(cfg) as client:
    stats = TransactionsApi(client).api_stats_get(month="2026-05")
    print(stats)
```

### Consuming the Go SDK

The Go SDK is a Go submodule rooted at `sdks/go/`. Its module path matches its
on-disk location, so it is `go get`-able directly from this repo:

```bash
go get github.com/alainrk/pago/sdks/go@latest
```

```go
import (
    "context"
    pago "github.com/alainrk/pago/sdks/go"
)

func main() {
    cfg := pago.NewConfiguration()
    cfg.Servers = pago.ServerConfigurations{{URL: "http://localhost:8091/web"}}
    cfg.DefaultHeader["Authorization"] = "Bearer pago_..."
    client := pago.NewAPIClient(cfg)

    stats, _, err := client.TransactionsAPI.
        ApiStatsGet(context.Background()).
        Month("2026-05").
        Execute()
    _ = stats; _ = err
}
```

**Versioning.** Because the SDK lives in a subdirectory, Go expects git tags to
be **prefixed with the subdirectory path** when you cut releases:

```bash
git tag sdks/go/v0.1.0
git push origin sdks/go/v0.1.0
```

Consumers then pin via:

```bash
go get github.com/alainrk/pago/sdks/go@v0.1.0
```

Until a `sdks/go/vX.Y.Z` tag exists, `@latest` resolves to a pseudo-version
synthesized from the commit (`v0.0.0-<timestamp>-<sha>`). That works for early
adopters but isn't a stable release.

## Testing

```bash
# Run all tests
make test

# Run tests with coverage
make test-coverage

# Run tests in CI mode
make test-ci

# Run security checks
make sec
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
