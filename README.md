# Pago

**Web app** for Income and Expense Management, with AI help.

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

Pago is a web app for tracking income and expenses, with AI help: type a
transaction in plain words and it fills in the details for you. (Pago used to
be a Telegram bot too. The bot is gone; your data from it is all in the web
app.)

### AI-Powered Transaction Processing

- **Plain words**: type "irish pub 4.50 yesterday" and review the parsed fields before saving.
- **Smart Categorization**: Automatically assigns the right category based on your description.
- **Duplicate Detection**: Warns when a new transaction looks like a recent one already saved.
- **Flexible Date Recognition**: Understands various date formats (dd/mm, dd-mm-yyyy, "yesterday", etc.).
- **Multi-language Support**: Works with transaction descriptions in any language.

### Transaction Management

- **Quick Entry**: Add expenses and income in one line.
- **Inline Editing**: Change amount, category, description or date.
- **Recurring transactions**: rent, subscriptions or salary, added each month.
- **Transaction Types**: Track both expenses (17 categories) and income (2 categories).
- **Search and Full Listing**: Find transactions by full text search and category.
- **Export Functionality**: Download all your transactions as CSV files.

### Financial Insights

- **Weekly Recap**: Get detailed breakdowns of your current week's spending.
- **Monthly Summary**: View month-by-month financial performance with category breakdowns.
- **Yearly Overview**: See annual trends and top spending categories.
- **Balance Tracking**: Instant calculation of income vs expenses for any period.
- **Category Analysis**: Understand where your money goes with percentage breakdowns.

### Monthly Budget

- **One Monthly Limit**: Set a total spending limit that applies to every month, from Settings.

### Web App

- **Responsive SPA** (`frontend/`): desktop sidebar layout and a mobile layout with bottom tabs.
- **AI quick add**: type "irish pub 12.50 yesterday", review the parsed fields, confirm. Warns about likely duplicates.
- **Sign-in**:
  - Google sign-in. It is also the only way to create an account.
  - Passkeys (WebAuthn), discoverable: "Sign in with a passkey" needs nothing else.
  - Nothing else: the old email and Telegram login codes were removed.
- **Quick entry consent**: the AI quick entry sends the typed text to
  DeepSeek (China). The app asks before the first use and stores the choice
  on the server with the privacy policy version; the server refuses
  `/web/api/transactions/parse` without it. Settings has a switch.
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

### Technical Features

- **Database Migrations**: Version-controlled schema management
- **Development Tools**: Built-in database seeder for testing.
- **Configurable Access**: Optional `ALLOWED_EMAILS` list of who can create an account.

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
DATABASE_URL='postgres://postgres:postgres@localhost:5433/postgres'
OPENAI_API_KEY='sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
OPENAI_BASE_URL='https://api.deepseek.com/v1'
LLM_MODEL='deepseek-v4-flash'
LLM_DISABLE_THINKING='true'
LOG_LEVEL='info'
# Seed purpose - set the account id (users.tg_id) to seed transactions for
SEED_USER_TG_ID=''
# Web server (API and legacy dashboard)
WEB_HOST=127.0.0.1
WEB_PORT=8091
SESSION_SECRET='your-random-session-secret-here'
SESSION_DURATION_MIN=43200
# Browser app served from another origin (see "Web App" below)
WEB_CORS_ORIGINS='http://localhost:5174'
WEB_COOKIE_SAMESITE='lax'
# Passkeys. RP ID is the domain, RP origin is the exact frontend origin
WEBAUTHN_RP_ID='localhost'
WEBAUTHN_RP_ORIGIN='http://localhost:5174'
# Google sign-in (paired lists, one entry per API host)
GOOGLE_CLIENT_ID=''
GOOGLE_CLIENT_SECRET=''
GOOGLE_REDIRECT_URL='http://localhost:5174/web/auth/google/callback'
ALLOWED_EMAILS=''
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

### Database Seeding

The Dev DB Seeder generates test transaction data for development. The user
must already exist: sign in once with Google, then use the `tg_id` of your row
in the `users` table (accounts made with Google have a negative id).

```bash
# Set the account id you want to seed data for (or put it in .env)
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
- Leave budgets untouched. Create those from the web app.

## Deployment

### Docker Images

The repo ships one image:

- `Dockerfile.web` builds the web server (`/app/pago-web`). It serves the API
  and the legacy dashboard on 8081 (set `WEB_HOST=0.0.0.0` and `WEB_PORT=8081`),
  and runs the monthly recurring transactions.

```bash
docker build -t pago-web -f Dockerfile.web .
```

Run it behind a reverse proxy that terminates TLS and sends `/web/*` to the web
server. Migrations are not run by the image: run
`go run ./cmd/migrate/main.go -command up` against the database before the
first start and after each upgrade.

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

- **Google**: the only way to create an account. Existing accounts are found
  by Google account id, then by verified email.
- **Passkeys**: create one in Settings (or right after the first Google
  sign-in). "Sign in with a passkey" then needs nothing else.

### App Features

1. **Access**: Open `http://localhost:5174` in development (`make fe/dev`) or the
   domain where you deployed `frontend/`. The older server-rendered dashboard is
   still available from the Go web server at `http://localhost:8091/web/dashboard`.
   It has no sign-in page of its own: `/web/login` sends you to the web app
   (the first `WEB_CORS_ORIGINS` entry), and the session from there works on
   the dashboard too.
2. **Login**: Choose your preferred authentication method.
3. **Dashboard**: View your financial data with month navigation.
4. **Statistics**: See real-time balance, income, expenses, and transaction counts.
5. **Transactions**:
   - Add new transactions directly from the web interface, with AI quick add.
   - Browse detailed transaction history with search and filtering.
   - View transactions by category.
6. **Settings**: Set the monthly budget, register and delete passkeys, export
   your data as CSV.

## HTTP API

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

# Then in psql, replace <tg_id> with the target account id (users.tg_id):
# INSERT INTO api_tokens (tg_id, name, token_hash, prefix)
#   VALUES (<tg_id>, 'my-cli', '<HASH>', substring('<TOKEN>' from 1 for 8));
```

Optional `expires_at` is supported; leave NULL for non-expiring tokens.

### Calling the API

```bash
curl -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8091/web/api/stats?month=2026-05"
```

### OpenAPI spec

The spec lives at `api/swagger.{yaml,json}` and is generated from `swaggo/swag`
annotations on the handlers.

```bash
make openapi        # regenerate the spec
```

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
