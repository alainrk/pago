package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"pago/internal/model"
	"pago/internal/utils"

	"github.com/sirupsen/logrus"
)

const (
	llmRequestTimeout = 60 * time.Second

	// Budgets are generous on purpose: reasoning models bill their thinking
	// tokens against max_tokens and truncate the answer when it runs out.
	extractionMaxTokens     = 2000
	classificationMaxTokens = 1000
)

type LLM struct {
	APIKey   string
	Endpoint string
	Model    string
	Logger   *logrus.Logger

	// DisableThinking asks the provider to skip the reasoning phase. Reasoning
	// models spend the completion budget on thinking tokens and can return an
	// empty or truncated answer, which is useless for our JSON-only prompts.
	// Only sent when true, so providers that don't know the field are unaffected.
	DisableThinking bool
}

type ExtractedTransaction struct {
	Type        model.TransactionType
	Description string
	Amount      float64
	Category    string
	Date        time.Time
}

// Intent represents the classified user intent
type Intent string

// Intent constants
const (
	IntentAddExpense Intent = "add_expense"
	IntentAddIncome  Intent = "add_income"
	IntentEdit       Intent = "edit"
	IntentDelete     Intent = "delete"
	IntentSearch     Intent = "search"
	IntentList       Intent = "list"
	IntentWeekRecap  Intent = "week_recap"
	IntentMonthRecap Intent = "month_recap"
	IntentYearRecap  Intent = "year_recap"
	IntentExport     Intent = "export"
	IntentClone      Intent = "clone"
	IntentUnknown    Intent = "unknown"
)

// ClassifiedIntent holds the result of intent classification
type ClassifiedIntent struct {
	Intent     Intent  `json:"intent"`
	Confidence float64 `json:"confidence"`
}

// chatCompletion sends a single-turn prompt to the OpenAI-compatible endpoint
// and returns the assistant message content.
func (llm *LLM) chatCompletion(prompt string, maxTokens int) (string, error) {
	payload := map[string]any{
		"model": llm.Model,
		"messages": []map[string]string{
			{
				"role":    "user",
				"content": prompt,
			},
		},
		"max_tokens": maxTokens,
	}
	if llm.DisableThinking {
		payload["thinking"] = map[string]string{"type": "disabled"}
	}

	requestBody, err := json.Marshal(payload)
	if err != nil {
		llm.Logger.Errorf("Error creating request body: %v\n", err)
		return "", err
	}

	req, err := http.NewRequest("POST", llm.Endpoint, bytes.NewBuffer(requestBody))
	if err != nil {
		llm.Logger.Errorf("Error creating request: %v\n", err)
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+llm.APIKey)

	client := &http.Client{Timeout: llmRequestTimeout}
	resp, err := client.Do(req)
	if err != nil {
		llm.Logger.Errorf("Error sending request: %v\n", err)
		return "", err
	}
	defer func() {
		if cerr := resp.Body.Close(); cerr != nil {
			llm.Logger.Errorf("Error closing response body: %v\n", cerr)
		}
	}()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		llm.Logger.Errorf("Error reading response: %v\n", err)
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		llm.Logger.Errorf("LLM API returned status %d: %s\n", resp.StatusCode, string(body))
		return "", fmt.Errorf("llm api status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Choices []struct {
			FinishReason string `json:"finish_reason"`
			Message      struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		llm.Logger.Errorf("Error parsing response: %v, raw response: %s\n", err, string(body))
		return "", err
	}

	if len(result.Choices) == 0 {
		llm.Logger.Errorf("No choices in LLM response, raw response: %s\n", string(body))
		return "", fmt.Errorf("invalid response format")
	}

	content := result.Choices[0].Message.Content
	if content == "" {
		llm.Logger.Errorf("Empty content in LLM response (finish_reason: %s), raw response: %s\n",
			result.Choices[0].FinishReason, string(body))
		return "", fmt.Errorf("empty llm response (finish_reason: %s)", result.Choices[0].FinishReason)
	}

	return content, nil
}

// extractJSONObject trims anything surrounding the outermost JSON object, since
// the llm sometimes wraps the answer in ```json``` markdown despite being asked not to.
func extractJSONObject(content string) string {
	start := 0
	end := len(content)
	// Start parsing char by char until a "{" is found
	for i, char := range content {
		if char == '{' {
			start = i
			break
		}
	}
	// Starting from the end do the same until a "}" is found
	for i := len(content) - 1; i >= 0; i-- {
		if content[i] == '}' {
			end = i + 1
			break
		}
	}
	if start >= end {
		return content
	}
	return content[start:end]
}

func (llm *LLM) ExtractTransaction(userText string, transactionType model.TransactionType) (ExtractedTransaction, error) {
	transaction := ExtractedTransaction{
		Type: transactionType,
	}

	tmpl := LLMExpensePromptTemplate
	if transactionType == model.TypeIncome {
		tmpl = LLMIncomePromptTemplate
	}

	// Generate prompt using the template
	prompt, err := GeneratePrompt(userText, tmpl)
	if err != nil {
		llm.Logger.Errorf("Error generating prompt: %v\n", err)
		return transaction, err
	}

	content, err := llm.chatCompletion(prompt, extractionMaxTokens)
	if err != nil {
		return transaction, err
	}
	llm.Logger.Debugln("LLM Message", content)

	content = extractJSONObject(content)

	// ExtractExpense from the LLM Response text
	// Parse the LLM JSON response
	var transactionData map[string]any
	if err := json.Unmarshal([]byte(content), &transactionData); err != nil {
		llm.Logger.Errorln("Error parsing LLM response as JSON", err)
		return transaction, err
	}

	// Extract fields
	if description, ok := transactionData["description"].(string); ok {
		transaction.Description = description
	}

	if amount, ok := transactionData["amount"].(float64); ok {
		transaction.Amount = amount
	}

	if category, ok := transactionData["category"].(string); ok {
		transaction.Category = category
	}

	transaction.Date = time.Now()
	if date, ok := transactionData["date"].(string); ok {
		transaction.Date, err = utils.ParseDate(date)
		if err != nil {
			transaction.Date = time.Now()
		}
	}

	return transaction, nil
}

// ClassifyIntent classifies the user's intent from their message
func (llm *LLM) ClassifyIntent(userText string) (ClassifiedIntent, error) {
	result := ClassifiedIntent{
		Intent:     IntentUnknown,
		Confidence: 0,
	}

	// Generate prompt using the template
	prompt, err := GeneratePrompt(userText, LLMIntentClassificationPromptTemplate)
	if err != nil {
		llm.Logger.Errorf("Error generating intent classification prompt: %v\n", err)
		return result, err
	}

	content, err := llm.chatCompletion(prompt, classificationMaxTokens)
	if err != nil {
		return result, err
	}
	llm.Logger.Debugln("LLM Intent Classification Message", content)

	content = extractJSONObject(content)

	// Parse the JSON response
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		llm.Logger.Errorln("Error parsing intent classification response as JSON", err)
		return result, err
	}

	// Validate the intent
	switch result.Intent {
	case IntentAddExpense, IntentAddIncome, IntentEdit, IntentDelete, IntentSearch,
		IntentList, IntentWeekRecap, IntentMonthRecap, IntentYearRecap, IntentExport, IntentClone:
		// Valid intent
	default:
		result.Intent = IntentUnknown
	}

	return result, nil
}
