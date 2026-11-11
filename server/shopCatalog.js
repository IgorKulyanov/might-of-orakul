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
/** 1 копия: прокачка вместо стака. */
export const MAX_COPIES_DEFAULT = 1;

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

function maxCopiesFor(_card) {
  return MAX_COPIES_DEFAULT;
}

const SHARDS_PER_SHOP_BUY = { 1: 10, 2: 12, 3: 15, 4: 18, 5: 22 };
const SHARD_COST_BY_TIER = {
  1: { to2: 30, to3: 80 },
  2: { to2: 40, to3: 100 },
  3: { to2: 50, to3: 130 },
  4: { to2: 70, to3: 180 },
  5: { to2: 100, to3: 250 },
};

/** Лок магазина по тиру цены (существа и магия). */
function minLevelForCard(card) {
  const tier = shopTier(card);
  if (tier === 5) return 30;
  if (tier === 4) return 25;
  if (tier === 3) return 15;
  if (tier === 2) return 10;
  return 1;
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
/** @type {Map<string, { gold: number, diamonds: number, maxCopies: number, name: string, minLevel: number, tier: number }>} */
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
    minLevel: minLevelForCard(c),
    tier,
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
  const playerLv = Math.max(1, Math.floor(Number(owned.level)) || 1);
  if (playerLv < card.minLevel) {
    return {
      ok: false,
      error: `«${card.name}» с ${card.minLevel} уровня (у тебя ${playerLv})`,
    };
  }
  const col =
    owned.collection && typeof owned.collection === "object"
      ? { ...owned.collection }
      : {};
  const have = Math.floor(Number(col[cardId])) || 0;
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

  // Уже в оракуле → докупка осколков по тому же ценнику.
  if (have >= card.maxCopies) {
    const tier = /** @type {1|2|3|4|5} */ (card.tier || 1);
    const upgrades =
      owned.cardUpgrades && typeof owned.cardUpgrades === "object"
        ? owned.cardUpgrades
        : {};
    const lv = Math.min(3, Math.max(1, Math.floor(Number(upgrades[cardId])) || 1));
    const need = SHARD_COST_BY_TIER[tier];
    if (lv >= 3) {
      return { ok: false, error: `«${card.name}» уже максимальный уровень` };
    }
    const add = SHARDS_PER_SHOP_BUY[tier] || 10;
    const shards =
      owned.cardShards && typeof owned.cardShards === "object"
        ? { ...owned.cardShards }
        : {};
    shards[cardId] = (Math.floor(Number(shards[cardId])) || 0) + add;
    owned.cardShards = shards;
    return {
      ok: true,
      kind: "shards",
      shardsAdded: add,
      needTo2: need.to2,
      needTo3: need.to3,
    };
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

  const upgrades =
    owned.cardUpgrades && typeof owned.cardUpgrades === "object"
      ? { ...owned.cardUpgrades }
      : {};
  if (upgrades[cardId] == null) upgrades[cardId] = 1;
  owned.cardUpgrades = upgrades;

  // Автоматически в активную колоду, если есть место.
  const DECK_SIZE = 20;
  const decks =
    owned.decks && typeof owned.decks === "object" ? { ...owned.decks } : {};
  const deckId =
    typeof owned.activeDeckId === "string" && owned.activeDeckId
      ? owned.activeDeckId
      : "starter";
  const deck = Array.isArray(decks[deckId]) ? [...decks[deckId]] : [];
  const inDeck = deck.filter((x) => String(x) === String(cardId)).length;
  if (inDeck < 1 && deck.length < DECK_SIZE) {
    deck.push(String(cardId));
    decks[deckId] = deck;
    owned.decks = decks;
    if (!owned.activeDeckId) owned.activeDeckId = deckId;
  }

  return { ok: true, kind: "card" };
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
