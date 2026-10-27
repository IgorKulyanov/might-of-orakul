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
    return 99;
  }
}

function manaWeight(cardId: string, faction: Faction): number {
  try {
    const c = getCard(cardId);
    const cost = c.manaCost ?? {};
    let w = manaCostTotal(cost);
    for (const [f, n] of Object.entries(cost)) {
      if (f !== faction && (n ?? 0) > 0) w += (n ?? 0) * 1.5;
    }
    return w;
  } catch {
    return 99;
  }
}

/** Карты, которыми бот не имеет права давить игрока. */
function botForbiddenCard(id: string, level: number): boolean {
  // Камни маны — магазинный кит; боту только на очень высоком уровне
  if (id === "mana_stones") return level < 35;
  // «Доп. карта» (рамп добора) — не раньше середины/конца
  if (id === "extra_card") return level < 18;
  return false;
}

/**
 * Сколько колоды можно забить чужими школами (0…~0.32).
 * Растёт плавно — не ломает раннюю игру.
 */
export function offFactionMixRatio(level: number): number {
  const lv = Math.max(1, level);
  if (lv <= 4) return 0;
  if (lv <= 7) return 0.1;
  if (lv <= 11) return 0.18;
  if (lv <= 17) return 0.24;
  if (lv <= 27) return 0.3;
  return 0.32;
}

function isOwnOrNeutral(school: School, cardSchool: School): boolean {
  return cardSchool === school || cardSchool === "neutral";
}

/**
 * Пул карт, доступных оракулу данного уровня:
 * своя школа + нейтрал; с ур.5+ — постепенно чужие школы (тир ≤ maxTier).
 */
export function botPoolForLevel(level: number, school: School): string[] {
  const maxTier = maxTierForLevel(level);
  const allowOff = offFactionMixRatio(level) > 0;
  return CARDS.filter((c) => {
    if (c.kind !== "creature" && c.kind !== "spell") return false;
    if (botForbiddenCard(c.id, level)) return false;
    const t = c.unitLevel ?? 1;
    if (t < 1 || t > maxTier) return false;
    if (isOwnOrNeutral(school, c.school)) return true;
    // Чужие школы: только существа (без чужого спама спеллов) и не выше тира II рано
    if (!allowOff || c.kind !== "creature") return false;
    if (level < 12 && t > 2) return false;
    return true;
  }).map((c) => c.id);
}

/**
 * Размер колоды бота: на старте короче, чтобы не «добивать» тиром.
 */
export function botDeckSizeForLevel(level: number): number {
  const lv = Math.max(1, level);
  if (lv <= 3) return lv <= 1 ? 4 : lv === 2 ? 5 : 6;
  if (lv <= 5) return 10;
  if (lv <= 7) return 12;
  if (lv <= 11) return 16;
  if (lv <= 17) return 20;
  return DECK_SIZE;
}

/**
 * Обучающая колода = старт школы (+копии своих существ).
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
 * Колода бота «равного» уровня: тир ≤ уровню, школа героя + нейтрал.
 * Ур. 1–3 — почти стартовая колода.
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
        (c.school === faction || c.school === "neutral") &&
        !botForbiddenCard(c.id, level),
    ).map((c) => c.id);
    return fillDeckAggressive(
      fallback.length ? fallback : ["hero_mana"],
      level,
      faction,
    );
  }
  return fillDeckAggressive(pool, level, faction);
}

function rampIdsForLevel(level: number, maxTier: number): string[] {
  // Один «Доп. мана» на старте — без дабла и без «Доп. карты»
  if (level <= 10) return ["hero_mana"];
  if (level <= 17 || maxTier < 2) return ["hero_mana", "hero_mana"];
  // extra_card уже отфильтруется forbidden < 18
  return ["hero_mana", "hero_mana", "extra_card"];
}

function maxSpellSlots(level: number, target: number): number {
  if (level <= 7) return Math.min(2, Math.floor(target * 0.2));
  if (level <= 14) return Math.min(3, Math.floor(target * 0.22));
  if (level <= 24) return Math.min(4, Math.floor(target * 0.25));
  return Math.min(6, Math.floor(target * 0.28));
}

/**
 * Агрессивная колода: своя фракция + чуть рампа + плавный микс чужих школ.
 * Заклинаний мало — без спама камней/допа.
 */
function fillDeckAggressive(
  pool: string[],
  level: number,
  faction: Faction,
): string[] {
  const target = botDeckSizeForLevel(level);
  const maxTier = maxTierForLevel(level);
  const allCreatures = pool
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

  const ownCreatures = allCreatures.filter((id) => {
    try {
      return isOwnOrNeutral(faction, getCard(id).school);
    } catch {
      return false;
    }
  });
  const offCreatures = allCreatures.filter((id) => {
    try {
      return !isOwnOrNeutral(faction, getCard(id).school);
    } catch {
      return false;
    }
  });
  // Своя школа в приоритете; чужие — дешёвые/низкий тир
  const creatures = [...ownCreatures, ...offCreatures];

  const spells = pool
    .filter((id) => {
      try {
        if (getCard(id).kind !== "spell") return false;
        if (botForbiddenCard(id, level)) return false;
        // Рамп кладём отдельно, не из общего пула спеллов
        if (id === "hero_mana" || id === "extra_card" || id === "mana_stones") {
          return false;
        }
        // Чужие спеллы в колоду не тащим
        if (!isOwnOrNeutral(faction, getCard(id).school)) return false;
        return true;
      } catch {
        return false;
      }
    })
    .sort((a, b) => manaWeight(a, faction) - manaWeight(b, faction));

  const ramp = rampIdsForLevel(level, maxTier).filter((id) => {
    try {
      getCard(id);
      if (botForbiddenCard(id, level)) return false;
      return cardTier(id) <= maxTier;
    } catch {
      return false;
    }
  });

  const out: string[] = [];
  const counts: Record<string, number> = {};
  const push = (id: string) => {
    if (out.length >= target) return false;
    if (botForbiddenCard(id, level)) return false;
    if (cardTier(id) > maxTier) return false;
    const max = maxCopiesForCard(id);
    if ((counts[id] ?? 0) >= max) return false;
    out.push(id);
    counts[id] = (counts[id] ?? 0) + 1;
    return true;
  };

  const spellBudget = maxSpellSlots(level, target);
  const rampBudget = Math.min(ramp.length, level <= 10 ? 1 : 2);
  const creatureSlots = Math.max(
    1,
    target - spellBudget - rampBudget,
  );
  const offBudget = Math.min(
    offCreatures.length,
    Math.floor(creatureSlots * offFactionMixRatio(level)),
  );

  // Сначала чуть чужих школ (интерес / разнообразие), потом своя
  let offAdded = 0;
  let oi = 0;
  let guard = 0;
  while (
    offAdded < offBudget &&
    offCreatures.length > 0 &&
    out.length < creatureSlots &&
    guard < target * 40
  ) {
    if (push(offCreatures[oi % offCreatures.length]!)) offAdded++;
    oi++;
    guard++;
  }

  let ci = 0;
  guard = 0;
  while (
    out.length < creatureSlots &&
    ownCreatures.length > 0 &&
    guard < target * 80
  ) {
    push(ownCreatures[ci % ownCreatures.length]!);
    ci++;
    guard++;
  }
  // Добор существами из общего списка, если своей школы мало
  ci = 0;
  guard = 0;
  while (
    out.length < creatureSlots &&
    creatures.length > 0 &&
    guard < target * 80
  ) {
    push(creatures[ci % creatures.length]!);
    ci++;
    guard++;
  }

  let rampAdded = 0;
  for (const id of ramp) {
    if (rampAdded >= rampBudget) break;
    if (push(id)) rampAdded++;
  }

  let spellsAdded = 0;
  let si = 0;
  guard = 0;
  while (
    out.length < target &&
    spellsAdded < spellBudget &&
    spells.length > 0 &&
    guard < target * 80
  ) {
    if (push(spells[si % spells.length]!)) spellsAdded++;
    si++;
    guard++;
  }

  // Добор только существами / стартом — не добиваем колоду спеллами
  guard = 0;
  while (out.length < target && creatures.length > 0 && guard < target * 80) {
    push(creatures[guard % creatures.length]!);
    guard++;
  }

  if (out.length < target) {
    for (const id of starterDeckForFaction(faction)) {
      try {
        // Финальный добор — только существа, иначе снова зальём спеллами
        if (getCard(id).kind !== "creature") continue;
      } catch {
        continue;
      }
      if (!push(id)) continue;
      if (out.length >= target) break;
    }
  }

  return out.slice(0, target);
}

/**
 * Уровень бота «рядом»: на старте равный, позже чуть выше.
 */
export function botLevelNear(playerLevel: number): number {
  const lv = Math.max(1, Math.min(50, playerLevel));
  if (lv <= 8) return lv;
  return Math.min(50, lv + 1);
}

/** Герой бота: другая раса при возможности. */
export function botHeroIdFor(playerHeroId: string, botLevel: number): string {
  const yours = getHero(playerHeroId).faction;
  const others = BASE_HEROES.filter((h) => h.faction !== yours);
  const list = others.length ? others : BASE_HEROES;
  return list[Math.abs(botLevel + playerHeroId.length) % list.length]!.id;
}
