// Small fetch wrapper for the Cashout API.
//
// The API lives under /web on the Go server. In development the Vite proxy
// forwards /web to the local backend so VITE_API_URL stays empty. In
// production VITE_API_URL points at the API origin and requests are
// cross-origin with cookies (credentials: "include").

const rawBase = (import.meta.env.VITE_API_URL ?? "").trim();
export const API_BASE_URL = rawBase.replace(/\/+$/, "");
export const WEB_PATH = "/web";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${WEB_PATH}${path}`;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.error || data.message || res.statusText || "Request failed";
  } catch {
    return res.statusText || "Request failed";
  }
}

// request sends JSON and parses JSON. Errors from the server become ApiError
// so callers can branch on status (401 means the session is gone).
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: opts.method ?? "GET",
      headers,
      body,
      credentials: "include",
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "Network error. Check your connection and try again.");
  }

  if (!res.ok) {
    throw new ApiError(res.status, await readError(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// requestBlob fetches a file (used by the CSV export) with cookies attached.
export async function requestBlob(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const res = await fetch(apiUrl(path), { credentials: "include" });
  if (!res.ok) {
    throw new ApiError(res.status, await readError(res));
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return { blob: await res.blob(), filename: match ? decodeURIComponent(match[1]) : null };
}
