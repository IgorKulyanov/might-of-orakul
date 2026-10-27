/** Same-origin /api/* → VPS (браузер не ходит на sslip напрямую). */
/** Только 443: Workers не ходят на произвольные порты вроде 8787. */
const ORIGIN = "https://157.22.204.47.sslip.io";

export async function onRequest(context) {
  const incoming = new URL(context.request.url);
  const target = new URL(
    incoming.pathname + incoming.search,
    ORIGIN,
  ).toString();

  // Тело POST можно прочитать один раз — клонируем запрос на каждую попытку.
  const raw = context.request;
  const bodyBuf =
    raw.method !== "GET" && raw.method !== "HEAD"
      ? await raw.arrayBuffer()
      : null;

  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const init = {
        method: raw.method,
        headers: raw.headers,
        redirect: raw.redirect,
      };
      if (bodyBuf) init.body = bodyBuf;
      const res = await fetch(target, init);
      // Кратковременный 502/504 nginx при рестарте API — ещё раз
      if (res.status >= 502 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
    }
  }

  return new Response(
    JSON.stringify({
      error:
        lastErr?.message?.includes("payment")
          ? "Оплата не ответила, нажми ещё раз"
          : "Сервер временно недоступен, нажми ещё раз через пару секунд",
    }),
    {
      status: 502,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    },
  );
}
