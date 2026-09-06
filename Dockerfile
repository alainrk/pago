# Build stage
FROM golang:1.26-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git make

# Set working directory
WORKDIR /app

# Copy go mod and sum files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy the source code
COPY . .

# Build the Telegram bot
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o pago \
    ./cmd/server/main.go

# Build the migration tool
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o migrate \
    ./cmd/migrate/main.go

# Final stage
FROM alpine:latest

# Install ca-certificates for HTTPS
RUN apk --no-cache add ca-certificates tzdata

# Create non-root user
RUN addgroup -g 1000 -S pago && \
    adduser -u 1000 -S pago -G pago

# Set working directory
WORKDIR /app

# Copy binaries from builder
COPY --from=builder /app/pago /app/pago
COPY --from=builder /app/migrate /app/migrate

# Change ownership
RUN chown -R pago:pago /app

# Switch to non-root user
USER pago

# Expose ports: 8080 (webhook), 8082 (health)
EXPOSE 8080 8082

# Set entrypoint
ENTRYPOINT ["/app/pago"]