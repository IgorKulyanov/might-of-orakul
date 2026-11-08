/**
 * Каталог цен магазина — та же формула, что src/game/cards.ts (UNIT_TIER_PRICE).
 * Клиентский priceGold в JSON игнорируем: источник истины — тир/редкость.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UNIT_TIER_PRICE = {
  1: { gold: 400, diamonds: 50 },
  2: { gold: 1100, diamonds: 120 },
  3: { gold: 2800, diamonds: 280 },
  4: { gold: 6500, diamonds: 550 },
  5: { gold: 14000, diamonds: 1000 },
};

export const EPIC_HERO_GOLD = 20_000;
export const EPIC_HERO_DIAMONDS = 2_000;
export const MAX_COPIES_DEFAULT = 2;

function shopTier(card) {
  const ul = Number(card.unitLevel);
  if (ul >= 1 && ul <= 5) return /** @type {1|2|3|4|5} */ (ul);
  switch (card.rarity) {
    case "legendary":
      return 5;
    case "epic":
      return 4;
    case "rare":
      return 3;
    default:
      return 1;
  }
}

function maxCopiesFor(card) {
  const ul = Number(card.unitLevel);
  if (card.rarity === "legendary" || ul === 5) return 1;
  if (card.rarity === "epic" || ul === 4) return 1;
  return MAX_COPIES_DEFAULT;
}

function loadCardsJson() {
  const candidates = [
    path.join(__dirname, "..", "КАРТЫ.json"),
    path.join(__dirname, "КАРТЫ.json"),
    path.resolve(process.cwd(), "КАРТЫ.json"),
    path.resolve(process.cwd(), "..", "КАРТЫ.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, "utf8"));
      }
    } catch {
      /* try next */
    }
  }
  console.warn("[orakul] shopCatalog: КАРТЫ.json не найден — цены недоступны");
  return { cards: [] };
}

const raw = loadCardsJson();
/** @type {Map<string, { gold: number, diamonds: number, maxCopies: number, name: string }>} */
const CATALOG = new Map();

for (const c of raw.cards || []) {
  if (!c?.id) continue;
  const tier = shopTier(c);
  const price = UNIT_TIER_PRICE[tier];
  const gold = c.id === "mana_stones" ? 2000 : price.gold;
  const diamonds = c.id === "mana_stones" ? 200 : price.diamonds;
  CATALOG.set(String(c.id), {
    gold,
    diamonds,
    maxCopies: maxCopiesFor(c),
    name: String(c.name || c.id),
  });
}

export function getShopCard(cardId) {
  return CATALOG.get(String(cardId)) || null;
}

export function knownShopCardIds() {
  return new Set(CATALOG.keys());
}

/**
 * Запретить рост коллекции/purchased через PUT /api/me.
 * Первичный посев (пустая коллекция → стартовый набор) разрешён.
 * Покупки — только POST /api/shop/buy.
 */
export function clampOwnedShopGains(prev, next) {
  if (!next || typeof next !== "object") return next;
  const base = prev && typeof prev === "object" ? prev : {};
  const prevCol =
    base.collection && typeof base.collection === "object"
      ? base.collection
      : {};
  const prevTotal = Object.values(prevCol).reduce(
    (s, n) => s + (Math.floor(Number(n)) || 0),
    0,
  );

  // Первый сейв коллекции (онбординг) — не режем.
  if (prevTotal <= 0) return next;

  const nextCol =
    next.collection && typeof next.collection === "object"
      ? { ...next.collection }
      : {};
  let stripped = 0;
  for (const [id, rawN] of Object.entries(nextCol)) {
    const n = Math.floor(Number(rawN)) || 0;
    const prevN = Math.floor(Number(prevCol[id])) || 0;
    if (n > prevN) {
      stripped += n - prevN;
      if (prevN > 0) nextCol[id] = prevN;
      else delete nextCol[id];
    }
  }
  next.collection = nextCol;

  const prevPurchased = new Set(
    Array.isArray(base.purchased) ? base.purchased.map(String) : [],
  );
  if (Array.isArray(next.purchased)) {
    next.purchased = next.purchased
      .map(String)
      .filter((id) => prevPurchased.has(id))
      .slice(0, 500);
  }

  const prevHeroes = new Set(
    Array.isArray(base.unlockedHeroes)
      ? base.unlockedHeroes.map(String)
      : [],
  );
  if (Array.isArray(next.unlockedHeroes)) {
    // Базовые hero_* без _epic можно синкать; эпики — только через /api/shop/buy-hero
    next.unlockedHeroes = next.unlockedHeroes
      .map(String)
      .filter((id) => {
        if (prevHeroes.has(id)) return true;
        if (/^hero_[a-z0-9_]+_epic$/i.test(id)) return false;
        return /^hero_[a-z0-9_]+$/i.test(id);
      })
      .slice(0, 50);
  }

  if (stripped > 0) {
    console.warn(
      `[orakul] shop clamp: снято ${stripped} неоплаченн. копий (клиентский сейв)`,
    );
  }
  return next;
}

/**
 * Выдать копию карты со списанием. Мутирует owned.
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function applyShopBuy(owned, cardId, currency) {
  const card = getShopCard(cardId);
  if (!card) return { ok: false, error: "Нет такой карты" };
  if (!owned || typeof owned !== "object") {
    return { ok: false, error: "Нет сейва" };
  }
  const col =
    owned.collection && typeof owned.collection === "object"
      ? { ...owned.collection }
      : {};
  const have = Math.floor(Number(col[cardId])) || 0;
  if (have >= card.maxCopies) {
    return { ok: false, error: `Максимум копий «${card.name}»` };
  }

  const pay = currency === "diamonds" ? "diamonds" : "gold";
  if (pay === "gold") {
    const gold = Math.floor(Number(owned.gold)) || 0;
    if (gold < card.gold) {
      return {
        ok: false,
        error: `Нужно ${card.gold} золота (есть ${gold})`,
      };
    }
    owned.gold = gold - card.gold;
  } else {
    const dia = Math.floor(Number(owned.diamonds)) || 0;
    if (dia < card.diamonds) {
      return {
        ok: false,
        error: `Нужно ${card.diamonds} алмазов (есть ${dia})`,
      };
    }
    owned.diamonds = dia - card.diamonds;
  }

  col[cardId] = have + 1;
  owned.collection = col;

  const purchased = new Set(
    Array.isArray(owned.purchased) ? owned.purchased.map(String) : [],
  );
  purchased.add(String(cardId));
  owned.purchased = [...purchased].slice(0, 500);

  const unlocked = new Set(
    Array.isArray(owned.unlocked) ? owned.unlocked.map(String) : [],
  );
  unlocked.add(String(cardId));
  owned.unlocked = [...unlocked].slice(0, 500);

  return { ok: true };
}

/**
 * Покупка эпического облика. Мутирует owned.
 */
export function applyHeroBuy(owned, heroId, currency) {
  const id = String(heroId || "");
  if (!/^hero_[a-z0-9_]+_epic$/i.test(id)) {
    return { ok: false, error: "Только эпический облик" };
  }
  if (!owned || typeof owned !== "object") {
    return { ok: false, error: "Нет сейва" };
  }
  const have = new Set(
    Array.isArray(owned.unlockedHeroes)
      ? owned.unlockedHeroes.map(String)
      : [],
  );
  if (have.has(id)) return { ok: false, error: "Уже куплено" };

  const pay = currency === "diamonds" ? "diamonds" : "gold";
  if (pay === "gold") {
    const gold = Math.floor(Number(owned.gold)) || 0;
    if (gold < EPIC_HERO_GOLD) {
      return { ok: false, error: `Нужно ${EPIC_HERO_GOLD} золота` };
    }
    owned.gold = gold - EPIC_HERO_GOLD;
  } else {
    const dia = Math.floor(Number(owned.diamonds)) || 0;
    if (dia < EPIC_HERO_DIAMONDS) {
      return { ok: false, error: `Нужно ${EPIC_HERO_DIAMONDS} алмазов` };
    }
    owned.diamonds = dia - EPIC_HERO_DIAMONDS;
  }
  have.add(id);
  owned.unlockedHeroes = [...have].slice(0, 50);
  owned.heroId = id;
  return { ok: true };
}
