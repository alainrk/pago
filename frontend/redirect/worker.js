// The old pago address after the move to faccio.app: every request gets a
// permanent redirect to the same path and query on the new address. Keep it
// for at least 12 months so old bookmarks and links keep working.
const NEW_ORIGIN = "https://pago.faccio.app";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    return Response.redirect(NEW_ORIGIN + url.pathname + url.search, 301);
  },
};
