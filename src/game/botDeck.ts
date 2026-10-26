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
 * Размер колоды бота: на старте короче, чтобы не «добивать» тиром III
 * (у тира I часто меньше 25 слотов с учётом лимита копий).
 */
export function botDeckSizeForLevel(level: number): number {
  const lv = Math.max(1, level);
  if (lv <= 3) return lv <= 1 ? 4 : lv === 2 ? 5 : 6;
  if (lv <= 5) return 10;
  if (lv <= 7) return 14;
  if (lv <= 14) return 20;
  return DECK_SIZE;
}

/**
 * Обучающая колода = старт школы (+1–2 копии своих существ).
 * Без нейтрального спама и без чужого тира — зеркало новичка.
 */
function fillDeckTutorial(faction: Faction, level: number): string[] {
  const target = botDeckSizeForLevel(level);
  const base = starterDeckForFaction(faction);
  const out: string[] = [...base];
  const counts: Record<string, number> = {};
  for (const id of out) counts[id] = (counts[id] ?? 0) + 1;

  const creatures = base.filter((id) => {
    try {
      return getCard(id).kind === "creature";
    } catch {
      return false;
    }
  });

  let guard = 0;
  let i = 0;
  while (out.length < target && creatures.length > 0 && guard < 40) {
    const id = creatures[i % creatures.length]!;
    const max = maxCopiesForCard(id);
    if ((counts[id] ?? 0) < max) {
      out.push(id);
      counts[id] = (counts[id] ?? 0) + 1;
    }
    i++;
    guard++;
  }
  return out.slice(0, target);
}

/**
 * Колода бота «равного» уровня: только карты тира ≤ уровню оракула,
 * школа героя бота + нейтралы. Без чужих рас (иначе мёртвые карты / читы).
 * Ур. 1–3 — почти стартовая колода, чтобы первые бои были проходимы.
 */
export function botDeckForLevel(level: number, school?: School): string[] {
  const faction: Faction =
    school && school !== "neutral"
      ? school
      : FACTIONS[Math.abs(level) % FACTIONS.length]!;

  if (level <= 3) {
    return fillDeckTutorial(faction, level);
  }

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
  const target = botDeckSizeForLevel(level);
  const maxTier = maxTierForLevel(level);
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

  // На старте без «Доп. карты» (T2) — иначе новичок ловит рамп выше своего тира
  const rampIds =
    maxTier <= 1
      ? ["hero_mana", "hero_mana"]
      : ["hero_mana", "hero_mana", "extra_card"];
  const ramp = rampIds.filter((id) => {
    try {
      getCard(id);
      return cardTier(id) <= maxTier;
    } catch {
      return false;
    }
  });

  const out: string[] = [];
  const counts: Record<string, number> = {};
  /** Те же лимиты копий, что у игрока (не 3 и не 99). */
  const push = (id: string) => {
    if (out.length >= target) return false;
    if (cardTier(id) > maxTier) return false;
    const max = maxCopiesForCard(id);
    if ((counts[id] ?? 0) >= max) return false;
    out.push(id);
    counts[id] = (counts[id] ?? 0) + 1;
    return true;
  };

  // ~70% существ, сначала дешёвые
  const creatureSlots = Math.min(
    Math.max(0, target - Math.min(4, ramp.length + 2)),
    Math.max(Math.ceil(target * 0.65), Math.min(creatures.length * 2, target - 2)),
  );
  let ci = 0;
  let guard = 0;
  while (out.length < creatureSlots && creatures.length > 0 && guard < target * 80) {
    push(creatures[ci % creatures.length]!);
    ci++;
    guard++;
  }

  for (const id of ramp) push(id);

  let si = 0;
  guard = 0;
  while (out.length < target && spells.length > 0 && guard < target * 80) {
    push(spells[si % spells.length]!);
    si++;
    guard++;
  }

  guard = 0;
  while (out.length < target && creatures.length > 0 && guard < target * 80) {
    push(creatures[guard % creatures.length]!);
    guard++;
  }

  guard = 0;
  while (out.length < target && spells.length > 0 && guard < target * 80) {
    push(spells[guard % spells.length]!);
    guard++;
  }

  // Добираем стартом школы — всё ещё в рамках своего тира
  if (out.length < target) {
    for (const id of starterDeckForFaction(faction)) {
      if (!push(id)) continue;
      if (out.length >= target) break;
    }
  }

  return out.slice(0, target);
}

/**
 * Уровень бота «рядом»: на старте равный (иначе новичок сливает),
 * с 5-го — чуть выше.
 */
export function botLevelNear(playerLevel: number): number {
  const lv = Math.max(1, Math.min(50, playerLevel));
  if (lv <= 4) return lv;
  return Math.min(50, lv + 1);
}

/** Герой бота: другая раса при возможности, колода потом под него. */
export function botHeroIdFor(playerHeroId: string, botLevel: number): string {
  const yours = getHero(playerHeroId).faction;
  const others = BASE_HEROES.filter((h) => h.faction !== yours);
  const list = others.length ? others : BASE_HEROES;
  return list[Math.abs(botLevel + playerHeroId.length) % list.length]!.id;
}
