/**
 * Каталог цен магазина — та же идея, что src/game/cardEconomy.ts:
 * ценник = цена за 1 осколок; цена/кач зависят от силы карты, не только от тира.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TIER_SHARD_PRICE = {
  1: { gold: 40, diamonds: 5 },
  2: { gold: 110, diamonds: 12 },
  3: { gold: 280, diamonds: 28 },
  4: { gold: 650, diamonds: 55 },
  5: { gold: 1400, diamonds: 100 },
};

const TIER_SHARD_NEED = {
  1: { to2: 30, to3: 80 },
  2: { to2: 40, to3: 100 },
  3: { to2: 50, to3: 130 },
  4: { to2: 70, to3: 180 },
  5: { to2: 100, to3: 250 },
};

const ABILITY_WEIGHT = {
  arbiter_flex: 38,
  vampire_grow: 30,
  banshee_flex: 28,
  hornet_queen_flex: 27,
  gravedigger_flex: 26,
  necro_flex: 26,
  balthazar_flex: 26,
  unicorn_flex: 25,
  leshy_flex: 24,
  valkyrie_flex: 24,
  succubus_flex: 24,
  mage_flex: 22,
  triton_flex: 22,
  mermaid_flex: 22,
  paladin_flex: 22,
  inferno_flex: 22,
  aquilite_swap: 20,
  skeleton_pack: 16,
  hornet_pack: 16,
  school_mana_aura: 18,
  leprechaun_aura: 18,
  water_tide: 16,
  angel_heal: 15,
  lich_drain: 17,
  basilisk_gaze: 18,
  spider_poison: 16,
  scorpion_poison: 16,
  flame_burn: 14,
  imp_burn: 14,
  mana_steal: 18,
  riposte: 14,
  rush: 12,
  berserk_decay: 8,
  immune_spells: 22,
  immune_hell_death: 18,
  immune_death: 12,
};

const PATTERN_WEIGHT = {
  aoe_all: 32,
  cleave3: 18,
  lane_cleave3: 18,
  melee_lane3: 10,
  ranged: 9,
  melee: 0,
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

function manaTotal(card) {
  return Object.values(card.manaCost || {}).reduce(
    (s, n) => s + (Number(n) || 0),
    0,
  );
}

function hashSalt(id) {
  let h = 2166136261;
  for (let i = 0; i < String(id).length; i++) {
    h ^= String(id).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1000;
}

function spellEffectScore(e) {
  switch (e?.type) {
    case "damage_all_enemies":
      return 14 + (e.amount || 0) * 3;
    case "damage_hero":
      return 8 + (e.amount || 0) * 2;
    case "damage_unit":
      return 7 + (e.amount || 0) * 2;
    case "damage_undead":
      return 6 + (e.amount || 0) * 2;
    case "buff_permanent":
      return 12 + (e.attack || 0) * 3 + (e.health || 0) * 2;
    case "poison":
      return 10 + (e.amount || 0) * 3;
    case "heal_hero":
    case "heal_unit":
      return 6 + (e.amount || 0) * 1.5;
    case "draw":
      return 8 + (e.amount || 0) * 4;
    case "gain_mana":
      return 9 + (e.amount || 0) * 4;
    case "shield_ally":
      return 10 + (e.turns || 0) * 2;
    case "skip_combat":
      return 16;
    case "shuffle_board":
      return 12;
    case "extra_draw_turns":
      return 11 + (e.turns || 0) * 3;
    case "mute_ranged":
      return 12 + (e.turns || 0) * 2;
    case "weaken_foe_damage":
      return 13 + (e.turns || 0) * 2;
    case "sniper_buff":
      return 15 + (e.attack || 0) * 2 + (e.turns || 0) * 2;
    case "wake_all_allies":
      return 14;
    case "wake_ally":
      return 8;
    case "slow_enemy":
      return 7 + (e.amount || 0);
    default:
      return 8;
  }
}

function cardPowerScore(card) {
  const mana = Math.max(1, manaTotal(card));
  let score = 0;
  if (card.kind === "creature") {
    const atk = Number(card.attack) || 0;
    const hp = Number(card.health) || 0;
    const combat = atk * 2.35 + hp;
    score += combat;
    score += (combat / mana) * 6;
    if (card.attackPattern) score += PATTERN_WEIGHT[card.attackPattern] || 0;
    const abs = [
      ...(card.ability ? [card.ability] : []),
      ...(Array.isArray(card.abilities) ? card.abilities : []),
    ];
    for (const a of abs) score += ABILITY_WEIGHT[a] || 10;
    if (card.onPlayHealHero) score += 4 + Number(card.onPlayHealHero);
  } else {
    const effects = Array.isArray(card.spellEffects) ? card.spellEffects : [];
    for (const e of effects) score += spellEffectScore(e);
    score += (score / mana) * 4;
    if (!effects.length) score += 8;
  }
  const text = String(card.text || "").toLowerCase();
  if (text.includes(" или ")) score += 8;
  if (text.includes("за убийство") || text.includes("при смерти")) score += 7;
  if (text.includes("яд") || text.includes("оглуш") || text.includes("щит")) {
    score += 5;
  }
  if (text.includes("стая") || text.includes("рой")) score += 6;
  const ul = Math.max(1, Math.min(5, Math.floor(Number(card.unitLevel) || 1)));
  score += (ul - 1) * 8;
  switch (card.rarity) {
    case "legendary":
      score += 22;
      break;
    case "epic":
      score += 14;
      break;
    case "rare":
      score += 7;
      break;
    default:
      break;
  }
  score += (hashSalt(card.id) % 17) * 0.35;
  return Math.max(1, score);
}

function powerMult(score, tier) {
  const mid = [0, 118, 145, 175, 210, 255][tier];
  const span = [0, 42, 50, 60, 75, 95][tier];
  const t = (score - mid) / span;
  const clamped = Math.max(-1.1, Math.min(1.45, t));
  return 1 + clamped * 0.62;
}

function roundGold(n) {
  const x = Math.max(5, Math.round(n));
  if (x < 40) return Math.max(5, Math.round(x));
  if (x < 100) return Math.round(x / 5) * 5;
  if (x < 400) return Math.round(x / 10) * 10;
  if (x < 1000) return Math.round(x / 25) * 25;
  return Math.round(x / 50) * 50;
}

function roundDia(n) {
  const x = Math.max(1, Math.round(n));
  if (x < 20) return x;
  if (x < 60) return Math.round(x / 2) * 2;
  if (x < 150) return Math.round(x / 5) * 5;
  return Math.round(x / 10) * 10;
}

function roundShards(n) {
  return Math.max(8, Math.round(n / 2) * 2);
}

function shopPriceForCard(card) {
  if (card.id === "mana_stones") return { gold: 200, diamonds: 20 };
  const tier = shopTier(card);
  const base = TIER_SHARD_PRICE[tier];
  const score = cardPowerScore(card);
  const mult = powerMult(score, tier);
  const jitter = 0.94 + (hashSalt(card.id) % 13) * 0.01;
  return {
    gold: roundGold(base.gold * mult * jitter),
    diamonds: roundDia(base.diamonds * mult * jitter),
  };
}

function shardNeedForCard(card) {
  const tier = shopTier(card);
  const base = TIER_SHARD_NEED[tier];
  const mult = powerMult(cardPowerScore(card), tier);
  return {
    to2: roundShards(base.to2 * mult),
    to3: roundShards(base.to3 * mult),
  };
}

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
/** @type {Map<string, { gold: number, diamonds: number, maxCopies: number, name: string, minLevel: number, tier: number, needTo2: number, needTo3: number }>} */
const CATALOG = new Map();

for (const c of raw.cards || []) {
  if (!c?.id) continue;
  const tier = shopTier(c);
  const withTier = {
    ...c,
    unitLevel:
      c.unitLevel && c.unitLevel >= 1 && c.unitLevel <= 5
        ? c.unitLevel
        : c.kind === "spell"
          ? tier
          : c.unitLevel,
  };
  const price = shopPriceForCard(withTier);
  const need = shardNeedForCard(withTier);
  CATALOG.set(String(c.id), {
    gold: price.gold,
    diamonds: price.diamonds,
    maxCopies: maxCopiesFor(c),
    name: String(c.name || c.id),
    minLevel: minLevelForCard(withTier),
    tier,
    needTo2: need.to2,
    needTo3: need.to3,
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

  // Уже в оракуле → докупка 1 осколка по тому же ценнику.
  if (have >= card.maxCopies) {
    const upgrades =
      owned.cardUpgrades && typeof owned.cardUpgrades === "object"
        ? owned.cardUpgrades
        : {};
    const lv = Math.min(3, Math.max(1, Math.floor(Number(upgrades[cardId])) || 1));
    if (lv >= 3) {
      return { ok: false, error: `«${card.name}» уже максимальный уровень` };
    }
    const add = 1;
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
      needTo2: card.needTo2,
      needTo3: card.needTo3,
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
