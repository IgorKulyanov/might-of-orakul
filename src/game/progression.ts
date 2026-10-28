/**
 * Прокачка аккаунта (как reward-track у ККИ: рано легко, дальше резко дороже).
 * Цель: ранние уровни быстро, 50 — марафон ~2 года при ~5 победах/день.
 */

import type { Faction } from "./types";
import {
  allStarterCardIds,
  starterCollectionForFaction,
  starterDeckForFaction,
} from "./starterDecks";

export const MAX_PLAYER_LEVEL = 50;
export const START_ORAUL_HP = 15;
export const MAX_ORAUL_HP = 50;

/** Опыт, нужный чтобы уйти с level на level+1 */
export function xpToNextLevel(level: number): number {
  if (level < 1) return xpToNextLevel(1);
  if (level >= MAX_PLAYER_LEVEL) return 0;
  /**
   * Плавный рост (квадратичный), без «стены» после mid-game.
   * Суммарно до 50 ≈ 430k XP → ~5 побед/день × ~120 XP ≈ ~2 года.
   * Ранние уровни всё ещё короче поздних, но ступенька за ступенькой.
   */
  const L = level;
  // ~180 на 1→2 … ~23k на 49→50; сумма до 50 ≈ 2 года гринда
  return Math.round(160 + 72 * L + 8.15 * L * L);
}

/** Суммарный XP от 1 уровня до начала `level` */
export function xpCumulativeToLevel(level: number): number {
  let sum = 0;
  const cap = Math.min(Math.max(level, 1), MAX_PLAYER_LEVEL);
  for (let l = 1; l < cap; l++) sum += xpToNextLevel(l);
  return sum;
}

/**
 * HP оракула по уровню: 15, затем +3 каждые 4 уровня → … → 50.
 * Полосы 15→18→21… совпадают с «быстро / медленнее» по XP.
 */
export function orakulHpForLevel(level: number): number {
  const lv = Math.min(MAX_PLAYER_LEVEL, Math.max(1, level));
  const tier = Math.min(12, Math.floor((lv - 1) / 4));
  return Math.min(MAX_ORAUL_HP, START_ORAUL_HP + tier * 3);
}

/** Бонус стартовой маны своей фракции (лёгкий, не ломает баланс). */
export function startManaBonus(level: number): number {
  return Math.min(4, Math.floor((Math.max(1, level) - 1) / 10));
}

export type LevelUpReward = { gold: number; diamonds: number };

/** Подарок за каждый новый уровень: фиксированно 50зол. и 1💎. */
export function levelUpReward(_newLevel: number): LevelUpReward {
  return { gold: 50, diamonds: 1 };
}

/**
 * Золото за бой — как drip в HS/Snap: копит медленно.
 * ~5 побед/день ≈ 55–70зол.; легенду (T5) не купить за вечер.
 */
export function battleGold(won: boolean, playerLevel: number): number {
  const lv = Math.max(1, playerLevel);
  if (won) return 10 + Math.floor(lv / 5);
  return 3;
}

export type ProgressState = {
  level: number;
  xp: number;
};

export function normalizeProgress(
  p?: Partial<ProgressState> | null,
): ProgressState {
  let level = Math.min(
    MAX_PLAYER_LEVEL,
    Math.max(1, Math.floor(p?.level ?? 1)),
  );
  let xp = Math.max(0, Math.floor(p?.xp ?? 0));
  while (level < MAX_PLAYER_LEVEL && xp >= xpToNextLevel(level)) {
    xp -= xpToNextLevel(level);
    level += 1;
  }
  if (level >= MAX_PLAYER_LEVEL) xp = 0;
  return { level, xp };
}

export type GrantXpResult = {
  level: number;
  xp: number;
  gainedLevels: number;
  rewards: LevelUpReward[];
  totalGold: number;
  totalDiamonds: number;
};

/** Начислить XP и собрать награды за все апы подряд. */
export function grantXp(
  current: ProgressState,
  amount: number,
): GrantXpResult {
  let { level, xp } = normalizeProgress(current);
  let left = Math.max(0, Math.floor(amount));
  const rewards: LevelUpReward[] = [];
  let gainedLevels = 0;
  let totalGold = 0;
  let totalDiamonds = 0;

  while (left > 0 && level < MAX_PLAYER_LEVEL) {
    const need = xpToNextLevel(level) - xp;
    if (left < need) {
      xp += left;
      left = 0;
      break;
    }
    left -= need;
    level += 1;
    xp = 0;
    gainedLevels += 1;
    const r = levelUpReward(level);
    rewards.push(r);
    totalGold += r.gold;
    totalDiamonds += r.diamonds;
  }

  return {
    level,
    xp,
    gainedLevels,
    rewards,
    totalGold,
    totalDiamonds,
  };
}

/** XP за соло-бой (победа заметно жирнее; лёгкий анти-афк за поражение). */
export function battleXp(won: boolean, playerLevel: number): number {
  const lv = Math.max(1, playerLevel);
  if (won) return 95 + lv * 6;
  return 28 + lv * 2;
}

/**
 * Множители сетевой дуэли vs бот.
 * Победа в PvP заметно жирнее; поражение чуть лучше бота — чтобы не боялись играть с людьми.
 */
export const PVP_REWARD = {
  winXpMult: 2,
  lossXpMult: 1.35,
  winGoldMult: 2.5,
  lossGoldMult: 2,
} as const;

export function battleXpPvp(won: boolean, playerLevel: number): number {
  const base = battleXp(won, playerLevel);
  const mult = won ? PVP_REWARD.winXpMult : PVP_REWARD.lossXpMult;
  return Math.max(1, Math.floor(base * mult));
}

export function battleGoldPvp(won: boolean, playerLevel: number): number {
  const base = battleGold(won, playerLevel);
  const mult = won ? PVP_REWARD.winGoldMult : PVP_REWARD.lossGoldMult;
  return Math.max(1, Math.floor(base * mult));
}

/**
 * Цены по тиру — намеренно жёсткие (гринд / донат).
 * Золото с боёв копит медленно; легенду не закрыть за вечер.
 */
export const UNIT_TIER_PRICE: Record<
  1 | 2 | 3 | 4 | 5,
  { gold: number; diamonds: number }
> = {
  1: { gold: 400, diamonds: 50 },
  2: { gold: 1100, diamonds: 120 },
  3: { gold: 2800, diamonds: 280 },
  4: { gold: 6500, diamonds: 550 },
  5: { gold: 14000, diamonds: 1000 },
};

export const UNIT_TIER_LABEL: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "I · новичок",
  2: "II · ученик",
  3: "III · воин",
  4: "IV · элита",
  5: "V · легенда",
};

/**
 * Старт: 4 карты ×1 (см. starterDecks.ts).
 * Ниже — совместимость со старыми миграциями.
 */
export const STARTER_UNITS_BY_FACTION: Record<Faction, [string, string]> = {
  life: ["spearman", "tank"],
  death: ["skeleton", "zombie"],
  water: ["water_spirit", "aquilite"],
  hell: ["fire_lizard", "fire_gopnik"],
  nature: ["elf", "spider"],
};

export const STARTER_SPELL_ID = "hero_mana";

export {
  allStarterCardIds as allStarterPoolIds,
  starterCollectionForFaction,
  starterDeckForFaction,
};

/** Уникальные id стартовой колоды фракции. */
export function starterUnlockIdsForFaction(faction: Faction): string[] {
  return [...new Set(starterDeckForFaction(faction))];
}

/** @deprecated */
export const STARTER_UNLOCK_IDS: string[] = [
  ...STARTER_UNITS_BY_FACTION.life,
  ...STARTER_UNITS_BY_FACTION.death,
  ...STARTER_UNITS_BY_FACTION.water,
  ...STARTER_UNITS_BY_FACTION.hell,
  ...STARTER_UNITS_BY_FACTION.nature,
  STARTER_SPELL_ID,
];
