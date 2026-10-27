/** Same-origin /ws/* (чат, PvP) → VPS WebSocket. */
const ORIGIN = "http://157.22.204.47:8787";

export async function onRequest(context) {
  const incoming = new URL(context.request.url);
  const target = new URL(
    incoming.pathname + incoming.search,
    ORIGIN,
  );
  return fetch(new Request(target.toString(), context.request));
}
