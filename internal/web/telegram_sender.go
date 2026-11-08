package web

import (
	gotgbot "github.com/PaulSonOfLars/gotgbot/v2"
)

// TelegramSender sends one Telegram message. The web server only uses it for
// the legacy Telegram login code on the old address, during the move. It
// calls the Bot API directly; the old bot program is not needed.
type TelegramSender interface {
	SendHTML(chatID int64, text string) error
}

// NewTelegramSender returns a sender for the bot token, or nil when the
// token is empty (Telegram codes are then off).
func NewTelegramSender(token string) (TelegramSender, error) {
	if token == "" {
		return nil, nil
	}
	bot, err := gotgbot.NewBot(token, &gotgbot.BotOpts{DisableTokenCheck: true})
	if err != nil {
		return nil, err
	}
	return botSender{bot: bot}, nil
}

type botSender struct {
	bot *gotgbot.Bot
}

func (b botSender) SendHTML(chatID int64, text string) error {
	_, err := b.bot.SendMessage(chatID, text, &gotgbot.SendMessageOpts{ParseMode: "HTML"})
	return err
}
