import {
  CARDS,
  DECK_SIZE,
  MIN_DECK_SIZE,
  countIds,
  expandDeckForBattle,
  getCard,
  maxCopiesForCard,
} from "./cards";
import {
  claimDaily,
  trackBattleForDailies,
  type DailyQuestId,
} from "./dailies";
import {
  EPIC_HERO_DIAMONDS,
  EPIC_HERO_GOLD,
  FACTIONS,
  getHero,
  isEpicHero,
} from "./heroes";
import { resolveBattleGift } from "./oracleGifts";
import {
  allStarterPoolIds,
  battleXp,
  battleGold,
  battleXpPvp,
  battleGoldPvp,
  grantXp,
  normalizeProgress,
  STARTER_UNITS_BY_FACTION,
  starterCollectionForFaction,
  starterDeckForFaction,
  starterUnlockIdsForFaction,
} from "./progression";
import {
  DIAMOND_PACK_MAP,
  GOLD_EXCHANGE_MAP,
  goldForDiamonds,
} from "./shop";
import type { Faction, OwnedState } from "./types";

/** v4 key; миграция копий — флаг COPIES_FLAG. */
const KEY = "arcane-duel-owned-v4";
const LEGACY_KEYS = [
  "arcane-duel-owned-v3",
  "arcane-duel-owned-v2",
  "arcane-duel-owned-v1",
];
const CASE_WIPE_FLAG = "arcane-duel-case-wipe-v4";
/** Одноразово: копии + старт из 4 карт (v3). */
const COPIES_FLAG = "arcane-duel-copies-v3";

/** Подарок новичку: хватает на пару покупок, не на всю мету. */
const START_GOLD = 250;
const START_DIAMONDS = 25;

function starterIds(heroId: string): string[] {
  const faction = getHero(heroId).faction;
  return starterUnlockIdsForFaction(faction);
}

function unlockedFromCollection(
  collection: Record<string, number>,
): string[] {
  return Object.keys(collection).filter((id) => (collection[id] ?? 0) > 0);
}

function mergeCollection(
  a: Record<string, number>,
  b: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [id, n] of Object.entries(b)) {
    const cap = maxCopiesForCard(id);
    out[id] = Math.min(cap, Math.max(out[id] ?? 0, n));
  }
  return out;
}

function collectionFromUnlocked(ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) {
    if (!id) continue;
    out[id] = Math.min(maxCopiesForCard(id), (out[id] ?? 0) + 1);
  }
  return out;
}

/**
 * Колода с копиями: не больше DECK_SIZE, не больше копий в коллекции / лимита карты.
 */
function normalizeDeck(
  cards: string[],
  collection?: Record<string, number>,
): string[] {
  const out: string[] = [];
  const used: Record<string, number> = {};
  for (const id of cards ?? []) {
    if (!id) continue;
    try {
      getCard(id);
    } catch {
      continue;
    }
    const cap = maxCopiesForCard(id);
    const ownedN = collection ? (collection[id] ?? 0) : cap;
    if (ownedN <= 0) continue;
    const have = used[id] ?? 0;
    if (have >= cap || have >= ownedN) continue;
    if (out.length >= DECK_SIZE) break;
    out.push(id);
    used[id] = have + 1;
  }
  return out;
}

/**
 * Кейс = старты своей расы + купленное + всё вне «старого бесплатного пула».
 */
function rebuildUnlocked(
  heroId: string,
  prevUnlocked: string[] | undefined,
  purchased: string[] | undefined,
): string[] {
  const starters = starterIds(heroId);
  const pool = new Set(allStarterPoolIds());
  const bought = new Set(purchased ?? []);
  const kept = (prevUnlocked ?? []).filter(
    (id) => bought.has(id) || !pool.has(id) || starters.includes(id),
  );
  return [...new Set([...starters, ...kept])];
}

function withDefaults(parsed: OwnedState): OwnedState {
  const heroId = parsed.heroId ?? "hero_life";
  const faction = getHero(heroId).faction;
  const starters = starterIds(heroId);
  const pool = new Set(allStarterPoolIds());
  const inferred = (parsed.unlocked ?? []).filter(
    (id) => pool.has(id) && !starters.includes(id),
  );
  const purchased = [...new Set([...(parsed.purchased ?? []), ...inferred])];
  const unlocked = rebuildUnlocked(heroId, parsed.unlocked, purchased);

  let collection: Record<string, number> = {
    ...collectionFromUnlocked(unlocked),
    ...(parsed.collection ?? {}),
  };
  // Гарантия: стартовый набор фракции целиком в коллекции
  collection = mergeCollection(collection, starterCollectionForFaction(faction));
  for (const id of unlocked) {
    if ((collection[id] ?? 0) < 1) collection[id] = 1;
  }
  // купленное — минимум 1
  for (const id of purchased) {
    if ((collection[id] ?? 0) < 1) collection[id] = 1;
  }

  const syncedUnlocked = [
    ...new Set([...unlocked, ...unlockedFromCollection(collection)]),
  ];

  const rawDecks = parsed.decks ?? { starter: [] };
  const decks: Record<string, string[]> = {};
  for (const [id, list] of Object.entries(rawDecks)) {
    decks[id] = normalizeDeck(list ?? [], collection);
  }
  if (!decks.starter) decks.starter = [];
  // Пустая / слишком короткая колода → стартовая 25
  if (decks.starter.length < MIN_DECK_SIZE) {
    decks.starter = normalizeDeck(starterDeckForFaction(faction), collection);
  }

  const progress = normalizeProgress({
    level: parsed.level,
    xp: parsed.xp,
  });
  return {
    unlocked: syncedUnlocked,
    collection,
    decks,
    activeDeckId: parsed.activeDeckId ?? "starter",
    heroId,
    homeFaction:
      parsed.homeFaction ??
      (parsed.heroId && parsed.heroId !== "hero_life"
        ? getHero(parsed.heroId).faction
        : parsed.homeFaction),
    gold: parsed.gold ?? START_GOLD,
    diamonds: parsed.diamonds ?? START_DIAMONDS,
    level: progress.level,
    xp: progress.xp,
    purchased,
    unlockedHeroes: [...new Set(parsed.unlockedHeroes ?? [])],
  };
}

function starterDeckFor(heroId: string): string[] {
  return starterDeckForFaction(getHero(heroId).faction);
}

function currentHeroFaction(owned: OwnedState): Faction {
  try {
    return getHero(owned.heroId ?? "hero_life").faction;
  } catch {
    return "life";
  }
}

/** Старты чужой расы в purchased = прежний дом (так помечает смена оракула). */
function inferFactionFromCards(owned: OwnedState): Faction | null {
  const purchased = owned.purchased ?? [];
  const unlocked = owned.unlocked ?? [];
  const current = currentHeroFaction(owned);
  const starterHits: Faction[] = [];
  for (const f of FACTIONS) {
    const [a, b] = STARTER_UNITS_BY_FACTION[f];
    if (purchased.includes(a) || purchased.includes(b)) starterHits.push(f);
  }
  const foreign = starterHits.filter((f) => f !== current);
  if (foreign.length === 1) return foreign[0]!;

  const counts: Record<Faction, number> = {
    water: 0,
    hell: 0,
    death: 0,
    life: 0,
    nature: 0,
  };
  for (const id of [...unlocked, ...purchased]) {
    try {
      const school = getCard(id).school;
      if (school in counts) counts[school as Faction] += 1;
    } catch {
      /* нет карты */
    }
  }
  let best: Faction | null = null;
  let bestN = 0;
  for (const f of FACTIONS) {
    if (counts[f] > bestN) {
      bestN = counts[f];
      best = f;
    }
  }
  if (best && best !== current && bestN >= 2 && bestN > counts[current]) {
    return best;
  }
  return null;
}

function heroIdForFaction(owned: OwnedState, faction: Faction): string {
  const epic = `hero_${faction}_epic`;
  if (
    (owned.unlockedHeroes ?? []).includes(epic) ||
    owned.heroId === epic
  ) {
    return epic;
  }
  return `hero_${faction}`;
}

/** Если сервер/сейв сменил расу, а в кейсе ещё старые карты — возвращаем дом. */
function repairOracleRace(owned: OwnedState): OwnedState {
  const blankOnboarding =
    !owned.homeFaction &&
    (owned.heroId ?? "hero_life") === "hero_life" &&
    (owned.level ?? 1) <= 1;
  if (blankOnboarding) return owned;

  const inferred = inferFactionFromCards(owned);
  const heroF = currentHeroFaction(owned);
  const faction = inferred ?? owned.homeFaction ?? heroF;
  const heroId = heroIdForFaction(owned, faction);
  if (
    owned.heroId === heroId &&
    owned.homeFaction === faction &&
    heroF === faction
  ) {
    return owned;
  }
  return setHero({ ...owned, homeFaction: faction }, heroId);
}

function freshOwned(heroId = "hero_life"): OwnedState {
  const faction = getHero(heroId).faction;
  const deck = starterDeckFor(heroId);
  return withDefaults({
    unlocked: starterIds(heroId),
    collection: starterCollectionForFaction(faction),
    decks: { starter: deck },
    activeDeckId: "starter",
    heroId,
    gold: START_GOLD,
    diamonds: START_DIAMONDS,
    level: 1,
    xp: 0,
  });
}

export function loadOwned(): OwnedState {
  try {
    const raw =
      localStorage.getItem(KEY) ??
      LEGACY_KEYS.map((k) => localStorage.getItem(k)).find(Boolean);
    if (raw) {
      const parsed = JSON.parse(raw) as OwnedState;
      if (parsed?.unlocked && parsed?.decks) {
        const heroId = parsed.heroId ?? "hero_life";
        const mustWipe = !localStorage.getItem(CASE_WIPE_FLAG);
        if (mustWipe) {
          const faction = getHero(heroId).faction;
          const next: OwnedState = {
            ...withDefaults({
              ...parsed,
              unlocked: starterIds(heroId),
              collection: starterCollectionForFaction(faction),
              decks: { starter: starterDeckFor(heroId) },
              activeDeckId: "starter",
              heroId,
            }),
          };
          localStorage.setItem(CASE_WIPE_FLAG, "1");
          localStorage.setItem(COPIES_FLAG, "1");
          const repaired = repairOracleRace(next);
          saveOwned(repaired);
          return repaired;
        }
        const next = withDefaults(parsed);
        if (!localStorage.getItem(COPIES_FLAG)) {
          // Миграция на копии: стартовая колода 25 + коллекция с копиями
          const faction =
            next.homeFaction ?? getHero(next.heroId ?? "hero_life").faction;
          next.collection = mergeCollection(
            next.collection ?? {},
            starterCollectionForFaction(faction),
          );
          next.unlocked = [
            ...new Set([
              ...next.unlocked,
              ...unlockedFromCollection(next.collection),
            ]),
          ];
          next.decks = {
            ...next.decks,
            starter: normalizeDeck(
              starterDeckForFaction(faction),
              next.collection,
            ),
          };
          localStorage.setItem(COPIES_FLAG, "1");
        }
        const active = next.decks[next.activeDeckId] ?? [];
        if (active.length < MIN_DECK_SIZE) {
          const faction =
            next.homeFaction ?? getHero(next.heroId ?? "hero_life").faction;
          next.decks[next.activeDeckId] = normalizeDeck(
            starterDeckForFaction(faction),
            next.collection,
          );
        }
        const repaired = repairOracleRace(next);
        saveOwned(repaired);
        return repaired;
      }
    }
  } catch {
    /* ignore */
  }
  const fresh = freshOwned();
  localStorage.setItem(CASE_WIPE_FLAG, "1");
  localStorage.setItem(COPIES_FLAG, "1");
  saveOwned(fresh);
  return fresh;
}

export function saveOwned(state: OwnedState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function ownedCopies(owned: OwnedState, cardId: string): number {
  return owned.collection?.[cardId] ?? (owned.unlocked.includes(cardId) ? 1 : 0);
}

export function isUnlocked(owned: OwnedState, cardId: string): boolean {
  return ownedCopies(owned, cardId) > 0;
}

/** Можно докупить ещё одну копию? */
export function canBuyAnotherCopy(owned: OwnedState, cardId: string): boolean {
  return ownedCopies(owned, cardId) < maxCopiesForCard(cardId);
}

export function playerLevel(owned: OwnedState): number {
  return normalizeProgress(owned).level;
}

/** @deprecated используй buyCardWithGold */
export function purchaseCard(owned: OwnedState, cardId: string): OwnedState {
  return buyCardWithGold(owned, cardId);
}

function addOwnedCopy(owned: OwnedState, cardId: string): OwnedState {
  const have = ownedCopies(owned, cardId);
  const cap = maxCopiesForCard(cardId);
  if (have >= cap) return owned;
  const collection = {
    ...(owned.collection ?? {}),
    [cardId]: have + 1,
  };
  const purchased = [...new Set([...(owned.purchased ?? []), cardId])];
  const unlocked = owned.unlocked.includes(cardId)
    ? owned.unlocked
    : [...owned.unlocked, cardId];
  return { ...owned, collection, purchased, unlocked };
}

export function buyCardWithGold(
  owned: OwnedState,
  cardId: string,
): OwnedState {
  const card = CARDS.find((c) => c.id === cardId);
  if (!card) return owned;
  if (!canBuyAnotherCopy(owned, cardId)) return owned;
  const price = card.priceGold ?? 0;
  const gold = owned.gold ?? 0;
  if (gold < price) return owned;
  const next = addOwnedCopy(
    { ...owned, gold: gold - price },
    cardId,
  );
  saveOwned(next);
  return next;
}

export function buyCardWithDiamonds(
  owned: OwnedState,
  cardId: string,
): OwnedState {
  const card = CARDS.find((c) => c.id === cardId);
  if (!card?.priceDiamonds) return owned;
  if (!canBuyAnotherCopy(owned, cardId)) return owned;
  const dia = owned.diamonds ?? 0;
  if (dia < card.priceDiamonds) return owned;
  const next = addOwnedCopy(
    { ...owned, diamonds: dia - card.priceDiamonds },
    cardId,
  );
  saveOwned(next);
  return next;
}

export function buyDiamondPack(
  owned: OwnedState,
  packId: string,
): OwnedState {
  const pack = DIAMOND_PACK_MAP[packId];
  if (!pack) return owned;
  const next: OwnedState = {
    ...owned,
    diamonds: (owned.diamonds ?? 0) + pack.diamonds,
  };
  saveOwned(next);
  return next;
}

export function exchangeDiamondsForGold(
  owned: OwnedState,
  exchangeId: string,
): OwnedState {
  const ex = GOLD_EXCHANGE_MAP[exchangeId];
  if (!ex) return owned;
  return exchangeDiamondsAmount(owned, ex.diamonds, ex.gold);
}

/**
 * Свободный обмен: списать `amount` алмазов.
 * Если `goldOverride` не задан — золото по курсу GOLD_PER_DIAMOND.
 */
export function exchangeDiamondsAmount(
  owned: OwnedState,
  amount: number,
  goldOverride?: number,
): OwnedState {
  const need = Math.floor(amount);
  if (need <= 0) return owned;
  const dia = owned.diamonds ?? 0;
  if (dia < need) return owned;
  const goldGain =
    goldOverride != null
      ? Math.max(0, Math.floor(goldOverride))
      : goldForDiamonds(need);
  if (goldGain <= 0) return owned;
  const next: OwnedState = {
    ...owned,
    diamonds: dia - need,
    gold: (owned.gold ?? 0) + goldGain,
  };
  saveOwned(next);
  return next;
}

export function setActiveDeck(owned: OwnedState, deckId: string): OwnedState {
  if (!owned.decks[deckId]) return owned;
  const next = { ...owned, activeDeckId: deckId };
  saveOwned(next);
  return next;
}

export function saveDeck(
  owned: OwnedState,
  deckId: string,
  cards: string[],
): OwnedState {
  const next = {
    ...owned,
    decks: {
      ...owned.decks,
      [deckId]: normalizeDeck(cards, owned.collection),
    },
    activeDeckId: deckId,
  };
  saveOwned(next);
  return next;
}

export function activeDeck(owned: OwnedState): string[] {
  return normalizeDeck(
    owned.decks[owned.activeDeckId] ?? [],
    owned.collection,
  );
}

/** Колода готова к бою (хватает карт). */
export function isDeckReady(owned: OwnedState): boolean {
  return activeDeck(owned).length >= MIN_DECK_SIZE;
}

/** Стопка на бой: как собрал, только shuffle. */
export function battleDeck(owned: OwnedState): string[] {
  return expandDeckForBattle(activeDeck(owned));
}

export function isHeroUnlocked(owned: OwnedState, heroId: string): boolean {
  try {
    if (!isEpicHero(heroId)) return true;
  } catch {
    return false;
  }
  return (owned.unlockedHeroes ?? []).includes(heroId);
}

/**
 * Старт аккаунта: обычный ИЛИ сразу эпик (за валюту).
 * Ставит homeFaction, стартовые карты расы, при эпике — открывает и надевает облик.
 * Базового оракула выбирать не обязательно.
 */
export function beginWithHero(
  owned: OwnedState,
  heroId: string,
  pay?: "gold" | "diamonds",
): { owned: OwnedState; ok: boolean; reason?: string } {
  let hero;
  try {
    hero = getHero(heroId);
  } catch {
    return { owned, ok: false, reason: "Нет такого оракула" };
  }

  const home = hero.faction;
  let state: OwnedState = {
    ...owned,
    homeFaction: home,
  };

  if (hero.tier === "epic") {
    if (!pay) {
      return {
        owned,
        ok: false,
        reason: "Эпик только за золото или кристаллы",
      };
    }
    const goldNeed = hero.priceGold ?? EPIC_HERO_GOLD;
    const diaNeed = hero.priceDiamonds ?? EPIC_HERO_DIAMONDS;
    if (pay === "gold") {
      if ((state.gold ?? 0) < goldNeed) {
        return { owned, ok: false, reason: `Нужно ${goldNeed}🪙` };
      }
      state = { ...state, gold: (state.gold ?? 0) - goldNeed };
    } else {
      if ((state.diamonds ?? 0) < diaNeed) {
        return { owned, ok: false, reason: `Нужно ${diaNeed}💎` };
      }
      state = { ...state, diamonds: (state.diamonds ?? 0) - diaNeed };
    }
    state = {
      ...state,
      unlockedHeroes: [
        ...new Set([...(state.unlockedHeroes ?? []), heroId]),
      ],
    };
  }

  const next = setHero(state, heroId);
  if (next.heroId !== heroId) {
    return { owned, ok: false, reason: "Не удалось назначить оракула" };
  }
  saveOwned(next);
  return { owned: next, ok: true };
}

export function buyEpicHero(
  owned: OwnedState,
  heroId: string,
  pay: "gold" | "diamonds",
): { owned: OwnedState; ok: boolean; reason?: string } {
  let hero;
  try {
    hero = getHero(heroId);
  } catch {
    return { owned, ok: false, reason: "Нет такого оракула" };
  }
  if (hero.tier !== "epic") {
    return { owned, ok: false, reason: "Этот оракул бесплатный" };
  }
  const home = homeFactionOf(owned);
  if (hero.faction !== home) {
    return {
      owned,
      ok: false,
      reason: "Эпик только своей фракции (выбор при создании)",
    };
  }
  if (isHeroUnlocked(owned, heroId)) {
    return { owned, ok: false, reason: "Уже куплен" };
  }
  const goldNeed = hero.priceGold ?? 20000;
  const diaNeed = hero.priceDiamonds ?? 2000;
  if (pay === "gold") {
    if ((owned.gold ?? 0) < goldNeed) {
      return { owned, ok: false, reason: "Не хватает золота" };
    }
  } else if ((owned.diamonds ?? 0) < diaNeed) {
    return { owned, ok: false, reason: "Не хватает кристаллов" };
  }

  // Сначала открываем эпик в сейве, потом надеваем — setHero иначе отвергнет.
  const unlockedHeroes = [
    ...new Set([...(owned.unlockedHeroes ?? []), heroId]),
  ];
  const paid: OwnedState = {
    ...owned,
    homeFaction: home,
    gold: pay === "gold" ? (owned.gold ?? 0) - goldNeed : owned.gold ?? 0,
    diamonds:
      pay === "diamonds"
        ? (owned.diamonds ?? 0) - diaNeed
        : owned.diamonds ?? 0,
    unlockedHeroes,
  };
  const equipped = setHero(paid, heroId);
  if (equipped.heroId !== heroId || !isHeroUnlocked(equipped, heroId)) {
    // Откат: деньги не списываем, если надеть не вышло.
    return { owned, ok: false, reason: "Покупка есть, но сменить облик не вышло" };
  }
  saveOwned(equipped);
  return { owned: equipped, ok: true };
}

/** Фракция аккаунта: зафиксирована при создании. */
export function homeFactionOf(owned: OwnedState): Faction {
  const fromHero = currentHeroFaction(owned);
  // Надетый оракул главнее кривого homeFaction с сервера.
  if (owned.homeFaction && owned.homeFaction !== fromHero) return fromHero;
  return owned.homeFaction ?? fromHero;
}

/** Можно ли поставить этого оракула (своя фракция + открыт). */
export function canSelectHero(owned: OwnedState, heroId: string): boolean {
  if (!isHeroUnlocked(owned, heroId)) return false;
  try {
    return getHero(heroId).faction === homeFactionOf(owned);
  } catch {
    return false;
  }
}

export function setHero(owned: OwnedState, heroId: string): OwnedState {
  if (!isHeroUnlocked(owned, heroId)) return owned;
  const hero = getHero(heroId);
  const equippedF = currentHeroFaction(owned);
  const home = owned.homeFaction;
  // Фракцию после создания не меняем — только если home совпадает с надетым оракулом.
  // Если homeFaction врёт (смерть качали, в сейве вдруг nature) — не блокируем ремонт.
  if (home && hero.faction !== home && equippedF === home) return owned;
  // Меняем расовый старт; купленное сохраняем (в т.ч. вампир и др. из старого пула)
  const unlocked = rebuildUnlocked(heroId, owned.unlocked, owned.purchased);
  let collection = mergeCollection(
    owned.collection ?? collectionFromUnlocked(unlocked),
    starterCollectionForFaction(hero.faction),
  );
  for (const id of unlocked) {
    if ((collection[id] ?? 0) < 1) collection[id] = 1;
  }
  const syncedUnlocked = [
    ...new Set([...unlocked, ...unlockedFromCollection(collection)]),
  ];
  const decks: Record<string, string[]> = {};
  for (const [id, list] of Object.entries(owned.decks)) {
    decks[id] = normalizeDeck(list ?? [], collection);
  }
  if (!decks.starter) decks.starter = [];
  // Смена расы / старт → полная стартовая колода этой школы
  const needNewStarter =
    !owned.homeFaction ||
    owned.homeFaction !== hero.faction ||
    (decks.starter?.length ?? 0) < MIN_DECK_SIZE;
  if (needNewStarter) {
    decks.starter = normalizeDeck(
      starterDeckForFaction(hero.faction),
      collection,
    );
  }
  const next: OwnedState = {
    ...owned,
    heroId,
    homeFaction: hero.faction,
    unlocked: syncedUnlocked,
    collection,
    decks,
  };
  saveOwned(next);
  return next;
}

export function activeHeroId(owned: OwnedState): string {
  return owned.heroId ?? "hero_life";
}

export type BattleRewardResult = {
  owned: OwnedState;
  xpGained: number;
  gainedLevels: number;
  goldReward: number;
  diamondReward: number;
  /** Строка дара оракула для таблички после боя. */
  giftLine: string | null;
};

/**
 * После боя: XP всегда.
 * По умолчанию + золото за бой и награды апа.
 * `xpOnly` (тропа): только опыт — без обычного золота/алмазов с боя и апов.
 * Дар света к золоту и дар ада к XP работают и в тропе.
 * Дар косы (смерть) — только в бою (+мана), не в мета-награде.
 */
export function applyBattleResult(
  owned: OwnedState,
  won: boolean,
  opts?: { xpOnly?: boolean; pvp?: boolean },
): BattleRewardResult {
  trackBattleForDailies(won);
  const progress = normalizeProgress(owned);
  const hero = getHero(activeHeroId(owned));
  const gift = resolveBattleGift(
    hero.faction,
    won,
    progress.level,
    hero.tier,
  );
  const pvp = !!opts?.pvp;
  const baseXp = pvp
    ? battleXpPvp(won, progress.level)
    : battleXp(won, progress.level);
  const xpGained = baseXp + gift.giftXp;
  const granted = grantXp(progress, xpGained);
  const xpOnly = !!opts?.xpOnly;
  const goldBonus = xpOnly
    ? 0
    : pvp
      ? battleGoldPvp(won, progress.level)
      : battleGold(won, progress.level);
  const goldReward =
    (xpOnly ? 0 : granted.totalGold + goldBonus) + gift.giftGold;
  const diamondReward = xpOnly ? 0 : granted.totalDiamonds;
  const next: OwnedState = {
    ...owned,
    level: granted.level,
    xp: granted.xp,
    gold: (owned.gold ?? 0) + goldReward,
    diamonds: (owned.diamonds ?? 0) + diamondReward,
  };
  saveOwned(next);
  return {
    owned: next,
    xpGained,
    gainedLevels: granted.gainedLevels,
    goldReward,
    diamondReward,
    giftLine: gift.giftLine,
  };
}

/** Забрать награду дейлика (золото сразу, XP через grantXp). */
export function claimDailyQuest(
  owned: OwnedState,
  questId: DailyQuestId,
): {
  owned: OwnedState;
  ok: boolean;
  xp: number;
  gold: number;
  reason?: string;
} {
  const { owned: withGold, claim } = claimDaily(owned, questId);
  if (!claim.ok) {
    return {
      owned,
      ok: false,
      xp: 0,
      gold: 0,
      reason: claim.reason,
    };
  }
  const progress = normalizeProgress(withGold);
  const granted = grantXp(progress, claim.xp);
  const next: OwnedState = {
    ...withGold,
    level: granted.level,
    xp: granted.xp,
    gold: (withGold.gold ?? 0) + granted.totalGold,
    diamonds: (withGold.diamonds ?? 0) + granted.totalDiamonds,
  };
  saveOwned(next);
  return {
    owned: next,
    ok: true,
    xp: claim.xp,
    gold: claim.gold + granted.totalGold,
  };
}

/** Сброс кейса/колоды до стартового набора фракции (25 карт с копиями). */
export function resetCaseToStarters(owned: OwnedState): OwnedState {
  const heroId = owned.heroId ?? "hero_life";
  const faction = getHero(heroId).faction;
  const collection = starterCollectionForFaction(faction);
  const next: OwnedState = {
    ...owned,
    unlocked: unlockedFromCollection(collection),
    collection,
    decks: { starter: starterDeckFor(heroId) },
    activeDeckId: "starter",
    purchased: [],
  };
  localStorage.setItem(CASE_WIPE_FLAG, "1");
  localStorage.setItem(COPIES_FLAG, "1");
  saveOwned(next);
  return next;
}

export { DECK_SIZE, MIN_DECK_SIZE, maxCopiesForCard, countIds };
