/** Same-origin /ws/* (чат, PvP) → VPS WebSocket.
 * Клиент на pages.dev теперь предпочитает прямой wss://…sslip.io
 * (этот прокси оставляем запасным). Только 443. */
const ORIGIN = "https://157.22.204.47.sslip.io";

export async function onRequest(context) {
  const incoming = new URL(context.request.url);
  const target = new URL(incoming.pathname + incoming.search, ORIGIN);
  // Не клонируем Request вручную — иначе Upgrade/WebSocket ломается.
  return fetch(target.toString(), context.request);
}
