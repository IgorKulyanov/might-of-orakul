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
  starterCollectionForFaction,
  starterDeckForFaction,
  starterUnlockIdsForFaction,
} from "./progression";
import { GOLD_EXCHANGE_MAP, goldForDiamonds } from "./shop";
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
/** Одноразово: старый старт 250🪙 → минимум 500🪙 / 25💎. */
const WALLET_V2_FLAG = "orakul-start-wallet-v2";
/** Одноразово: откат бесплатных демо-пакетов 💎 у ранних аккаунтов. */
const WALLET_V3_FLAG = "orakul-wallet-pack-fix-v1";

/** Подарок новичку: хватает на пару покупок, не на всю мету. */
export const START_GOLD = 500;
export const START_DIAMONDS = 25;

/** Догнать сейв до нового стартового кошелька (один раз). */
function applyStartWalletV2(owned: OwnedState): OwnedState {
  try {
    if (localStorage.getItem(WALLET_V2_FLAG) === "1") return owned;
    localStorage.setItem(WALLET_V2_FLAG, "1");
  } catch {
    return owned;
  }
  const gold = Math.max(Number(owned.gold) || 0, START_GOLD);
  const diamonds = Math.max(Number(owned.diamonds) || 0, START_DIAMONDS);
  if (gold === (owned.gold ?? 0) && diamonds === (owned.diamonds ?? 0)) {
    return owned;
  }
  return { ...owned, gold, diamonds };
}

/**
 * Демо-кнопки «купить 💎» раньше сыпали пакеты без оплаты.
 * У ранних игроков с раздутым кошельком — вернуть честный старт + апы.
 */
function applyWalletPackFix(owned: OwnedState): OwnedState {
  try {
    if (localStorage.getItem(WALLET_V3_FLAG) === "1") return owned;
    localStorage.setItem(WALLET_V3_FLAG, "1");
  } catch {
    return owned;
  }
  const level = Math.max(1, Math.floor(owned.level ?? 1));
  const dia = Number(owned.diamonds) || 0;
  const gold = Number(owned.gold) || 0;
  // Старт 25 + апы по 1; всё что ≥60 (минимальный пакет) на раннем уровне — мусор демо
  const fairDia = START_DIAMONDS + Math.max(0, level - 1);
  const fairGold = START_GOLD + Math.max(0, level - 1) * 50;
  if (level > 12 && dia < 80) return owned;
  if (dia < 60 && gold <= fairGold + 400) return owned;
  return {
    ...owned,
    diamonds: Math.min(dia, fairDia),
    gold: Math.min(gold, Math.max(fairGold, START_GOLD)),
  };
}

function applyWalletMigrations(owned: OwnedState): OwnedState {
  return applyWalletPackFix(applyStartWalletV2(owned));
}

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

/**
 * Убрать чужие бесплатные старты из коллекции (иначе кейс становится солянкой школ).
 * Купленное и карты вне стартового пула оставляем.
 */
function scrubCollectionForHero(
  heroId: string,
  collection: Record<string, number>,
  purchased: string[] | undefined,
): Record<string, number> {
  const faction = getHero(heroId).faction;
  const starters = new Set(starterIds(heroId));
  const pool = new Set(allStarterPoolIds());
  const bought = new Set(purchased ?? []);
  const cleaned: Record<string, number> = {};
  for (const [id, n] of Object.entries(collection)) {
    if ((n ?? 0) <= 0) continue;
    if (pool.has(id) && !starters.has(id) && !bought.has(id)) continue;
    cleaned[id] = n;
  }
  return mergeCollection(cleaned, starterCollectionForFaction(faction));
}

function withDefaults(parsed: OwnedState): OwnedState {
  const heroId = parsed.heroId ?? "hero_life";
  const faction = getHero(heroId).faction;
  // Только явные покупки — чужие старты в unlocked больше не считаем «купленным»
  const purchased = [...new Set(parsed.purchased ?? [])];
  const unlocked = rebuildUnlocked(heroId, parsed.unlocked, purchased);

  let collection = scrubCollectionForHero(
    heroId,
    {
      ...collectionFromUnlocked(unlocked),
      ...(parsed.collection ?? {}),
    },
    purchased,
  );
  for (const id of unlocked) {
    if ((collection[id] ?? 0) < 1) collection[id] = 1;
  }
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

/**
 * Только синхронизация hero ↔ homeFaction.
 * Раньше «угадывание» расы по картам кейса само меняло оракула
 * (смерть → ад) — убрано.
 */
function repairOracleRace(owned: OwnedState): OwnedState {
  const blankOnboarding =
    !owned.homeFaction &&
    (owned.heroId ?? "hero_life") === "hero_life" &&
    (owned.level ?? 1) <= 1;
  if (blankOnboarding) return owned;

  const heroF = currentHeroFaction(owned);
  const faction = owned.homeFaction ?? heroF;
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
          const repaired = applyWalletMigrations(repairOracleRace(next));
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
        const repaired = applyWalletMigrations(repairOracleRace(next));
        saveOwned(repaired);
        return repaired;
      }
    }
  } catch {
    /* ignore */
  }
  const fresh = applyWalletMigrations(freshOwned());
  localStorage.setItem(CASE_WIPE_FLAG, "1");
  localStorage.setItem(COPIES_FLAG, "1");
  try {
    localStorage.setItem(WALLET_V2_FLAG, "1");
    localStorage.setItem(WALLET_V3_FLAG, "1");
  } catch {
    /* ignore */
  }
  saveOwned(fresh);
  return fresh;
}

const OWNED_BACKUP_PREFIX = "orakul-owned-backup:";

/** Снимок сейва по логину — чтобы «Восстановить аккаунт» не обнулял колоду. */
export function backupOwnedForLogin(login: string, state: OwnedState): void {
  const key = login.trim().toLowerCase();
  if (!key) return;
  try {
    localStorage.setItem(`${OWNED_BACKUP_PREFIX}${key}`, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

export function loadOwnedBackup(login: string): OwnedState | null {
  const key = login.trim().toLowerCase();
  if (!key) return null;
  try {
    const raw = localStorage.getItem(`${OWNED_BACKUP_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OwnedState;
    if (!parsed?.decks) return null;
    return withDefaults(parsed);
  } catch {
    return null;
  }
}

export function saveOwned(state: OwnedState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
  try {
    const login = localStorage.getItem("orakul-last-login");
    if (login) backupOwnedForLogin(login, state);
  } catch {
    /* ignore */
  }
}

/** Есть ли у локального сейва реальный прогресс (не свежий онбординг). */
export function hasOwnedProgress(owned: OwnedState): boolean {
  if (owned.homeFaction) return true;
  if ((owned.level ?? 1) > 1) return true;
  if ((owned.purchased?.length ?? 0) > 0) return true;
  if ((owned.unlockedHeroes?.length ?? 0) > 0) return true;
  const copies = Object.values(owned.collection ?? {}).reduce(
    (s, n) => s + (Number(n) || 0),
    0,
  );
  if (copies > 6) return true;
  const deckLen = owned.decks?.[owned.activeDeckId ?? "starter"]?.length ?? 0;
  return deckLen > MIN_DECK_SIZE;
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

/** Компенсация / админ: выдать копию карты без оплаты. */
export function grantCardCopy(owned: OwnedState, cardId: string): OwnedState {
  if (!CARDS.some((c) => c.id === cardId)) return owned;
  return addOwnedCopy(owned, cardId);
}

/** Компенсация / админ: золото и алмазы. */
export function grantCurrency(
  owned: OwnedState,
  goldAdd: number,
  diamondsAdd: number,
): OwnedState {
  const g = Math.max(0, Math.floor(goldAdd) || 0);
  const d = Math.max(0, Math.floor(diamondsAdd) || 0);
  if (g <= 0 && d <= 0) return owned;
  return {
    ...owned,
    gold: Math.min(5_000_000, (owned.gold ?? 0) + g),
    diamonds: Math.min(100_000, (owned.diamonds ?? 0) + d),
  };
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

/**
 * Пакеты 💎 — витрина донат-магазина.
 * Пока оплаты нет: ничего не выдаём (раньше демо сыпало алмазы бесплатно).
 */
export function buyDiamondPack(
  owned: OwnedState,
  _packId: string,
): OwnedState {
  return owned;
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

  // Онбординг с чистого листа. Если уже есть прогресс (восстановление) — не сносить.
  if (!hasOwnedProgress(owned)) {
    state = {
      ...state,
      unlocked: starterIds(heroId),
      collection: starterCollectionForFaction(home),
      purchased: [],
      decks: { starter: [] },
      activeDeckId: "starter",
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

/** Можно ли поставить оракула: только своей школы. */
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
  const home = owned.homeFaction;
  // Школу после онбординга не меняем — только облик внутри фракции.
  if (home && hero.faction !== home) {
    return owned;
  }
  // Меняем расовый старт; купленное сохраняем. Чужие бесплатные старты — выкидываем.
  const unlocked = rebuildUnlocked(heroId, owned.unlocked, owned.purchased);
  let collection = scrubCollectionForHero(
    heroId,
    owned.collection ?? collectionFromUnlocked(unlocked),
    owned.purchased,
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
  // Только если колода реально пустая/короткая — не затирать собранную при смене облика
  if ((decks.starter?.length ?? 0) < MIN_DECK_SIZE) {
    decks.starter = normalizeDeck(
      starterDeckForFaction(hero.faction),
      collection,
    );
  }
  const next: OwnedState = {
    ...owned,
    heroId,
    homeFaction: home ?? hero.faction,
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

/** Забрать награду дейлика (золото/алмазы сразу, XP через grantXp). */
export function claimDailyQuest(
  owned: OwnedState,
  questId: DailyQuestId,
): {
  owned: OwnedState;
  ok: boolean;
  xp: number;
  gold: number;
  diamonds: number;
  reason?: string;
} {
  const { owned: withGold, claim } = claimDaily(owned, questId);
  if (!claim.ok) {
    return {
      owned,
      ok: false,
      xp: 0,
      gold: 0,
      diamonds: 0,
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
    diamonds: claim.diamonds + granted.totalDiamonds,
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
