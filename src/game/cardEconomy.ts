/**
 * Цены и осколки по силе/полезности КАЖДОЙ карты.
 * Ценник магазина = цена за 1 осколок (золото или алмазы).
 * В оракул карта попадает только после набора осколков на ур.1 (unlock).
 *
 * Жёсткие полки по тиру: II всегда дороже I, III дороже II и т.д.
 * Внутри тира — разброс по силе/интересности.
 */
import type {
  AttackPattern,
  CardDef,
  CreatureAbility,
  SpellEffect,
} from "./types";

/** Ориентир «середины» полки (для подсказок/совместимости). */
export const TIER_SHARD_PRICE: Record<
  1 | 2 | 3 | 4 | 5,
  { gold: number; diamonds: number }
> = {
  1: { gold: 70, diamonds: 6 },
  2: { gold: 110, diamonds: 12 },
  3: { gold: 260, diamonds: 28 },
  4: { gold: 600, diamonds: 55 },
  5: { gold: 1300, diamonds: 100 },
};

export const TIER_SHARD_NEED: Record<
  1 | 2 | 3 | 4 | 5,
  { unlock: number; to2: number; to3: number }
> = {
  1: { unlock: 20, to2: 65, to3: 150 },
  2: { unlock: 40, to2: 80, to3: 190 },
  3: { unlock: 65, to2: 110, to3: 250 },
  4: { unlock: 110, to2: 160, to3: 340 },
  5: { unlock: 170, to2: 220, to3: 500 },
};

/** Непересекающиеся полки: max(T) < min(T+1). */
const TIER_BAND: Record<
  1 | 2 | 3 | 4 | 5,
  {
    gold: [number, number];
    diamonds: [number, number];
    unlock: [number, number];
    to2: [number, number];
    to3: [number, number];
  }
> = {
  1: {
    // Ценник и кач L2 не ниже 60 — иначе «ур.2 за копейки».
    gold: [60, 95],
    diamonds: [5, 10],
    unlock: [16, 28],
    to2: [60, 80],
    to3: [140, 200],
  },
  2: {
    gold: [100, 160],
    diamonds: [10, 20],
    unlock: [32, 48],
    to2: [70, 100],
    to3: [170, 250],
  },
  3: {
    gold: [190, 360],
    diamonds: [22, 42],
    unlock: [55, 85],
    to2: [100, 140],
    to3: [230, 320],
  },
  4: {
    gold: [420, 820],
    diamonds: [48, 85],
    unlock: [95, 140],
    to2: [150, 210],
    to3: [330, 460],
  },
  5: {
    gold: [950, 1650],
    diamonds: [95, 145],
    unlock: [150, 210],
    to2: [220, 300],
    to3: [500, 700],
  },
};

const ABILITY_WEIGHT: Partial<Record<CreatureAbility, number>> = {
  arbiter_flex: 42,
  paladin_flex: 36,
  vampire_grow: 32,
  banshee_flex: 30,
  hornet_queen_flex: 30,
  gravedigger_flex: 28,
  necro_flex: 28,
  balthazar_flex: 28,
  unicorn_flex: 28,
  valkyrie_flex: 28,
  leshy_flex: 26,
  succubus_flex: 26,
  mage_flex: 24,
  triton_flex: 24,
  mermaid_flex: 24,
  inferno_flex: 24,
  angel_heal: 22,
  aquilite_swap: 20,
  school_mana_aura: 20,
  leprechaun_aura: 18,
  water_tide: 16,
  lich_drain: 18,
  basilisk_gaze: 18,
  skeleton_pack: 14,
  hornet_pack: 14,
  spider_poison: 10,
  scorpion_poison: 12,
  flame_burn: 12,
  imp_burn: 12,
  mana_steal: 16,
  riposte: 14,
  rush: 12,
  berserk_decay: 6,
  immune_spells: 24,
  immune_hell_death: 18,
  immune_death: 12,
};

const PATTERN_WEIGHT: Partial<Record<AttackPattern, number>> = {
  aoe_all: 32,
  cleave3: 18,
  lane_cleave3: 18,
  melee_lane3: 10,
  ranged: 9,
  melee: 0,
};

function manaTotal(card: CardDef): number {
  return Object.values(card.manaCost ?? {}).reduce(
    (s, n) => s + (Number(n) || 0),
    0,
  );
}

function hashSalt(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1000;
}

function spellEffectScore(e: SpellEffect): number {
  switch (e.type) {
    case "damage_all_enemies":
      return 14 + (e.amount ?? 0) * 3;
    case "damage_hero":
      return 8 + (e.amount ?? 0) * 2;
    case "damage_enemy":
      return 10 + (e.amount ?? 0) * 2;
    case "damage_unit":
      return 7 + (e.amount ?? 0) * 2;
    case "damage_undead":
      return 6 + (e.amount ?? 0) * 2;
    case "buff_permanent":
      return 12 + (e.attack ?? 0) * 3 + (e.health ?? 0) * 2;
    case "poison":
      return 10 + (e.amount ?? 0) * 3;
    case "heal_hero":
    case "heal_unit":
      return 6 + (e.amount ?? 0) * 1.5;
    case "draw":
      return 8 + (e.amount ?? 0) * 4;
    case "gain_mana":
      return 9 + (e.amount ?? 0) * 4;
    case "shield_ally":
      return 10 + (e.turns ?? 0) * 2;
    case "skip_combat":
      return 16;
    case "shuffle_board":
      return 12;
    case "extra_draw_turns":
      return 11 + (e.turns ?? 0) * 3;
    case "mute_ranged":
      return 12 + (e.turns ?? 0) * 2;
    case "weaken_foe_damage":
      return 13 + (e.turns ?? 0) * 2;
    case "sniper_buff":
      return 15 + (e.attack ?? 0) * 2 + (e.turns ?? 0) * 2;
    case "wake_all_allies":
      return 14;
    case "wake_ally":
      return 8;
    case "slow_enemy":
      return 7 + (e.amount ?? 0);
    default:
      return 8;
  }
}

/** Сырой балл силы/интересности внутри сравнения карт. */
export function cardPowerScore(card: CardDef): number {
  const mana = Math.max(1, manaTotal(card));
  let score = 0;

  if (card.kind === "creature") {
    const atk = Number(card.attack) || 0;
    const hp = Number(card.health) || 0;
    // Танк/урон важнее «дешёвой эффективности» 1-мановых казуалок.
    const combat = atk * 2.5 + hp * 1.15;
    score += combat;
    // Эффективность — слабый бонус, с потолком.
    score += Math.min(28, (combat / mana) * 2.2);
    // Дорогая мана сама по себе — признак «взрослой» карты.
    score += Math.max(0, mana - 1) * 6;
    if (card.attackPattern) {
      score += PATTERN_WEIGHT[card.attackPattern] ?? 0;
    }
    const abs = [
      ...(card.ability ? [card.ability] : []),
      ...(card.abilities ?? []),
    ];
    for (const a of abs) score += ABILITY_WEIGHT[a] ?? 10;
    if (card.onPlayHealHero) score += 4 + card.onPlayHealHero;
  } else {
    const effects = card.spellEffects ?? [];
    for (const e of effects) score += spellEffectScore(e);
    score += Math.min(24, (score / mana) * 2);
    score += Math.max(0, mana - 1) * 5;
    if (!effects.length) score += 8;
  }

  const text = (card.text ?? "").toLowerCase();
  if (text.includes(" или ")) score += 12;
  if (text.includes("щит")) score += 10;
  if (text.includes("всей арми") || text.includes("всем союз")) score += 14;
  if (text.includes("за убийство") || text.includes("при смерти")) score += 8;
  if (text.includes("яд") || text.includes("оглуш")) score += 5;
  if (text.includes("стая") || text.includes("рой")) score += 6;

  switch (card.rarity) {
    case "legendary":
      score += 18;
      break;
    case "epic":
      score += 12;
      break;
    case "rare":
      score += 6;
      break;
    default:
      break;
  }

  score += (hashSalt(card.id) % 11) * 0.4;
  return Math.max(1, score);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Ранг внутри тира 0..1 (по score).
 * Так II не пересекается с I, а паладин внутри III выше слабых соседей.
 */
export function withinTierRanks(
  cards: CardDef[],
): Map<string, number> {
  const byTier: Record<1 | 2 | 3 | 4 | 5, CardDef[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
  };
  for (const c of cards) byTier[shopTierOf(c)].push(c);
  const ranks = new Map<string, number>();
  for (const tier of [1, 2, 3, 4, 5] as const) {
    const list = byTier[tier]
      .map((c) => ({ id: c.id, score: cardPowerScore(c) }))
      .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
    const n = list.length;
    if (n === 0) continue;
    if (n === 1) {
      ranks.set(list[0]!.id, 0.55);
      continue;
    }
    for (let i = 0; i < n; i++) {
      ranks.set(list[i]!.id, 0.06 + (0.88 * i) / (n - 1));
    }
  }
  return ranks;
}

function roundGold(n: number): number {
  const x = Math.max(5, Math.round(n));
  if (x < 60) return x;
  if (x < 120) return Math.round(x / 5) * 5;
  if (x < 400) return Math.round(x / 10) * 10;
  if (x < 1000) return Math.round(x / 25) * 25;
  return Math.round(x / 50) * 50;
}

function roundDia(n: number): number {
  const x = Math.max(1, Math.round(n));
  if (x < 25) return x;
  if (x < 60) return Math.round(x / 2) * 2;
  if (x < 150) return Math.round(x / 5) * 5;
  return Math.round(x / 10) * 10;
}

function roundShards(n: number): number {
  return Math.max(10, Math.round(n / 2) * 2);
}

export function shopTierOf(card: CardDef): 1 | 2 | 3 | 4 | 5 {
  const ul = Math.floor(Number(card.unitLevel) || 0);
  if (ul >= 1 && ul <= 5) return ul as 1 | 2 | 3 | 4 | 5;
  switch (card.rarity) {
    case "legendary":
      return 5;
    case "epic":
      return 4;
    case "rare":
      return 3;
    default:
      return 1;
  }
}

/** Цена за 1 осколок. `rank01` — ранг внутри тира (0..1), иначе mid. */
export function shopPriceForCard(
  card: CardDef,
  rank01?: number,
): {
  gold: number;
  diamonds: number;
} {
  if (card.id === "mana_stones") {
    // Особый товар: не дешевле полки II и не ломает порядок тиров.
    return { gold: 160, diamonds: 18 };
  }
  const tier = shopTierOf(card);
  const band = TIER_BAND[tier];
  const t =
    rank01 != null && Number.isFinite(rank01)
      ? Math.max(0.02, Math.min(0.98, rank01))
      : 0.5;
  let gold = roundGold(lerp(band.gold[0], band.gold[1], t));
  let diamonds = roundDia(lerp(band.diamonds[0], band.diamonds[1], t));
  gold = Math.max(band.gold[0], Math.min(band.gold[1], gold));
  diamonds = Math.max(
    band.diamonds[0],
    Math.min(band.diamonds[1], diamonds),
  );
  return { gold, diamonds };
}

/** Сколько осколков нужно на unlock (ур.1) / L2 / L3 — полка тира + ранг внутри. */
export function shardNeedForCard(
  card: CardDef,
  rank01?: number,
): {
  unlock: number;
  to2: number;
  to3: number;
} {
  const tier = shopTierOf(card);
  const band = TIER_BAND[tier];
  const t =
    rank01 != null && Number.isFinite(rank01)
      ? Math.max(0.02, Math.min(0.98, rank01))
      : 0.5;
  return {
    unlock: roundShards(lerp(band.unlock[0], band.unlock[1], t)),
    to2: roundShards(lerp(band.to2[0], band.to2[1], t)),
    to3: roundShards(lerp(band.to3[0], band.to3[1], t)),
  };
}

/** Одна покупка по ценнику = ровно 1 осколок. */
export function shardsPerShopBuyAlways(): number {
  return 1;
}
