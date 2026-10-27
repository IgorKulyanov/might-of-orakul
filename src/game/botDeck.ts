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
 * Чуть раньше тиры II–IV — иначе бот отстаёт от прокачанной колоды игрока.
 * 1–5 → I; 6–14 → II; 15–24 → III; 25–36 → IV; 37+ → V.
 */
export function maxTierForLevel(level: number): 1 | 2 | 3 | 4 | 5 {
  if (level >= 37) return 5;
  if (level >= 25) return 4;
  if (level >= 15) return 3;
  if (level >= 6) return 2;
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

/** Сила карты за ману — бот набирает «жирные» для стоимости, не мусор. */
function creatureValue(cardId: string, faction: Faction): number {
  try {
    const c = getCard(cardId);
    const power =
      (c.attack ?? 0) * 3.2 +
      (c.health ?? 0) * 2.1 +
      (c.unitLevel ?? 1) * 5 +
      (c.onPlayHealHero ?? 0) * 1.5;
    const cost = Math.max(1, manaWeight(cardId, faction));
    return power / cost + (c.unitLevel ?? 1) * 0.35;
  } catch {
    return 0;
  }
}

/** Карты, которыми бот не имеет права давить игрока. */
function botForbiddenCard(id: string, level: number): boolean {
  // Камни маны — всё ещё не с низких уровней
  if (id === "mana_stones") return level < 22;
  // «Доп. карта» — раньше, чтобы бот не задыхался без добора
  if (id === "extra_card") return level < 10;
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
 * Размер колоды бота: на старте чуть короче, дальше быстро догоняет игрока.
 */
export function botDeckSizeForLevel(level: number): number {
  const lv = Math.max(1, level);
  if (lv <= 1) return 6;
  if (lv === 2) return 8;
  if (lv === 3) return 10;
  if (lv <= 5) return 14;
  if (lv <= 7) return 18;
  if (lv <= 11) return 22;
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
  if (level <= 6) return ["hero_mana"];
  if (level <= 12 || maxTier < 2) return ["hero_mana", "hero_mana"];
  // extra_card отфильтруется forbidden < 10
  return ["hero_mana", "hero_mana", "extra_card"];
}

function maxSpellSlots(level: number, target: number, persona: BotPersona): number {
  // Больше снятия/давления — бот не играет «только твари»
  let base =
    level <= 5
      ? Math.min(3, Math.floor(target * 0.24))
      : level <= 12
        ? Math.min(4, Math.floor(target * 0.28))
        : level <= 22
          ? Math.min(6, Math.floor(target * 0.3))
          : Math.min(7, Math.floor(target * 0.32));
  if (persona === "control") base = Math.min(base + 2, Math.floor(target * 0.42));
  if (persona === "aggro" || persona === "swarm") base = Math.max(2, base - 1);
  if (persona === "ramp") base = Math.max(2, base - 1);
  return base;
}

/**
 * Меньше = раньше в колоду.
 * База — высокая value; персона крутит кривую, не заменяет силу на мусор.
 */
function personaCreatureBias(
  cardId: string,
  faction: Faction,
  persona: BotPersona,
): number {
  const w = manaWeight(cardId, faction);
  const val = creatureValue(cardId, faction);
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
  // Чем выше value — тем раньше (меньше bias)
  const base = 12 - val * 2.2;
  switch (persona) {
    case "aggro":
      return base + w * 0.55 - atk * 0.9 + (w <= 3 ? -2 : 1);
    case "swarm":
      return base + w * 0.9 - (w <= 2 ? 5 : 0);
    case "control":
      return base + w * 0.25 - hp * 0.4 - t * 0.5;
    case "ramp":
      return base - t * 1.4 + (w <= 2 ? 2 : -w * 0.35);
    default:
      return base + w * 0.2 - t * 0.35;
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

  const spellImpact = (id: string): number => {
    try {
      const effects = getCard(id).spellEffects ?? [];
      let s = 0;
      for (const e of effects) {
        if (e.type === "damage_unit") s += 6 + (e.amount ?? 0);
        else if (e.type === "damage_hero") s += 5 + (e.amount ?? 0);
        else if (e.type === "banish_unit" || e.type === "bounce_enemy_hand") s += 10;
        else if (e.type === "poison") s += 8;
        else if (e.type === "heal_hero") s += 3;
        else if (e.type === "draw") s += 4;
      }
      return s - manaWeight(id, faction) * 0.4;
    } catch {
      return -99;
    }
  };

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
    .sort(
      (a, b) =>
        spellImpact(b) - spellImpact(a) ||
        manaWeight(a, faction) - manaWeight(b, faction),
    );
  if (rng && spells.length > 1) {
    const jittered = spells.map((id) => ({
      id,
      k: -spellImpact(id) + rng() * 2.5,
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

  // Ядро колоды — лучшие ~65% своей школы, не весь слабый хвост пула
  const eliteOwn = ownCreatures.slice(
    0,
    Math.max(4, Math.ceil(ownCreatures.length * 0.65)),
  );
  let ci = 0;
  guard = 0;
  while (
    out.length < creatureSlots &&
    eliteOwn.length > 0 &&
    guard < target * 80
  ) {
    push(eliteOwn[ci % eliteOwn.length]!);
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
 * Уровень бота: с самого начала чуть выше, потом заметный зазор —
 * иначе прокачанная колода игрока всегда давит «равного» бота.
 */
export function botLevelNear(playerLevel: number): number {
  const lv = Math.max(1, Math.min(50, playerLevel));
  if (lv <= 3) return lv;
  if (lv <= 7) return Math.min(50, lv + 1);
  if (lv <= 14) return Math.min(50, lv + 2);
  if (lv <= 24) return Math.min(50, lv + 2);
  return Math.min(50, lv + 3);
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
