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
 * Стиль соперника: влияет на состав колоды и приоритеты ИИ.
 * Каждый бой — свой, чтобы не было «одного и того же бота».
 */
export type BotPersona =
  | "aggro"
  | "midrange"
  | "control"
  | "ramp"
  | "swarm";

export const BOT_PERSONAS: BotPersona[] = [
  "aggro",
  "midrange",
  "control",
  "ramp",
  "swarm",
];

export type BotDeckOpts = {
  /** Seed боя — без него колода детерминирована (QA). */
  seed?: number;
  persona?: BotPersona;
};

export type BotMatch = {
  seed: number;
  persona: BotPersona;
  heroId: string;
  deck: string[];
  level: number;
};

/** LCG: стабильный рандом от seed (один бой = одна колода). */
export function makeBotRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function freshBotSeed(): number {
  return (
    (Date.now() ^ Math.floor(Math.random() * 0xffffffff) ^ 0x9e3779b9) >>> 0
  );
}

function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
  return arr;
}

export function pickBotPersona(rng: () => number): BotPersona {
  return BOT_PERSONAS[Math.floor(rng() * BOT_PERSONAS.length)]!;
}

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
 * С seed — слегка перемешиваем порядок добора.
 */
function fillDeckTutorial(
  faction: Faction,
  level: number,
  rng?: () => number,
): string[] {
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
  if (rng && creatures.length > 1) shuffleInPlace(creatures, rng);

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
  if (rng) shuffleInPlace(out, rng);
  return out.slice(0, target);
}

/**
 * Колода бота «равного» уровня: тир ≤ уровню, школа героя + нейтрал.
 * Ур. 1–3 — почти стартовая колода.
 * Без seed — как раньше (детерминированно, для QA).
 */
export function botDeckForLevel(
  level: number,
  school?: School,
  opts?: BotDeckOpts,
): string[] {
  const rng = opts?.seed != null ? makeBotRng(opts.seed ^ 0xdecafbad) : undefined;
  const persona = opts?.persona ?? (rng ? pickBotPersona(rng) : "midrange");

  const faction: Faction =
    school && school !== "neutral"
      ? school
      : FACTIONS[
          opts?.seed != null
            ? Math.floor(makeBotRng(opts.seed ^ 0x51)() * FACTIONS.length)
            : Math.abs(level) % FACTIONS.length
        ]!;

  if (level <= 3) {
    return fillDeckTutorial(faction, level, rng);
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
      persona,
      rng,
    );
  }
  return fillDeckAggressive(pool, level, faction, persona, rng);
}

function rampIdsForLevel(level: number, maxTier: number): string[] {
  // Один «Доп. мана» на старте — без дабла и без «Доп. карты»
  if (level <= 10) return ["hero_mana"];
  if (level <= 17 || maxTier < 2) return ["hero_mana", "hero_mana"];
  // extra_card уже отфильтруется forbidden < 18
  return ["hero_mana", "hero_mana", "extra_card"];
}

function maxSpellSlots(level: number, target: number, persona: BotPersona): number {
  let base =
    level <= 7
      ? Math.min(2, Math.floor(target * 0.2))
      : level <= 14
        ? Math.min(3, Math.floor(target * 0.22))
        : level <= 24
          ? Math.min(4, Math.floor(target * 0.25))
          : Math.min(6, Math.floor(target * 0.28));
  if (persona === "control") base = Math.min(base + 2, Math.floor(target * 0.4));
  if (persona === "aggro" || persona === "swarm") base = Math.max(1, base - 1);
  if (persona === "ramp") base = Math.max(1, base - 1);
  return base;
}

function personaCreatureBias(
  cardId: string,
  faction: Faction,
  persona: BotPersona,
): number {
  const w = manaWeight(cardId, faction);
  const t = cardTier(cardId);
  let atk = 0;
  let hp = 0;
  try {
    const c = getCard(cardId);
    atk = c.attack ?? 0;
    hp = c.health ?? 0;
  } catch {
    /* ignore */
  }
  switch (persona) {
    case "aggro":
      return w * 1.4 - atk * 0.8 + t * 0.3;
    case "swarm":
      return w * 1.8 - (w <= 2 ? 4 : 0);
    case "control":
      return w * 0.55 - hp * 0.35 + t * 0.2;
    case "ramp":
      return -t * 1.2 - w * 0.2 + (w <= 2 ? 3 : 0);
    default:
      return w + t * 0.15;
  }
}

/**
 * Колода под персону: своя фракция + рамп + микс чужих школ.
 * С rng — шаффл кандидатов, иначе старый детерминированный порядок.
 */
function fillDeckAggressive(
  pool: string[],
  level: number,
  faction: Faction,
  persona: BotPersona = "midrange",
  rng?: () => number,
): string[] {
  const target = botDeckSizeForLevel(level);
  const maxTier = maxTierForLevel(level);
  let allCreatures = pool
    .filter((id) => {
      try {
        return getCard(id).kind === "creature";
      } catch {
        return false;
      }
    })
    .sort(
      (a, b) =>
        personaCreatureBias(a, faction, persona) -
          personaCreatureBias(b, faction, persona) ||
        manaWeight(a, faction) - manaWeight(b, faction) ||
        cardTier(a) - cardTier(b),
    );

  if (rng) {
    // Лёгкий шаффл внутри «похожих» по стоимости — не одна и та же пачка
    const jittered = allCreatures.map((id, i) => ({
      id,
      k: personaCreatureBias(id, faction, persona) + rng() * 2.4 + i * 0.001,
    }));
    jittered.sort((a, b) => a.k - b.k);
    allCreatures = jittered.map((x) => x.id);
  }

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
  const creatures = [...ownCreatures, ...offCreatures];

  let spells = pool
    .filter((id) => {
      try {
        if (getCard(id).kind !== "spell") return false;
        if (botForbiddenCard(id, level)) return false;
        if (id === "hero_mana" || id === "extra_card" || id === "mana_stones") {
          return false;
        }
        if (!isOwnOrNeutral(faction, getCard(id).school)) return false;
        return true;
      } catch {
        return false;
      }
    })
    .sort((a, b) => manaWeight(a, faction) - manaWeight(b, faction));
  if (rng && spells.length > 1) {
    const jittered = spells.map((id) => ({
      id,
      k: manaWeight(id, faction) + rng() * 3,
    }));
    jittered.sort((a, b) => a.k - b.k);
    spells = jittered.map((x) => x.id);
  }

  let ramp = rampIdsForLevel(level, maxTier).filter((id) => {
    try {
      getCard(id);
      if (botForbiddenCard(id, level)) return false;
      return cardTier(id) <= maxTier;
    } catch {
      return false;
    }
  });
  if (persona === "ramp" && level >= 8) {
    ramp = [...ramp, "hero_mana"].filter((id) => !botForbiddenCard(id, level));
  }
  if (persona === "aggro" || persona === "swarm") {
    ramp = ramp.slice(0, 1);
  }

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

  const spellBudget = maxSpellSlots(level, target, persona);
  let rampBudget = Math.min(
    ramp.length,
    persona === "ramp" ? (level <= 10 ? 2 : 3) : level <= 10 ? 1 : 2,
  );
  if (persona === "aggro") rampBudget = Math.min(rampBudget, 1);

  const creatureSlots = Math.max(1, target - spellBudget - rampBudget);
  let offRatio = offFactionMixRatio(level);
  if (persona === "control") offRatio *= 0.7;
  if (persona === "swarm") offRatio *= 1.15;
  const offBudget = Math.min(
    offCreatures.length,
    Math.floor(creatureSlots * offRatio),
  );

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

  guard = 0;
  while (out.length < target && creatures.length > 0 && guard < target * 80) {
    push(creatures[guard % creatures.length]!);
    guard++;
  }

  if (out.length < target) {
    for (const id of starterDeckForFaction(faction)) {
      try {
        if (getCard(id).kind !== "creature") continue;
      } catch {
        continue;
      }
      if (!push(id)) continue;
      if (out.length >= target) break;
    }
  }

  if (rng) shuffleInPlace(out, rng);
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

/**
 * Герой бота: другая раса при возможности.
 * Без seed — детерминированно (QA); с seed — случайный другой оракул.
 */
export function botHeroIdFor(
  playerHeroId: string,
  botLevel: number,
  seed?: number,
): string {
  const yours = getHero(playerHeroId).faction;
  const others = BASE_HEROES.filter((h) => h.faction !== yours);
  const list = others.length ? others : BASE_HEROES;
  if (seed == null) {
    return list[Math.abs(botLevel + playerHeroId.length) % list.length]!.id;
  }
  const rng = makeBotRng(seed ^ 0xb01dface);
  // Иногда (высокий уровень) — эпик той же чужой школы, если есть в BASE
  return list[Math.floor(rng() * list.length)]!.id;
}

/**
 * Полный соперник на один бой: герой + персона + колода.
 * Новый seed → другой характер и набор карт.
 */
export function rollBotOpponent(
  playerHeroId: string,
  botLevel: number,
  seed = freshBotSeed(),
): BotMatch {
  const rng = makeBotRng(seed);
  const persona = pickBotPersona(rng);
  const heroId = botHeroIdFor(playerHeroId, botLevel, seed);
  const school = getHero(heroId).faction;
  const deck = botDeckForLevel(botLevel, school, { seed, persona });
  return { seed, persona, heroId, deck, level: botLevel };
}
