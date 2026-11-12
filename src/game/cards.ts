import type {
  CardDef,
  CreatureGender,
  Faction,
  ManaCost,
  School,
} from "./types";
import data from "../../КАРТЫ.json" with { type: "json" };
import {
  shopPriceForCard,
  shopTierOf,
  withinTierRanks,
} from "./cardEconomy";

const CARDS_BASE: CardDef[] = (data.cards as CardDef[]).map((c) => {
  const tier = shopTierOf(c);
  // Магия без unitLevel — тир по редкости (не всё «I новичок»).
  const unitLevel =
    c.unitLevel && c.unitLevel >= 1 && c.unitLevel <= 5
      ? c.unitLevel
      : c.kind === "spell"
        ? tier
        : c.unitLevel;
  return {
    ...c,
    unitLevel,
    cost: c.cost ?? manaCostTotal(c.manaCost ?? {}),
  };
});

/** Ранг силы внутри тира 0..1 — для цен и осколков на ап. */
export const CARD_TIER_RANK = withinTierRanks(CARDS_BASE);

export const CARDS: CardDef[] = CARDS_BASE.map((c) => {
  const price = shopPriceForCard(c, CARD_TIER_RANK.get(c.id));
  return {
    ...c,
    priceGold: price.gold,
    priceDiamonds: price.diamonds,
  };
});

export const CARD_MAP = Object.fromEntries(CARDS.map((c) => [c.id, c]));

export function getCard(id: string): CardDef {
  const c = CARD_MAP[id];
  if (!c) throw new Error(`Unknown card: ${id}`);
  if (
    id === "hero_mana" &&
    !(c.spellEffects && c.spellEffects.some((e) => e.type === "gain_mana"))
  ) {
    return {
      ...c,
      spellEffects: [{ type: "gain_mana", amount: 1 }],
    };
  }
  return c;
}

export function creatureGender(cardId: string): CreatureGender {
  return getCard(cardId).gender ?? "male";
}

export function isFemaleWarrior(cardId: string): boolean {
  return creatureGender(cardId) === "female";
}

export function manaCostTotal(cost: ManaCost): number {
  return Object.values(cost).reduce((s, n) => s + (n ?? 0), 0);
}

/** Сброс кэша браузера/CDN после замены JPG (бампай при новых артах). */
const CARD_ART_VER = "20261112b";

export function cardArtUrl(card: CardDef): string {
  const art = card.art ?? `${card.id}.png`;
  const path = `/cards/${art.split("/").map(encodeURIComponent).join("/")}`;
  return `${path}?v=${CARD_ART_VER}`;
}

/** Кроп/фокус арта на карте (inline — побеждает CSS cover 38%). */
export function cardArtStyle(card: CardDef): {
  backgroundPosition?: string;
  backgroundSize?: string;
} {
  // Жёсткий оверрайд: у этих портретов cover срезает полголовы.
  const forced: Record<
    string,
    { backgroundPosition: string; backgroundSize: string }
  > = {
    banshee: {
      backgroundPosition: "center top",
      backgroundSize: "auto 100%",
    },
    basilisk: {
      backgroundPosition: "68% top",
      backgroundSize: "auto 100%",
    },
  };
  if (forced[card.id]) return forced[card.id];

  const style: {
    backgroundPosition?: string;
    backgroundSize?: string;
  } = {};
  if (card.artFocus) style.backgroundPosition = card.artFocus;
  if (card.artFit === "height") style.backgroundSize = "auto 100%";
  return style;
}

export const SCHOOL_LABEL: Record<School, string> = {
  water: "Вода",
  hell: "Ад",
  death: "Смерть",
  life: "Жизнь",
  nature: "Природа",
  neutral: "Нейтрал",
};

export const SCHOOL_COLOR: Record<School, string> = {
  water: "#0077b6",
  hell: "#e85d04",
  death: "#5a189a",
  life: "#2d6a4f",
  nature: "#40916c",
  neutral: "#6c757d",
};

/**
 * Короткие подписи для логов / formatManaCost (без картинок).
 * В UI — GameIcon / SchoolBadge / ManaCostIcons.
 */
export const FACTION_LABEL: Record<Faction, string> = {
  water: "Вода",
  hell: "Ад",
  death: "Смерть",
  life: "Жизнь",
  nature: "Природа",
};

export const PATTERN_LABEL: Record<string, string> = {
  melee: "⚔ напротив",
  melee_lane3: "⚔ 1 из 3",
  ranged: "🏹 любая",
  cleave3: "🔱 ×3",
  lane_cleave3: "🔱 ряд",
  aoe_all: "🌊 всем",
};

export function formatManaCost(cost: ManaCost): string {
  const parts: string[] = [];
  (Object.keys(cost) as Faction[]).forEach((f) => {
    const n = cost[f];
    if (n && n > 0) parts.push(`${FACTION_LABEL[f]} ${n}`);
  });
  return parts.length ? parts.join(" · ") : "0";
}

/** Уровень рамки 1…5 (сила карты). Fallback: rarity → cost. */
export function cardFrameLevel(card: CardDef): 1 | 2 | 3 | 4 | 5 {
  if (card.unitLevel && card.unitLevel >= 1 && card.unitLevel <= 5) {
    return card.unitLevel;
  }
  switch (card.rarity) {
    case "legendary":
      return 5;
    case "epic":
      return 4;
    case "rare":
      return 3;
    case "common":
    default: {
      const c = card.cost ?? manaCostTotal(card.manaCost ?? {});
      if (c >= 5) return 4;
      if (c >= 3) return 3;
      if (c >= 2) return 2;
      return 1;
    }
  }
}

/**
 * Каталог: сначала существа 1→5, потом заклинания 1→5.
 * Внутри уровня — по школе, затем по имени.
 */
export function compareCatalogCards(a: CardDef, b: CardDef): number {
  const kindOrder = (k: CardDef["kind"]) => (k === "creature" ? 0 : 1);
  const dk = kindOrder(a.kind) - kindOrder(b.kind);
  if (dk !== 0) return dk;
  const dl = cardFrameLevel(a) - cardFrameLevel(b);
  if (dl !== 0) return dl;
  const ds = a.school.localeCompare(b.school, "ru");
  if (ds !== 0) return ds;
  return a.name.localeCompare(b.name, "ru");
}

export function sortCatalogCards(cards: CardDef[]): CardDef[] {
  return [...cards].sort(compareCatalogCards);
}

/**
 * Колода в бою = ровно собранные карты (с копиями), перемешанные.
 * Размер сейва/боя: DECK_SIZE. Минимум для выхода в бой: MIN_DECK_SIZE.
 * При крутящейся колоде 25 размывает ключи — потолок 12.
 */
export const DECK_SIZE = 12;
/** Минимум для боя; старт новичка — 4 карты (см. starterDecks). */
export const MIN_DECK_SIZE = 4;

/**
 * Потолок копий: 1 — идём через прокачку, а не стак одинаковых.
 * (Эпик/легенда и раньше были 1.)
 */
export const MAX_COPIES = 1;

/** Уникальный список без пустых id (порядок сохраняем). */
export function uniqueCardIds(pool: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of pool) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Сколько копий карты можно иметь (коллекция / оракул и колода). */
export function maxCopiesForCard(_cardId: string): number {
  return MAX_COPIES;
}

export function countIds(ids: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const id of ids) {
    if (!id) continue;
    m[id] = (m[id] ?? 0) + 1;
  }
  return m;
}

function shuffleIds(ids: string[]): string[] {
  const a = [...ids];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Боевая стопка: колода как есть (с копиями), только shuffle.
 * Короткую не добиваем — игрок сам собирает копии.
 */
export function expandDeckForBattle(pool: string[]): string[] {
  const ids = (pool ?? []).filter(Boolean);
  if (!ids.length) return [];
  return shuffleIds(ids);
}

/** Собрать список id из {id: count}. */
export function flattenCounts(counts: Record<string, number>): string[] {
  const out: string[] = [];
  for (const [id, n] of Object.entries(counts)) {
    const k = Math.max(0, Math.floor(n));
    for (let i = 0; i < k; i++) out.push(id);
  }
  return out;
}

/** @deprecated — для старых вызовов: уникальный срез */
export function fillDeckFromPool(pool: string[]): string[] {
  return uniqueCardIds(pool).slice(0, DECK_SIZE);
}

export function defaultDeck(): string[] {
  const deck = (data.starterDeck as string[]) ?? [];
  if (deck.length > 0) return [...deck].slice(0, DECK_SIZE);
  return [];
}

/** Совместимость: старый school fire/earth/air → hell/nature/nature */
export function normalizeSchool(raw: string): School {
  if (raw === "fire") return "hell";
  if (raw === "earth" || raw === "air") return "nature";
  if (
    raw === "water" ||
    raw === "hell" ||
    raw === "death" ||
    raw === "life" ||
    raw === "nature" ||
    raw === "neutral"
  ) {
    return raw;
  }
  return "neutral";
}
