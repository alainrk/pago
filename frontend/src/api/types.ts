// Types mirror the Go DTOs in internal/web/dto.go and friends.

export type TransactionType = "Income" | "Expense";

export interface TransactionDTO {
  id: number;
  date: string; // RFC3339 from the server
  category: string;
  description: string;
  amount: number;
  type: TransactionType;
}

export interface TransactionsResponse {
  transactions: TransactionDTO[];
  count: number;
}

export interface SearchTransactionsRequest {
  query?: string;
  category?: string;
  type?: TransactionType | "";
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  amountMin?: number;
  amountMax?: number;
  offset?: number;
  limit?: number;
}

export interface SearchTransactionsResponse {
  transactions: TransactionDTO[];
  total: number;
  offset: number;
  limit: number;
}

export interface CreateTransactionRequest {
  type: TransactionType;
  category: string;
  amount: number;
  description: string;
  date: string; // YYYY-MM-DD
}

export interface EditTransactionRequest {
  id: number;
  category?: string;
  amount?: number;
  description?: string;
  date?: string; // YYYY-MM-DD
}

export interface StatsResponse {
  balance: number;
  totalIncome: number;
  totalExpenses: number;
  totalTransactions: number;
}

export interface BudgetResponse {
  hasBudget: boolean;
  amount?: number;
  currency?: string;
  spent?: number;
  pct?: number;
  month?: string; // YYYY-MM
}

export interface CategoryEntry {
  category: string;
  amount: number;
  count: number;
  pct: number;
}

export interface CategoryBreakdown {
  Expense: CategoryEntry[] | null;
  Income: CategoryEntry[] | null;
}

export interface MonthlyAnalyticsResponse {
  month: string;
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  byCategory: CategoryBreakdown;
}

export interface MonthPoint {
  month: string; // YYYY-MM
  income: number;
  expense: number;
  balance: number;
}

export interface TrendResponse {
  from: string;
  to: string;
  points: MonthPoint[];
}

export interface YearMonthEntry {
  month: number; // 1..12
  income: number;
  expense: number;
  balance: number;
}

export interface YearAnalyticsResponse {
  year: number;
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  byMonth: YearMonthEntry[];
  byCategory: CategoryBreakdown;
}

export interface MeResponse {
  name: string;
  username: string;
  email?: string;
  initials: string;
  hasEmail: boolean;
  currency: string;
}

export interface ParseTransactionResponse {
  type: TransactionType;
  category: string;
  amount: number;
  description: string;
  date: string; // YYYY-MM-DD
  duplicates: TransactionDTO[];
}

export interface DuplicateCheckResponse {
  duplicates: TransactionDTO[];
}

export interface PasskeyInfo {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface MessageResponse {
  message: string;
}
