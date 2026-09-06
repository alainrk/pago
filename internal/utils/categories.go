package utils

import (
	"pago/internal/model"
	"regexp"
	"strings"
)

// GetCategoryEmoji returns the appropriate emoji for a transaction category
func GetCategoryEmoji(category model.TransactionCategory) string {
	emojiMap := map[model.TransactionCategory]string{
		model.CategorySalary:        "💵",
		model.CategoryOtherIncomes:  "💵",
		model.CategoryCar:           "🚗",
		model.CategoryClothes:       "👕",
		model.CategoryGrocery:       "🛒",
		model.CategoryHouse:         "🏠",
		model.CategoryBills:         "📄",
		model.CategoryEntertainment: "🎭",
		model.CategorySport:         "🏋️",
		model.CategoryEatingOut:     "🍽️",
		model.CategoryTransport:     "🚆",
		model.CategoryLearning:      "📚",
		model.CategoryToiletry:      "🚿",
		model.CategoryHealth:        "🏥",
		model.CategoryTech:          "💻",
		model.CategoryGifts:         "🎁",
		model.CategoryTravel:        "✈️",
		model.CategoryPets:          "🐈",
		model.CategoryOtherExpenses: "📌",
	}

	if emoji, ok := emojiMap[category]; ok {
		return emoji
	}
	return "📌" // Default emoji
}

// IsAnIncomeTransactionPrompt returns true if the transaction category could be an income category
func IsAnIncomeTransactionPrompt(text string) bool {
	incomeWords := []string{"income", "salary", "income", "tip", "stipend", "gratuity", "paycheck", "pay", "earning", "dividend", "payslip", "reward", "refund"}

	pattern := `\b(?i:` + strings.Join(incomeWords, "|") + `)\b`

	matched, err := regexp.MatchString(pattern, strings.ToLower(text))
	if err != nil {
		return false
	}

	return matched
}
