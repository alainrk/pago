// Helpers for running one build on more than one hostname, for example while
// the app moves to a new domain. Everything is driven by build-time env:
//
//   VITE_API_URL           default API origin
//   VITE_API_URL_BY_HOST   "app.old.example=https://api.old.example,..."
//                          API origin to use when the page is opened on that
//                          host (the session cookie only works when the app
//                          and the API share a parent domain)
//   VITE_MOVED_FROM_HOSTS  "app.old.example,..." hosts that show the
//                          "we moved" banner
//   VITE_MOVED_TO_URL      "https://app.new.example" where the banner sends
//                          people
//   VITE_MOVED_BY_DATE     optional, shown in the banner ("1 March")

function trimSlash(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function normHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

// parseHostMap reads "host=url,host2=url2". Bad entries are skipped.
export function parseHostMap(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (raw ?? "").split(",")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const host = normHost(part.slice(0, i));
    const url = trimSlash(part.slice(i + 1));
    if (host && url) out[host] = url;
  }
  return out;
}

// parseHostList reads "host,host2".
export function parseHostList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map(normHost)
    .filter(Boolean);
}

// pickApiBase returns the API origin for the page host: the per-host entry
// when there is one, otherwise the default.
export function pickApiBase(host: string, defaultUrl: string | undefined, byHostRaw: string | undefined): string {
  const byHost = parseHostMap(byHostRaw);
  return byHost[normHost(host)] ?? trimSlash(defaultUrl ?? "");
}

// movedTarget returns the same page on the new address when the current host
// is one of the old ones, or null when there is nothing to show.
export function movedTarget(
  host: string,
  fromHostsRaw: string | undefined,
  toUrl: string | undefined,
  pathAndQuery: string,
): string | null {
  const target = trimSlash(toUrl ?? "");
  if (!target) return null;
  if (!parseHostList(fromHostsRaw).includes(normHost(host))) return null;
  const path = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  return `${target}${path}`;
}

// allApiOrigins lists every API origin a build may call, for the CSP.
export function allApiOrigins(defaultUrl: string | undefined, byHostRaw: string | undefined): string[] {
  const urls = [defaultUrl ?? "", ...Object.values(parseHostMap(byHostRaw))];
  const origins = new Set<string>();
  for (const u of urls) {
    if (!u.trim()) continue;
    try {
      origins.add(new URL(u.trim()).origin);
    } catch {
      // Not a URL, leave it out of the CSP.
    }
  }
  return [...origins];
}
