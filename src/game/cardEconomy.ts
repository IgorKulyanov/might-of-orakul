/**
 * Цены и осколки по силе/полезности КАЖДОЙ карты.
 * Ценник магазина = цена за 1 осколок (золото или алмазы).
 */
import type {
  AttackPattern,
  CardDef,
  CreatureAbility,
  SpellEffect,
} from "./types";

/** База тира ÷10 от старых ценников (400→40 и т.д.). */
export const TIER_SHARD_PRICE: Record<
  1 | 2 | 3 | 4 | 5,
  { gold: number; diamonds: number }
> = {
  1: { gold: 40, diamonds: 5 },
  2: { gold: 110, diamonds: 12 },
  3: { gold: 280, diamonds: 28 },
  4: { gold: 650, diamonds: 55 },
  5: { gold: 1400, diamonds: 100 },
};

/** База осколков на ап (потом множится силой карты). */
export const TIER_SHARD_NEED: Record<
  1 | 2 | 3 | 4 | 5,
  { to2: number; to3: number }
> = {
  1: { to2: 30, to3: 80 },
  2: { to2: 40, to3: 100 },
  3: { to2: 50, to3: 130 },
  4: { to2: 70, to3: 180 },
  5: { to2: 100, to3: 250 },
};

const ABILITY_WEIGHT: Partial<Record<CreatureAbility, number>> = {
  arbiter_flex: 38,
  vampire_grow: 30,
  banshee_flex: 28,
  hornet_queen_flex: 27,
  gravedigger_flex: 26,
  necro_flex: 26,
  balthazar_flex: 26,
  unicorn_flex: 25,
  leshy_flex: 24,
  valkyrie_flex: 24,
  succubus_flex: 24,
  mage_flex: 22,
  triton_flex: 22,
  mermaid_flex: 22,
  paladin_flex: 22,
  inferno_flex: 22,
  aquilite_swap: 20,
  skeleton_pack: 16,
  hornet_pack: 16,
  school_mana_aura: 18,
  leprechaun_aura: 18,
  water_tide: 16,
  angel_heal: 15,
  lich_drain: 17,
  basilisk_gaze: 18,
  spider_poison: 16,
  scorpion_poison: 16,
  flame_burn: 14,
  imp_burn: 14,
  mana_steal: 18,
  riposte: 14,
  rush: 12,
  berserk_decay: 8,
  immune_spells: 22,
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

/** Сырой балл силы/интересности (чем выше — тем дороже осколок и кач). */
export function cardPowerScore(card: CardDef): number {
  const mana = Math.max(1, manaTotal(card));
  let score = 0;

  if (card.kind === "creature") {
    const atk = Number(card.attack) || 0;
    const hp = Number(card.health) || 0;
    const combat = atk * 2.35 + hp;
    score += combat;
    score += (combat / mana) * 6;
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
    score += (score / mana) * 4;
    if (!effects.length) score += 8;
  }

  // Текст с «или» / гибкими выборами — обычно интереснее простой палки.
  const text = (card.text ?? "").toLowerCase();
  if (text.includes(" или ")) score += 8;
  if (text.includes("за убийство") || text.includes("при смерти")) score += 7;
  if (text.includes("яд") || text.includes("оглуш") || text.includes("щит")) {
    score += 5;
  }
  if (text.includes("стая") || text.includes("рой")) score += 6;

  const ul = Math.max(1, Math.min(5, Math.floor(Number(card.unitLevel) || 1)));
  score += (ul - 1) * 8;

  switch (card.rarity) {
    case "legendary":
      score += 22;
      break;
    case "epic":
      score += 14;
      break;
    case "rare":
      score += 7;
      break;
    default:
      break;
  }

  // Соль по id — меньше одинаковых цен у «похожих» статов.
  score += (hashSalt(card.id) % 17) * 0.35;
  return Math.max(1, score);
}

function roundGold(n: number): number {
  const x = Math.max(5, Math.round(n));
  if (x < 40) return Math.max(5, Math.round(x / 1) * 1);
  if (x < 100) return Math.round(x / 5) * 5;
  if (x < 400) return Math.round(x / 10) * 10;
  if (x < 1000) return Math.round(x / 25) * 25;
  return Math.round(x / 50) * 50;
}

function roundDia(n: number): number {
  const x = Math.max(1, Math.round(n));
  if (x < 20) return x;
  if (x < 60) return Math.round(x / 2) * 2;
  if (x < 150) return Math.round(x / 5) * 5;
  return Math.round(x / 10) * 10;
}

function roundShards(n: number): number {
  return Math.max(8, Math.round(n / 2) * 2);
}

/**
 * Норма силы внутри тира → множитель ~0.55…2.15.
 * mid/span подогнаны под реальные score существ (не «потолок» у всех).
 */
function powerMult(score: number, tier: 1 | 2 | 3 | 4 | 5): number {
  const mid = [0, 118, 145, 175, 210, 255][tier];
  const span = [0, 42, 50, 60, 75, 95][tier];
  const t = (score - mid) / span;
  const clamped = Math.max(-1.1, Math.min(1.45, t));
  return 1 + clamped * 0.62;
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

/** Цена за 1 осколок (и за первую покупку карты в оракул). */
export function shopPriceForCard(card: CardDef): {
  gold: number;
  diamonds: number;
} {
  if (card.id === "mana_stones") {
    return { gold: 200, diamonds: 20 };
  }
  const tier = shopTierOf(card);
  const base = TIER_SHARD_PRICE[tier];
  const score = cardPowerScore(card);
  const mult = powerMult(score, tier);
  // Лёгкий сдвиг по соли id — ещё меньше совпадений.
  const jitter = 0.94 + (hashSalt(card.id) % 13) * 0.01;
  return {
    gold: roundGold(base.gold * mult * jitter),
    diamonds: roundDia(base.diamonds * mult * jitter),
  };
}

/** Сколько осколков нужно на L2 / L3 — тоже от силы карты. */
export function shardNeedForCard(card: CardDef): {
  to2: number;
  to3: number;
} {
  const tier = shopTierOf(card);
  const base = TIER_SHARD_NEED[tier];
  // Без случайного jitter: сильнее карта → всегда дороже кач.
  const mult = powerMult(cardPowerScore(card), tier);
  return {
    to2: roundShards(base.to2 * mult),
    to3: roundShards(base.to3 * mult),
  };
}

/** Одна покупка по ценнику = ровно 1 осколок. */
export function shardsPerShopBuyAlways(): number {
  return 1;
}
