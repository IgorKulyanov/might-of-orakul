/**
 * ЮKassa REST: покупка пакетов алмазов.
 * Env: YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY
 * Optional: YOOKASSA_RETURN_URL, YOOKASSA_SEND_RECEIPT=1
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuid } from "uuid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ORACUL_DATA_DIR
  ? path.resolve(process.env.ORACUL_DATA_DIR)
  : path.join(__dirname, "data");
const ORDERS_FILE = path.join(DATA_DIR, "payment-orders.json");

/** Серверная витрина — клиенту не доверяем. */
export const DIAMOND_PACKS_SERVER = {
  dia_60: {
    id: "dia_60",
    title: "Пакет искателя",
    diamonds: 60,
    amountRub: 99,
  },
  dia_180: {
    id: "dia_180",
    title: "Пакет воина",
    diamonds: 180,
    amountRub: 249,
  },
  dia_500: {
    id: "dia_500",
    title: "Пакет оракула",
    diamonds: 500,
    amountRub: 599,
  },
  dia_2000: {
    id: "dia_2000",
    title: "Пакет эпика",
    diamonds: 2000,
    amountRub: 1990,
  },
};

const YK_API = "https://api.yookassa.ru/v3";

function shopId() {
  return String(process.env.YOOKASSA_SHOP_ID || "").trim();
}

function secretKey() {
  return String(process.env.YOOKASSA_SECRET_KEY || "").trim();
}

export function isYookassaConfigured() {
  return shopId().length > 0 && secretKey().length >= 8;
}

function returnUrl() {
  return (
    String(process.env.YOOKASSA_RETURN_URL || "").trim() ||
    "https://might-of-orakul.pages.dev/?paid=1"
  );
}

function authHeader() {
  const token = Buffer.from(`${shopId()}:${secretKey()}`).toString("base64");
  return `Basic ${token}`;
}

function emptyStore() {
  return { orders: {}, byPaymentId: {} };
}

function loadStore() {
  try {
    if (!fs.existsSync(ORDERS_FILE)) return emptyStore();
    const raw = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
    if (!raw || typeof raw !== "object") return emptyStore();
    return {
      orders: raw.orders && typeof raw.orders === "object" ? raw.orders : {},
      byPaymentId:
        raw.byPaymentId && typeof raw.byPaymentId === "object"
          ? raw.byPaymentId
          : {},
    };
  } catch (e) {
    console.warn("[pay] load orders fail:", e.message);
    return emptyStore();
  }
}

function saveStore(store) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (e) {
    console.error("[pay] save orders fail:", e.message);
  }
}

async function ykRequest(method, pathName, body, idempotenceKey) {
  const headers = {
    Authorization: authHeader(),
    "Content-Type": "application/json",
  };
  if (idempotenceKey) {
    headers["Idempotence-Key"] = String(idempotenceKey).slice(0, 64);
  }
  let res;
  try {
    res = await fetch(`${YK_API}${pathName}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(25000),
    });
  } catch (e) {
    const timedOut =
      e?.name === "TimeoutError" ||
      e?.name === "AbortError" ||
      /aborted|timeout/i.test(String(e?.message || e));
    throw new Error(
      timedOut
        ? "ЮKassa долго не отвечает — нажми оплату ещё раз"
        : e?.message || "Нет связи с ЮKassa",
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.description || data?.message || `YooKassa ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * @param {{ withDb: Function, persistLiveDb: Function, flushPendingGrants: Function, rateLimitMiddleware: Function, auth: Function }} deps
 */
export function mountPaymentRoutes(app, deps) {
  const {
    withDb,
    persistLiveDb,
    flushPendingGrants,
    rateLimitMiddleware,
    auth,
  } = deps;

  app.get("/api/payments/packs", (_req, res) => {
    res.json({
      ok: true,
      configured: isYookassaConfigured(),
      packs: Object.values(DIAMOND_PACKS_SERVER).map((p) => ({
        id: p.id,
        title: p.title,
        diamonds: p.diamonds,
        amountRub: p.amountRub,
        priceLabel: `₽${p.amountRub}`,
      })),
    });
  });

  app.post(
    "/api/payments/create",
    auth,
    rateLimitMiddleware({
      name: "pay-create",
      maxN: 12,
      windowMs: 60_000,
      keyFn: (req) => `pay:${req.user?.id || "x"}`,
    }),
    async (req, res) => {
      try {
        if (!isYookassaConfigured()) {
          res.status(503).json({
            error:
              "Оплата временно недоступна (ЮKassa не настроена на сервере)",
          });
          return;
        }
        const packId = String(req.body?.packId || "").trim();
        const pack = DIAMOND_PACKS_SERVER[packId];
        if (!pack) {
          res.status(400).json({ error: "Неизвестный пакет" });
          return;
        }
        const orderId = uuid();
        const value = pack.amountRub.toFixed(2);
        const payload = {
          amount: { value, currency: "RUB" },
          capture: true,
          description: `Might of Orakul: ${pack.title} (${pack.diamonds}💎)`,
          confirmation: {
            type: "redirect",
            return_url: `${returnUrl()}${returnUrl().includes("?") ? "&" : "?"}order=${orderId}`,
          },
          metadata: {
            orderId,
            userId: req.user.id,
            login: req.user.login,
            packId: pack.id,
            diamonds: String(pack.diamonds),
          },
        };

        // Чек 54-ФЗ — если в кабинете включена фискализация и передали контакт
        if (process.env.YOOKASSA_SEND_RECEIPT === "1") {
          const email = String(req.body?.email || "")
            .trim()
            .slice(0, 120);
          const phone = String(req.body?.phone || "")
            .trim()
            .replace(/[^\d+]/g, "")
            .slice(0, 20);
          if (email || phone) {
            payload.receipt = {
              customer: {
                ...(email ? { email } : {}),
                ...(phone ? { phone } : {}),
              },
              items: [
                {
                  description: `${pack.title} (${pack.diamonds} алмазов)`.slice(
                    0,
                    128,
                  ),
                  quantity: "1.00",
                  amount: { value, currency: "RUB" },
                  vat_code: 1,
                  payment_mode: "full_payment",
                  payment_subject: "service",
                },
              ],
            };
          }
        }

        const payment = await ykRequest(
          "POST",
          "/payments",
          payload,
          orderId,
        );
        const confirmationUrl = payment?.confirmation?.confirmation_url;
        if (!confirmationUrl || !payment.id) {
          res.status(502).json({ error: "ЮKassa не вернула ссылку оплаты" });
          return;
        }

        const store = loadStore();
        const row = {
          orderId,
          paymentId: payment.id,
          userId: req.user.id,
          login: req.user.login,
          packId: pack.id,
          diamonds: pack.diamonds,
          amountRub: pack.amountRub,
          status: "pending",
          createdAt: new Date().toISOString(),
          paidAt: null,
        };
        store.orders[orderId] = row;
        store.byPaymentId[payment.id] = orderId;
        saveStore(store);

        console.log(
          `[pay] create ${orderId} ${req.user.login} ${pack.id} ${pack.amountRub}₽`,
        );
        res.json({
          ok: true,
          orderId,
          paymentId: payment.id,
          confirmationUrl,
          amountRub: pack.amountRub,
          diamonds: pack.diamonds,
        });
      } catch (e) {
        console.error("[pay] create fail:", e.message, e.body || "");
        res.status(502).json({
          error: e.message || "Не удалось создать платёж",
        });
      }
    },
  );

  app.get(
    "/api/payments/order/:orderId",
    auth,
    rateLimitMiddleware({ name: "pay-status", maxN: 60, windowMs: 60_000 }),
    async (req, res) => {
      try {
        const orderId = String(req.params.orderId || "").trim();
        const store = loadStore();
        const row = store.orders[orderId];
        if (!row || row.userId !== req.user.id) {
          res.status(404).json({ error: "Заказ не найден" });
          return;
        }
        // Если ещё pending — спросим ЮKassa (на случай если webhook задержался)
        if (row.status === "pending" && row.paymentId && isYookassaConfigured()) {
          try {
            const payment = await ykRequest(
              "GET",
              `/payments/${row.paymentId}`,
            );
            if (payment.status === "succeeded") {
              await fulfillOrder(row.orderId, payment, {
                withDb,
                persistLiveDb,
                flushPendingGrants,
              });
              const fresh = loadStore().orders[orderId];
              res.json({ ok: true, order: publicOrder(fresh) });
              return;
            }
            if (payment.status === "canceled") {
              row.status = "canceled";
              store.orders[orderId] = row;
              saveStore(store);
            }
          } catch (e) {
            console.warn("[pay] status poll fail:", e.message);
          }
        }
        res.json({ ok: true, order: publicOrder(loadStore().orders[orderId]) });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Ошибка статуса" });
      }
    },
  );

  app.post(
    "/api/payments/yookassa/webhook",
    rateLimitMiddleware({ name: "pay-hook", maxN: 120, windowMs: 60_000 }),
    async (req, res) => {
      try {
        const event = req.body || {};
        const obj = event.object || {};
        const paymentId = String(obj.id || "").trim();
        if (!paymentId) {
          res.status(400).json({ error: "no payment id" });
          return;
        }
        // Перепроверяем платёж у ЮKassa (не доверяем телу вебхука слепо)
        let payment = obj;
        if (isYookassaConfigured()) {
          try {
            payment = await ykRequest("GET", `/payments/${paymentId}`);
          } catch (e) {
            console.warn("[pay] webhook fetch fail:", e.message);
          }
        }
        if (payment.status === "succeeded") {
          const store = loadStore();
          const orderId =
            store.byPaymentId[paymentId] ||
            payment.metadata?.orderId ||
            null;
          if (orderId) {
            await fulfillOrder(orderId, payment, {
              withDb,
              persistLiveDb,
              flushPendingGrants,
            });
          } else {
            console.warn("[pay] webhook: unknown payment", paymentId);
          }
        }
        res.status(200).json({ ok: true });
      } catch (e) {
        console.error("[pay] webhook error:", e);
        res.status(500).json({ error: "webhook fail" });
      }
    },
  );

  if (isYookassaConfigured()) {
    console.log("[orakul] ЮKassa: оплата алмазов включена");
  } else {
    console.warn(
      "[orakul] ЮKassa выкл — задай YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY",
    );
  }
}

function publicOrder(row) {
  if (!row) return null;
  return {
    orderId: row.orderId,
    packId: row.packId,
    diamonds: row.diamonds,
    amountRub: row.amountRub,
    status: row.status,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
  };
}

async function fulfillOrder(orderId, payment, deps) {
  const { withDb, persistLiveDb, flushPendingGrants } = deps;
  const store = loadStore();
  const row = store.orders[orderId];
  if (!row) {
    console.warn("[pay] fulfill: no order", orderId);
    return;
  }
  if (row.status === "paid") {
    return; // идемпотентность
  }

  const pack = DIAMOND_PACKS_SERVER[row.packId];
  const expected = pack?.amountRub;
  const paid = Number(payment?.amount?.value);
  if (expected != null && Number.isFinite(paid) && Math.abs(paid - expected) > 0.01) {
    console.error(
      `[pay] amount mismatch order=${orderId} expected=${expected} got=${paid}`,
    );
    return;
  }
  if (payment?.metadata?.userId && payment.metadata.userId !== row.userId) {
    console.error(`[pay] user mismatch order=${orderId}`);
    return;
  }

  const diamonds = pack?.diamonds ?? row.diamonds;
  await withDb((db) => {
    const user = db.users.find((u) => u.id === row.userId);
    if (!user) {
      console.error("[pay] user missing", row.userId);
      return;
    }
    const pending = user.pendingGrants || {
      gold: 0,
      diamonds: 0,
      cards: [],
    };
    pending.diamonds = (Number(pending.diamonds) || 0) + diamonds;
    pending.gold = Number(pending.gold) || 0;
    if (!Array.isArray(pending.cards)) pending.cards = [];
    user.pendingGrants = pending;
    flushPendingGrants(user);
    persistLiveDb();
  });

  row.status = "paid";
  row.paidAt = new Date().toISOString();
  row.paymentId = payment.id || row.paymentId;
  store.orders[orderId] = row;
  if (row.paymentId) store.byPaymentId[row.paymentId] = orderId;
  saveStore(store);
  console.log(
    `[pay] PAID ${orderId} ${row.login} +${diamonds}💎 (${row.packId})`,
  );
}
