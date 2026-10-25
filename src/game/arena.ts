import {
  ALL_ARENA_MOD_IDS,
  type ArenaModId,
} from "./battleRules";
import { MAX_PLAYER_LEVEL } from "./progression";
import type { OwnedState } from "./types";

const KEY = "orakul-arena-v1";
export const ARENA_ROUNDS = 5;

export type ArenaState = {
  /** Сколько боёв выиграно сегодня подряд (0…5). */
  cleared: number;
  /** Лучшая серия за всё время. */
  bestStreak: number;
  /** День проигрыша — забег закрыт до завтра. */
  lostDay: string | null;
  /** Календарный день забега. */
  day: string;
  /** 5 модификаторов дня (порядок = раунды 1…5). */
  dayMods: ArenaModId[];
};

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Стабильный хэш строки → uint32. */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 5 модификаторов дня по сиду даты. */
export function arenaModsForDay(day = todayKey()): ArenaModId[] {
  const rnd = mulberry32(hashSeed(`arena:${day}`));
  const pool = [...ALL_ARENA_MOD_IDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = t;
  }
  return pool.slice(0, ARENA_ROUNDS);
}

function freshArena(day = todayKey()): ArenaState {
  return {
    cleared: 0,
    bestStreak: 0,
    lostDay: null,
    day,
    dayMods: arenaModsForDay(day),
  };
}

export function normalizeArena(
  raw?: Partial<ArenaState> | null,
): ArenaState {
  const today = todayKey();
  if (!raw || raw.day !== today) {
    const prevBest = Math.max(0, Math.floor(raw?.bestStreak ?? 0));
    return { ...freshArena(today), bestStreak: prevBest };
  }
  const mods =
    Array.isArray(raw.dayMods) && raw.dayMods.length === ARENA_ROUNDS
      ? (raw.dayMods as ArenaModId[])
      : arenaModsForDay(today);
  return {
    cleared: Math.min(
      ARENA_ROUNDS,
      Math.max(0, Math.floor(raw.cleared ?? 0)),
    ),
    bestStreak: Math.max(0, Math.floor(raw.bestStreak ?? 0)),
    lostDay: raw.lostDay === today ? today : null,
    day: today,
    dayMods: mods,
  };
}

export function loadArena(): ArenaState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ArenaState>;
      const next = normalizeArena(parsed);
      if (parsed.day !== next.day) saveArena(next);
      return next;
    }
  } catch {
    /* ignore */
  }
  const fresh = freshArena();
  saveArena(fresh);
  return fresh;
}

export function saveArena(state: ArenaState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function refreshArenaDay(state: ArenaState): ArenaState {
  const next = normalizeArena(state);
  saveArena(next);
  return next;
}

export function isArenaLockedToday(state: ArenaState): boolean {
  const s = normalizeArena(state);
  return s.lostDay === todayKey() || s.cleared >= ARENA_ROUNDS;
}

export function arenaRunComplete(state: ArenaState): boolean {
  return normalizeArena(state).cleared >= ARENA_ROUNDS;
}

/** Следующий раунд 1…5, или null если забег закрыт. */
export function nextArenaRound(state: ArenaState): number | null {
  const s = normalizeArena(state);
  if (s.lostDay === todayKey()) return null;
  if (s.cleared >= ARENA_ROUNDS) return null;
  return s.cleared + 1;
}

/** Моды, активные в бою раунда `round` (1…5). */
export function arenaModsForRound(
  state: ArenaState,
  round: number,
): ArenaModId[] {
  const s = normalizeArena(state);
  const n = Math.max(1, Math.min(ARENA_ROUNDS, round));
  return s.dayMods.slice(0, n);
}

export const ARENA_ROUND_REWARDS: Record<
  1 | 2 | 3 | 4 | 5,
  { gold: number; diamonds: number }
> = {
  1: { gold: 40, diamonds: 0 },
  2: { gold: 60, diamonds: 0 },
  3: { gold: 80, diamonds: 1 },
  4: { gold: 100, diamonds: 2 },
  5: { gold: 150, diamonds: 5 },
};

export function arenaFoeLevel(playerLevel: number, cleared: number): number {
  const lv = Math.max(1, Math.min(MAX_PLAYER_LEVEL, playerLevel));
  // cleared = уже выигранных; следующий бой сложнее
  return Math.max(1, Math.min(MAX_PLAYER_LEVEL, lv + cleared));
}

export type ArenaBattleResult = {
  arena: ArenaState;
  owned: OwnedState;
  gold: number;
  diamonds: number;
  round: number;
};

export function applyArenaWin(
  arena: ArenaState,
  owned: OwnedState,
  round: number,
): ArenaBattleResult {
  const s = normalizeArena(arena);
  if (round !== s.cleared + 1) {
    return { arena: s, owned, gold: 0, diamonds: 0, round };
  }
  const cleared = Math.min(ARENA_ROUNDS, s.cleared + 1);
  const reward = ARENA_ROUND_REWARDS[cleared as 1 | 2 | 3 | 4 | 5];
  const nextArena: ArenaState = {
    ...s,
    cleared,
    bestStreak: Math.max(s.bestStreak, cleared),
    lostDay: null,
    day: todayKey(),
  };
  saveArena(nextArena);
  const nextOwned: OwnedState = {
    ...owned,
    gold: (owned.gold ?? 0) + reward.gold,
    diamonds: (owned.diamonds ?? 0) + reward.diamonds,
  };
  return {
    arena: nextArena,
    owned: nextOwned,
    gold: reward.gold,
    diamonds: reward.diamonds,
    round: cleared,
  };
}

export function applyArenaLoss(arena: ArenaState): ArenaState {
  const today = todayKey();
  const next: ArenaState = {
    ...normalizeArena(arena),
    lostDay: today,
    day: today,
  };
  saveArena(next);
  return next;
}

/**
 * Сбросить сегодняшний забег (прогресс и локаут), правила дня те же.
 * Лучшая серия и уже выданные награды не трогаются.
 */
export function resetArenaRun(arena: ArenaState): ArenaState {
  const s = normalizeArena(arena);
  const next: ArenaState = {
    ...s,
    cleared: 0,
    lostDay: null,
    day: todayKey(),
    dayMods:
      s.dayMods.length === ARENA_ROUNDS
        ? s.dayMods
        : arenaModsForDay(todayKey()),
  };
  saveArena(next);
  return next;
}
