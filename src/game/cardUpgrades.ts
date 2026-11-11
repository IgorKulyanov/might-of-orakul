/**
 * Прокачка карт (пилот: скелет).
 * Ур.1 — база без стаи; ур.2 — стая + статы (как «текущая» сила);
 * ур.3 — ещё статы + 50% от стрел.
 *
 * Без записи в сейве скелет считается ур.2 — чтобы не сломать текущие колоды.
 */
import type { OwnedState } from "./types";

export type CardUpgradeLevel = 1 | 2 | 3;

/** Стоимость осколков: открыть ур.1 / до ур.2 / до ур.3 (обычная). */
export const SHARD_COST_COMMON = {
  unlock: 20,
  to2: 80,
  to3: 150,
} as const;

export type CardUpgradeDef = {
  /** Бонус ATK/HP к базе из каталога на каждом уровне (≥1 уже база). */
  bonusAtk: [number, number, number];
  bonusHp: [number, number, number];
  /** Стая скелетов с этого уровня. */
  packFrom?: CardUpgradeLevel;
  /** −50% урона от стрел (elf/archer/crossbow ranged). */
  arrowWardFrom?: CardUpgradeLevel;
};

export const CARD_UPGRADE_DEFS: Record<string, CardUpgradeDef> = {
  skeleton: {
    // база JSON 3/8 → L1 3/8, L2 4/10, L3 5/12
    bonusAtk: [0, 1, 2],
    bonusHp: [0, 2, 4],
    packFrom: 2,
    arrowWardFrom: 3,
  },
};

export function isUpgradeableCard(cardId: string): boolean {
  return cardId in CARD_UPGRADE_DEFS;
}

/** Уровень по умолчанию, если в сейве пусто (скелет = 2, чтобы стая осталась). */
export function defaultUpgradeLevel(cardId: string): CardUpgradeLevel {
  if (cardId === "skeleton") return 2;
  return 1;
}

export function clampUpgradeLevel(n: unknown): CardUpgradeLevel {
  const v = Math.floor(Number(n) || 1);
  if (v >= 3) return 3;
  if (v <= 1) return 1;
  return 2;
}

export function getCardUpgradeLevel(
  owned: OwnedState | null | undefined,
  cardId: string,
): CardUpgradeLevel {
  const raw = owned?.cardUpgrades?.[cardId];
  if (raw == null) return defaultUpgradeLevel(cardId);
  return clampUpgradeLevel(raw);
}

export function getCardShards(
  owned: OwnedState | null | undefined,
  cardId: string,
): number {
  return Math.max(0, Math.floor(owned?.cardShards?.[cardId] ?? 0));
}

export function shardsNeededForNext(
  cardId: string,
  level: CardUpgradeLevel,
): number | null {
  if (!isUpgradeableCard(cardId)) return null;
  if (level >= 3) return null;
  if (level <= 1) return SHARD_COST_COMMON.to2;
  return SHARD_COST_COMMON.to3;
}

export function skeletonHasPack(level: CardUpgradeLevel): boolean {
  const def = CARD_UPGRADE_DEFS.skeleton;
  if (!def?.packFrom) return false;
  return level >= def.packFrom;
}

export function skeletonHasArrowWard(level: CardUpgradeLevel): boolean {
  const def = CARD_UPGRADE_DEFS.skeleton;
  if (!def?.arrowWardFrom) return false;
  return level >= def.arrowWardFrom;
}

export function upgradeStatBonus(
  cardId: string,
  level: CardUpgradeLevel,
): { atk: number; hp: number } {
  const def = CARD_UPGRADE_DEFS[cardId];
  if (!def) return { atk: 0, hp: 0 };
  const i = level - 1;
  return { atk: def.bonusAtk[i] ?? 0, hp: def.bonusHp[i] ?? 0 };
}

/** Короткая подпись текущего уровня (для плашки, не под картой). */
export function cardUpgradeBlurb(
  cardId: string,
  level: CardUpgradeLevel,
): string {
  if (cardId !== "skeleton") return "";
  if (level <= 1) return "Ур.1 — 3/8";
  if (level === 2) return "Ур.2 — 4/10, стая";
  return "Ур.3 — 5/12, стая, −50% стрел";
}

/** Выдать осколки (победа с ботом и т.п.). */
export function grantCardShards(
  owned: OwnedState,
  cardId: string,
  amount: number,
): OwnedState {
  if (amount <= 0 || !isUpgradeableCard(cardId)) return owned;
  const shards = { ...(owned.cardShards ?? {}) };
  shards[cardId] = Math.max(0, (shards[cardId] ?? 0) + amount);
  return { ...owned, cardShards: shards };
}

/**
 * Потратить осколки на следующий уровень.
 * Скелет без записи стартует как ур.2 — ап только в ур.3.
 */
export function tryUpgradeCard(
  owned: OwnedState,
  cardId: string,
): { owned: OwnedState; ok: boolean; reason?: string } {
  if (!isUpgradeableCard(cardId)) {
    return { owned, ok: false, reason: "Эту карту пока нельзя качать" };
  }
  const copies = owned.collection?.[cardId] ?? 0;
  if (copies <= 0 && !owned.unlocked.includes(cardId)) {
    return { owned, ok: false, reason: "Сначала открой карту" };
  }
  const level = getCardUpgradeLevel(owned, cardId);
  const need = shardsNeededForNext(cardId, level);
  if (need == null) {
    return { owned, ok: false, reason: "Уже максимальный уровень" };
  }
  const have = getCardShards(owned, cardId);
  if (have < need) {
    return {
      owned,
      ok: false,
      reason: `Нужно ${need} осколков (есть ${have})`,
    };
  }
  const shards = { ...(owned.cardShards ?? {}) };
  shards[cardId] = have - need;
  const upgrades = { ...(owned.cardUpgrades ?? {}) };
  const nextLevel = clampUpgradeLevel(level + 1);
  upgrades[cardId] = nextLevel;
  // сейв делает вызывающий (owned.save / onChange)
  return {
    owned: { ...owned, cardShards: shards, cardUpgrades: upgrades },
    ok: true,
  };
}

/**
 * Миграция: у кого скелет в коллекции и нет записи — ур.2 (стая как раньше).
 */
export function migrateCardUpgrades(owned: OwnedState): OwnedState {
  const hasSk =
    (owned.collection?.skeleton ?? 0) > 0 ||
    owned.unlocked.includes("skeleton");
  if (!hasSk) return owned;
  if (owned.cardUpgrades?.skeleton != null) return owned;
  return {
    ...owned,
    cardUpgrades: { ...(owned.cardUpgrades ?? {}), skeleton: 2 },
  };
}

/** Победа vs бот: 1–2 осколка скелета (пилот). */
export function rollBotWinShards(owned: OwnedState): {
  owned: OwnedState;
  gains: Array<{ cardId: string; amount: number; name: string }>;
} {
  const hasSk =
    (owned.collection?.skeleton ?? 0) > 0 ||
    owned.unlocked.includes("skeleton");
  if (!hasSk) return { owned, gains: [] };
  const amount = Math.random() < 0.5 ? 1 : 2;
  const next = grantCardShards(owned, "skeleton", amount);
  return {
    owned: next,
    gains: [{ cardId: "skeleton", amount, name: "Скелет" }],
  };
}
