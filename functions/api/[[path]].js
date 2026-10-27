/** Same-origin /api/* → VPS (браузер не ходит на sslip напрямую). */
/** Только 443: Workers не ходят на произвольные порты вроде 8787. */
const ORIGIN = "https://157.22.204.47.sslip.io";

export async function onRequest(context) {
  const incoming = new URL(context.request.url);
  const target = new URL(
    incoming.pathname + incoming.search,
    ORIGIN,
  );
  try {
    return await fetch(
      new Request(target.toString(), context.request),
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: "Сервер временно недоступен, нажми ещё раз через пару секунд",
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }
}
