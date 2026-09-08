// returnPath builds the URL to come back to after login. It keeps the query
// string and hash so deep links such as "/?text=pizza 12" survive the redirect.
export function returnPath(location: { pathname: string; search?: string; hash?: string }): string {
  return `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`;
}
