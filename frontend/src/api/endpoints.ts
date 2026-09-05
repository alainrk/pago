import { request, requestBlob } from "./client";
import type {
  BudgetResponse,
  CreateTransactionRequest,
  DuplicateCheckResponse,
  EditTransactionRequest,
  MeResponse,
  MessageResponse,
  MonthlyAnalyticsResponse,
  ParseTransactionResponse,
  PasskeyInfo,
  SearchTransactionsRequest,
  SearchTransactionsResponse,
  StatsResponse,
  TransactionDTO,
  TransactionType,
  TrendResponse,
  YearAnalyticsResponse,
} from "./types";

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// Auth (public)
export const auth = {
  requestCode: (username: string) =>
    request<MessageResponse>("/auth/request", { method: "POST", body: { username } }),
  verifyCode: (code: string) =>
    request<MessageResponse & { redirect?: string }>("/auth/verify", { method: "POST", body: { code } }),
  logout: () => request<MessageResponse>("/logout", { method: "POST" }),
  passkeyBeginLogin: (email?: string, signal?: AbortSignal) =>
    request<{ options: { publicKey: Record<string, unknown> } }>("/auth/passkey/begin-login", {
      method: "POST",
      body: { email: email ?? "" },
      signal,
    }),
  passkeyFinishLogin: (assertion: unknown) =>
    request<MessageResponse>("/auth/passkey/finish-login", { method: "POST", body: assertion }),
};

// Account
export const account = {
  me: (signal?: AbortSignal) => request<MeResponse>("/api/me", { signal }),
  passkeys: () => request<{ passkeys: PasskeyInfo[] }>("/api/passkey/list"),
  passkeyBeginRegister: () =>
    request<{ options: { publicKey: Record<string, unknown> } }>("/api/passkey/begin-register", {
      method: "POST",
      body: {},
    }),
  passkeyFinishRegister: (credential: unknown, name: string) =>
    request<MessageResponse>("/api/passkey/finish-register", {
      method: "POST",
      body: credential,
      headers: name ? { "X-Credential-Name": name } : {},
    }),
  passkeyDelete: (credentialId: string) =>
    request<MessageResponse>("/api/passkey/delete", { method: "POST", body: { credentialId } }),
  exportCsv: () => requestBlob("/api/transactions/export"),
};

// Transactions
export const transactions = {
  search: (req: SearchTransactionsRequest, signal?: AbortSignal) =>
    request<SearchTransactionsResponse>("/api/transactions/search", { method: "POST", body: req, signal }),
  create: (req: CreateTransactionRequest) =>
    request<MessageResponse>("/api/transactions/create", { method: "POST", body: req }),
  edit: (req: EditTransactionRequest) =>
    request<TransactionDTO>("/api/transactions/edit", { method: "PATCH", body: req }),
  remove: (id: number) =>
    request<MessageResponse>("/api/transactions/delete", { method: "DELETE", body: { id } }),
  clone: (id: number) => request<TransactionDTO>("/api/transactions/clone", { method: "POST", body: { id } }),
  categories: (type: TransactionType) => request<{ categories: string[] }>(`/api/categories${qs({ type })}`),
  parse: (text: string, signal?: AbortSignal) =>
    request<ParseTransactionResponse>("/api/transactions/parse", { method: "POST", body: { text }, signal }),
  duplicates: (description: string, amount: number, date: string, signal?: AbortSignal) =>
    request<DuplicateCheckResponse>("/api/transactions/duplicates", {
      method: "POST",
      body: { description, amount, date },
      signal,
    }),
};

// Stats and analytics
export const stats = {
  month: (month: string, signal?: AbortSignal) => request<StatsResponse>(`/api/stats${qs({ month })}`, { signal }),
};

export const budget = {
  get: (signal?: AbortSignal) => request<BudgetResponse>("/api/budget", { signal }),
  save: (amount: number) => request<BudgetResponse>("/api/budget", { method: "POST", body: { amount } }),
  remove: () => request<BudgetResponse>("/api/budget", { method: "DELETE" }),
};

export const analytics = {
  monthly: (month: string, signal?: AbortSignal) =>
    request<MonthlyAnalyticsResponse>(`/api/analytics/monthly${qs({ month })}`, { signal }),
  trend: (months: number, signal?: AbortSignal) =>
    request<TrendResponse>(`/api/analytics/trend${qs({ months })}`, { signal }),
  year: (year: number, signal?: AbortSignal) =>
    request<YearAnalyticsResponse>(`/api/analytics/year${qs({ year })}`, { signal }),
};
