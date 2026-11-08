// Command telegram-farewell sends one last Telegram message to every user of
// the old Pago bot, telling them the new address, and can then remove the
// bot's webhook. It is a one-off tool for switching the bot off.
//
// It is a dry run unless -send is given: it only prints how many people it
// would message and the text.
//
//	go run ./cmd/telegram-farewell -env .prod-migration.env -url https://pago.faccio.app
//	go run ./cmd/telegram-farewell -env .prod-migration.env -url https://pago.faccio.app -send
//	go run ./cmd/telegram-farewell -env .prod-migration.env -delete-webhook -send
//
// Needs DATABASE_URL and, with -send, TELEGRAM_BOT_API_TOKEN.
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"pago/internal/db"

	gotgbot "github.com/PaulSonOfLars/gotgbot/v2"
	"github.com/joho/godotenv"
)

func message(url string) string {
	return "Pago is now a web app only, and this Telegram bot is being switched off.\n\n" +
		"Your account and all your transactions are safe. Open " + url + " and sign in with Google. " +
		"If your Google email is different from the one in Pago, first open the old Pago web app and " +
		"press \"Open the new address\" there, so we can link your account.\n\n" +
		"Then create a passkey in Settings for quick sign-in.\n\n" +
		"Questions? Write to info@faccio.app"
}

func main() {
	var (
		envFile       string
		url           string
		send          bool
		deleteWebhook bool
	)
	flag.StringVar(&envFile, "env", ".env", "env file with DATABASE_URL and TELEGRAM_BOT_API_TOKEN")
	flag.StringVar(&url, "url", "", "new address to tell people, for example https://pago.faccio.app")
	flag.BoolVar(&send, "send", false, "really send (without it, this is a dry run)")
	flag.BoolVar(&deleteWebhook, "delete-webhook", false, "remove the bot webhook instead of sending messages")
	flag.Parse()

	if err := godotenv.Load(envFile); err != nil {
		log.Printf("Could not load %s: %v (using the current environment)", envFile, err)
	}

	var bot *gotgbot.Bot
	if send {
		token := os.Getenv("TELEGRAM_BOT_API_TOKEN")
		if token == "" {
			log.Fatal("TELEGRAM_BOT_API_TOKEN is empty")
		}
		var err error
		bot, err = gotgbot.NewBot(token, nil)
		if err != nil {
			log.Fatalf("Could not start the bot client: %v", err)
		}
	}

	if deleteWebhook {
		if !send {
			fmt.Println("Dry run: would delete the bot webhook (and drop pending updates). Add -send to do it.")
			return
		}
		ok, err := bot.DeleteWebhook(&gotgbot.DeleteWebhookOpts{DropPendingUpdates: true})
		if err != nil || !ok {
			log.Fatalf("Delete webhook failed: %v", err)
		}
		fmt.Println("Webhook deleted.")
		return
	}

	url = strings.TrimRight(strings.TrimSpace(url), "/")
	if !strings.HasPrefix(url, "https://") {
		log.Fatal("-url must be the new https address")
	}

	database, err := db.NewDB(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("Database: %v", err)
	}
	defer func() { _ = database.Close() }()

	users, err := database.ListTelegramUsers()
	if err != nil {
		log.Fatalf("Could not list users: %v", err)
	}

	text := message(url)
	fmt.Printf("Message:\n---\n%s\n---\n", text)
	if !send {
		fmt.Printf("Dry run: would message %d Telegram users. Add -send to send.\n", len(users))
		return
	}

	sent, failed := 0, 0
	for _, u := range users {
		if _, err := bot.SendMessage(u.TgID, text, nil); err != nil {
			// Usually the person blocked the bot or deleted their account.
			failed++
			fmt.Printf("account %d: not sent (%v)\n", u.TgID, err)
		} else {
			sent++
		}
		time.Sleep(100 * time.Millisecond) // stay far below Telegram's limits
	}
	fmt.Printf("Done: %d sent, %d not sent.\n", sent, failed)
}
