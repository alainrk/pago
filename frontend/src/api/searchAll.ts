import { transactions } from "./endpoints";
import type { SearchTransactionsRequest, TransactionDTO } from "./types";

// searchAll pages through the search endpoint (200 a page, at most 5 pages)
// and returns every matching transaction plus the server-side total.
export async function searchAll(filter: SearchTransactionsRequest, signal: AbortSignal): Promise<{ all: TransactionDTO[]; total: number }> {
  let all: TransactionDTO[] = [];
  let total = 0;
  let offset = 0;
  const limit = 200;
  for (let page = 0; page < 5; page++) {
    const res = await transactions.search({ ...filter, offset, limit }, signal);
    all = all.concat(res.transactions);
    total = res.total;
    offset += limit;
    if (offset >= total || res.transactions.length === 0) break;
  }
  return { all, total };
}
