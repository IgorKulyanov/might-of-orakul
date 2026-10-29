import { orakulHpForLevel } from "./progression";
import type { Faction, HeroTier } from "./types";

/** Дары фракций — только у эпических оракулов. */
export function isEpicGift(tier?: HeroTier | null): boolean {
  return tier === "epic";
}

/** HP оракула в бою; дар рощи только у эпика природы. */
export function orakulBattleHp(
  faction: Faction,
  level: number,
  tier?: HeroTier | null,
): number {
  const base = orakulHpForLevel(level);
  if (!isEpicGift(tier) || faction !== "nature") return base;
  return base + natureGiftHp(level);
}

/** Дар жизни: за победу +1 🪙 за уровень. */
export function lifeGiftGold(won: boolean, level: number): number {
  if (!won) return 0;
  return Math.max(1, Math.floor(level));
}

/** Дар ада: за победу +2 XP за уровень. */
export function hellGiftXp(won: boolean, level: number): number {
  if (!won) return 0;
  return Math.max(1, Math.floor(level)) * 2;
}

/** Эпик смерти с даром косы (мана в бою, не мета-награда). */
export function hasDeathScytheGift(
  faction: Faction,
  tier?: HeroTier | null,
): boolean {
  return isEpicGift(tier) && faction === "death";
}

/**
 * Дар воды: доп. стартовая мана воды.
 * +1 сразу, ещё +1 каждые 15 уровней → ур.1 = +1, ур.16 = +2, ур.31 = +3.
 */
export function waterGiftStartMana(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return 1 + Math.floor((lv - 1) / 15);
}

/**
 * Дар природы: +1 HP оракула за каждые 5 уровней.
 * ур.10 = +2, ур.25 = +5.
 */
export function natureGiftHp(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return Math.floor(lv / 5);
}

export function oracleGiftTitle(faction: Faction): string {
  switch (faction) {
    case "life":
      return "Дар света";
    case "hell":
      return "Дар ада";
    case "death":
      return "Дар косы";
    case "water":
      return "Дар пучины";
    case "nature":
      return "Дар рощи";
  }
}

/** Текст дара (только для эпика). */
export function oracleGiftCardText(faction: Faction, level: number): string {
  const lv = Math.max(1, Math.floor(level));
  switch (faction) {
    case "life":
      return `Дар света: за победу +${lifeGiftGold(true, lv)} зол. (+1 за уровень).`;
    case "hell":
      return `Дар ада: за победу +${hellGiftXp(true, lv)} XP (+2 за уровень).`;
    case "death":
      return `Дар косы: если за ход гибнет хотя бы один твой юнит смерти — +1 мана смерти.`;
    case "water":
      return `Дар пучины: старт боя +${waterGiftStartMana(lv)} маны воды (+1 сразу, ещё +1 / 15 ур.).`;
    case "nature":
      return `Дар рощи: +${natureGiftHp(lv)} HP оракула (+1 HP / 5 ур.).`;
  }
}

export type BattleGiftBreakdown = {
  giftGold: number;
  giftXp: number;
  giftLine: string | null;
};

const EMPTY_GIFT: BattleGiftBreakdown = {
  giftGold: 0,
  giftXp: 0,
  giftLine: null,
};

/** Разбор дара по итогам боя. Работает только у эпических оракулов. */
export function resolveBattleGift(
  faction: Faction,
  won: boolean,
  level: number,
  tier?: HeroTier | null,
): BattleGiftBreakdown {
  if (!isEpicGift(tier)) return EMPTY_GIFT;
  const lv = Math.max(1, Math.floor(level));
  switch (faction) {
    case "life": {
      const giftGold = lifeGiftGold(won, lv);
      return {
        giftGold,
        giftXp: 0,
        giftLine:
          giftGold > 0
            ? `${oracleGiftTitle("life")} +${giftGold} зол.`
            : null,
      };
    }
    case "hell": {
      const giftXp = hellGiftXp(won, lv);
      return {
        giftGold: 0,
        giftXp,
        giftLine:
          giftXp > 0 ? `${oracleGiftTitle("hell")} +${giftXp} XP` : null,
      };
    }
    case "death":
    case "water":
    case "nature":
      return EMPTY_GIFT;
  }
}
