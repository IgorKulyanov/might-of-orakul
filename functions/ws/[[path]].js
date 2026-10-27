/** Same-origin /ws/* (чат, PvP) → VPS WebSocket. */
/** Только 443: Workers не ходят на произвольные порты вроде 8787. */
const ORIGIN = "https://157.22.204.47.sslip.io";

export async function onRequest(context) {
  const incoming = new URL(context.request.url);
  const target = new URL(
    incoming.pathname + incoming.search,
    ORIGIN,
  );
  return fetch(new Request(target.toString(), context.request));
}
