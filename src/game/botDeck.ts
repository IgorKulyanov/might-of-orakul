import {
  CARDS,
  DECK_SIZE,
  getCard,
  manaCostTotal,
  maxCopiesForCard,
} from "./cards";
import { BASE_HEROES, FACTIONS, getHero } from "./heroes";
import { starterDeckForFaction } from "./starterDecks";
import type { Faction, School } from "./types";

/**
 * Макс. тир карт по уровню оракула (честный пул).
 * 1–7 → I; 8–17 → II; 18–27 → III; 28–39 → IV; 40+ → V.
 */
export function maxTierForLevel(level: number): 1 | 2 | 3 | 4 | 5 {
  if (level >= 40) return 5;
  if (level >= 28) return 4;
  if (level >= 18) return 3;
  if (level >= 8) return 2;
  return 1;
}

function cardTier(cardId: string): number {
  try {
    return getCard(cardId).unitLevel ?? 1;
  } catch {
    return 1;
  }
}

function manaWeight(cardId: string, faction: Faction): number {
  try {
    const c = getCard(cardId);
    const cost = c.manaCost ?? {};
    let w = manaCostTotal(cost);
    // Чужая мана для бота дороже / реже растёт
    for (const [f, n] of Object.entries(cost)) {
      if (f !== faction && (n ?? 0) > 0) w += (n ?? 0) * 1.5;
    }
    return w;
  } catch {
    return 99;
  }
}

/**
 * Пул карт, доступных оракулу данного уровня:
 * своя школа + нейтрал, тир ≤ maxTier(level).
 */
export function botPoolForLevel(
  level: number,
  school: School,
): string[] {
  const maxTier = maxTierForLevel(level);
  return CARDS.filter((c) => {
    if (c.kind !== "creature" && c.kind !== "spell") return false;
    const t = c.unitLevel ?? 1;
    if (t < 1 || t > maxTier) return false;
    if (c.school === school || c.school === "neutral") return true;
    return false;
  }).map((c) => c.id);
}

/**
 * Колода бота «равного» уровня: только карты тира ≤ уровню оракула,
 * школа героя бота + нейтралы. Без чужих рас (иначе мёртвые карты / читы).
 */
export function botDeckForLevel(level: number, school?: School): string[] {
  const faction: Faction =
    school && school !== "neutral"
      ? school
      : FACTIONS[Math.abs(level) % FACTIONS.length]!;
  const pool = botPoolForLevel(level, faction);
  if (pool.length === 0) {
    const fallback = CARDS.filter(
      (c) =>
        (c.unitLevel ?? 1) === 1 &&
        (c.school === faction || c.school === "neutral"),
    ).map((c) => c.id);
    return fillDeckAggressive(
      fallback.length ? fallback : ["hero_mana"],
      level,
      faction,
    );
  }
  return fillDeckAggressive(pool, level, faction);
}

/**
 * Агрессивная колода: много дешёвых существ своей фракции + мана-рамп.
 * Заклинаний меньше, чтобы бот успевал забивать стол.
 */
function fillDeckAggressive(
  pool: string[],
  level: number,
  faction: Faction,
): string[] {
  const creatures = pool
    .filter((id) => {
      try {
        return getCard(id).kind === "creature";
      } catch {
        return false;
      }
    })
    .sort(
      (a, b) =>
        manaWeight(a, faction) - manaWeight(b, faction) ||
        cardTier(a) - cardTier(b),
    );

  const spells = pool
    .filter((id) => {
      try {
        return getCard(id).kind === "spell";
      } catch {
        return false;
      }
    })
    .sort((a, b) => manaWeight(a, faction) - manaWeight(b, faction));

  const ramp = ["hero_mana", "hero_mana", "extra_card"].filter((id) => {
    try {
      getCard(id);
      return true;
    } catch {
      return false;
    }
  });

  const out: string[] = [];
  const counts: Record<string, number> = {};
  /** Те же лимиты копий, что у игрока (не 3 и не 99). */
  const push = (id: string) => {
    if (out.length >= DECK_SIZE) return false;
    const max = maxCopiesForCard(id);
    if ((counts[id] ?? 0) >= max) return false;
    out.push(id);
    counts[id] = (counts[id] ?? 0) + 1;
    return true;
  };

  // ~70% существ, сначала дешёвые
  const creatureSlots = Math.min(
    DECK_SIZE - 4,
    Math.max(16, Math.floor(DECK_SIZE * 0.72)),
  );
  let ci = 0;
  let guard = 0;
  while (out.length < creatureSlots && creatures.length > 0 && guard < DECK_SIZE * 80) {
    push(creatures[ci % creatures.length]!);
    ci++;
    guard++;
  }

  for (const id of ramp) push(id);

  let si = 0;
  guard = 0;
  while (out.length < DECK_SIZE && spells.length > 0 && guard < DECK_SIZE * 80) {
    push(spells[si % spells.length]!);
    si++;
    guard++;
  }

  guard = 0;
  while (out.length < DECK_SIZE && creatures.length > 0 && guard < DECK_SIZE * 80) {
    push(creatures[guard % creatures.length]!);
    guard++;
  }

  // если всё ещё мало — спеллы по лимиту
  guard = 0;
  while (out.length < DECK_SIZE && spells.length > 0 && guard < DECK_SIZE * 80) {
    push(spells[guard % spells.length]!);
    guard++;
  }

  // Ранние уровни: мало карт при лимите ×2 — стартовая колода школы, потом тир выше
  if (out.length < DECK_SIZE) {
    for (const id of starterDeckForFaction(faction)) {
      if (!push(id)) continue;
      if (out.length >= DECK_SIZE) break;
    }
  }
  if (out.length < DECK_SIZE) {
    const wider = botPoolForLevel(Math.max(level, 18), faction);
    for (const id of wider) {
      if (!push(id)) continue;
      if (out.length >= DECK_SIZE) break;
    }
  }

  void level;
  return out.slice(0, DECK_SIZE);
}

/** Уровень бота в мульти: чуть выше игрока (давит темпом). */
export function botLevelNear(playerLevel: number): number {
  return Math.max(1, Math.min(50, playerLevel + 1));
}

/** Герой бота: другая раса при возможности, колода потом под него. */
export function botHeroIdFor(playerHeroId: string, botLevel: number): string {
  const yours = getHero(playerHeroId).faction;
  const others = BASE_HEROES.filter((h) => h.faction !== yours);
  const list = others.length ? others : BASE_HEROES;
  return list[Math.abs(botLevel + playerHeroId.length) % list.length]!.id;
}
