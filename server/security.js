/**
 * Защита API: лимиты, санитизация сейва, антибрутфорс.
 * Не панацея от читов в соло (клиентский движок), но режет тупые атаки и накрутку на сервере.
 */

const loginFails = new Map(); // ip|login -> { n, until }
const hitBuckets = new Map(); // key -> { n, reset }

const MAX_GOLD = 5_000_000;
const MAX_DIAMONDS = 100_000;
const MAX_LEVEL = 50;
const MAX_XP = 2_000_000;
const DECK_MAX = 40;
const DECK_MIN = 1;

export function clientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length) return xf.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

/** Простой sliding window: maxN запросов за windowMs. */
export function rateLimit(key, maxN, windowMs) {
  const now = Date.now();
  let b = hitBuckets.get(key);
  if (!b || now > b.reset) {
    b = { n: 0, reset: now + windowMs };
    hitBuckets.set(key, b);
  }
  b.n += 1;
  if (b.n > maxN) {
    return { ok: false, retryAfterMs: Math.max(0, b.reset - now) };
  }
  return { ok: true };
}

export function rateLimitMiddleware(opts) {
  const {
    name,
    maxN = 60,
    windowMs = 60_000,
    keyFn = (req) => `${name}:${clientIp(req)}`,
  } = opts;
  return (req, res, next) => {
    const r = rateLimit(keyFn(req), maxN, windowMs);
    if (!r.ok) {
      res.status(429).json({
        error: "Слишком много запросов, подожди немного",
        retryAfterMs: r.retryAfterMs,
      });
      return;
    }
    next();
  };
}

export function checkLoginThrottle(ip, login) {
  const key = `${ip}|${login}`;
  const row = loginFails.get(key);
  const now = Date.now();
  if (row?.until && now < row.until) {
    return {
      ok: false,
      error: "Слишком много неверных попыток. Подожди минуту.",
    };
  }
  return { ok: true, key };
}

export function noteLoginFail(key) {
  const now = Date.now();
  const row = loginFails.get(key) || { n: 0, until: 0 };
  row.n += 1;
  if (row.n >= 8) {
    row.until = now + 60_000;
    row.n = 0;
  }
  loginFails.set(key, row);
}

export function noteLoginOk(key) {
  loginFails.delete(key);
}

export function sanitizeDisplayName(raw) {
  return String(raw || "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .trim()
    .slice(0, 24);
}

/** Текст чата / фидбека: без HTML-управляющих, длина ограничена. */
export function sanitizeChatText(raw, maxLen = 200) {
  return String(raw || "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export function sanitizeHeroId(raw) {
  const id = String(raw || "");
  if (!/^hero_[a-z0-9_]{2,32}$/i.test(id)) return null;
  return id;
}

/** Урезать owned: потолки валюты/уровня, колоды только строками-id. */
export function sanitizeOwned(raw, prev) {
  if (!raw || typeof raw !== "object") return prev ?? null;
  const base = prev && typeof prev === "object" ? { ...prev } : {};
  const next = { ...base, ...raw };

  next.gold = clampInt(next.gold, 0, MAX_GOLD, base.gold ?? 0);
  next.diamonds = clampInt(next.diamonds, 0, MAX_DIAMONDS, base.diamonds ?? 0);
  next.level = clampInt(next.level, 1, MAX_LEVEL, base.level ?? 1);
  next.xp = clampInt(next.xp, 0, MAX_XP, base.xp ?? 0);

  // Анти-телепорт валюты одним запросом (покупка пакета алмазов укладывается)
  const prevGold = Number(base.gold) || 0;
  const prevDia = Number(base.diamonds) || 0;
  if (next.gold > prevGold + 50_000) next.gold = prevGold + 50_000;
  if (next.diamonds > prevDia + 2_000) next.diamonds = prevDia + 2_000;

  if (typeof next.heroId === "string") {
    const h = sanitizeHeroId(next.heroId);
    if (h) next.heroId = h;
    else delete next.heroId;
  }

  if (next.decks && typeof next.decks === "object") {
    const decks = {};
    for (const [k, v] of Object.entries(next.decks)) {
      if (!Array.isArray(v)) continue;
      const id = String(k).slice(0, 32);
      decks[id] = v
        .map((c) => String(c).slice(0, 64))
        .filter(Boolean)
        .slice(0, DECK_MAX);
    }
    next.decks = decks;
  }

  if (Array.isArray(next.unlocked)) {
    next.unlocked = [
      ...new Set(next.unlocked.map((c) => String(c).slice(0, 64))),
    ].slice(0, 500);
  }

  if (next.collection && typeof next.collection === "object") {
    const col = {};
    for (const [k, v] of Object.entries(next.collection)) {
      const n = Math.floor(Number(v));
      if (!Number.isFinite(n) || n <= 0) continue;
      col[String(k).slice(0, 64)] = Math.min(20, n);
    }
    next.collection = col;
  }

  return next;
}

function clampInt(v, min, max, fallback) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function validateDeckIds(deck, knownIds) {
  if (!Array.isArray(deck)) return { ok: false, error: "Колода битая" };
  if (deck.length < DECK_MIN || deck.length > DECK_MAX) {
    return { ok: false, error: `В колоде нужно от ${DECK_MIN} до ${DECK_MAX} карт` };
  }
  for (const id of deck) {
    const s = String(id);
    if (!knownIds.has(s)) {
      return { ok: false, error: `Неизвестная карта: ${s.slice(0, 40)}` };
    }
  }
  return { ok: true };
}

export const LIMITS = {
  MAX_GOLD,
  MAX_DIAMONDS,
  MAX_LEVEL,
  DECK_MAX,
};

/** Периодическая уборка карт лимитов. */
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of hitBuckets) {
    if (now > b.reset) hitBuckets.delete(k);
  }
  for (const [k, row] of loginFails) {
    if (row.until && now > row.until + 60_000) loginFails.delete(k);
  }
}, 120_000).unref?.();
