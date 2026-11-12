/**
 * Прокачка карт.
 * Существа всех школ + заклинания: осколки, L1–L3.
 * Старт с ур.1; L2/L3 — за осколки (в бою или за золото/алмазы в магазине).
 */
import {
  shardNeedForCard,
  shardsPerShopBuyAlways,
  TIER_SHARD_NEED,
} from "./cardEconomy";
import { CARD_TIER_RANK, getCard } from "./cards";
import { isCardAvailableInShop } from "./progression";
import type {
  AttackPattern,
  CreatureAbility,
  ManaCost,
  OwnedState,
  SpellEffect,
} from "./types";
import { upgradePlanLine } from "./cardUpgradePlan";

export type CardUpgradeLevel = 1 | 2 | 3;

/** База по тиру (фактический кач — через shardNeedForCard по силе карты). */
export const SHARD_COST_BY_TIER = TIER_SHARD_NEED;

/** Одна покупка ценника = 1 осколок (для любой карты). */
export const SHARDS_PER_SHOP_BUY: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 1,
  2: 1,
  3: 1,
  4: 1,
  5: 1,
};

/** @deprecated алиас на тир-1 */
export const SHARD_COST_COMMON = {
  unlock: 20,
  to2: SHARD_COST_BY_TIER[1].to2,
  to3: SHARD_COST_BY_TIER[1].to3,
} as const;

export function shardTierForCard(cardId: string): 1 | 2 | 3 | 4 | 5 {
  try {
    const c = getCard(cardId);
    const ul = Number(c.unitLevel);
    if (ul >= 1 && ul <= 5) return ul as 1 | 2 | 3 | 4 | 5;
    switch (c.rarity) {
      case "legendary":
        return 5;
      case "epic":
        return 4;
      case "rare":
        return 3;
      default:
        return 1;
    }
  } catch {
    return 1;
  }
}

export type CardUpgradeDef = {
  /** Бонус ATK/HP к базе из каталога (JSON ≈ ур.2 для жизни; скелет JSON = ур.1). */
  bonusAtk: [number, number, number];
  bonusHp: [number, number, number];
  /** Стая скелетов с этого уровня. */
  packFrom?: CardUpgradeLevel;
  /** −50% урона от стрел. */
  arrowWardFrom?: CardUpgradeLevel;
  /** Мин. уровень для ability / abilities. */
  abilityFrom?: Partial<Record<CreatureAbility, CardUpgradeLevel>>;
  /** Паттерн удара по уровню (иначе из КАРТЫ.json). */
  patternByLevel?: Partial<Record<CardUpgradeLevel, AttackPattern>>;
  /**
   * Стартовый уровень без записи в сейве.
   * Жизнь/скелет = 2, чтобы не ломать текущие колоды.
   */
  defaultLevel?: CardUpgradeLevel;
  /**
   * Заклинания: абсолютные числа по уровням.
   * Ключ = `поле` (amount/turns/attack/health) или `тип.поле` (poison.amount).
   */
  spellNums?: Record<string, [number, number, number]>;
  /** Доп. эффекты, которые появляются с указанного уровня. */
  spellExtraFrom?: Partial<Record<CardUpgradeLevel, SpellEffect[]>>;
};

const SPELL_STAT_ZERO: Pick<CardUpgradeDef, "bonusAtk" | "bonusHp" | "defaultLevel"> = {
  bonusAtk: [0, 0, 0],
  bonusHp: [0, 0, 0],
  defaultLevel: 1,
};

export const LIFE_UPGRADE_IDS = [
  "spearman",
  "crossbowman",
  "tank",
  "berserk",
  "mage",
  "valkyrie",
  "angel",
  "paladin",
  "colossus",
  "mech_guardian",
  "flamethrower",
] as const;

export const DEATH_UPGRADE_IDS = [
  "skeleton",
  "vampire",
  "gravedigger",
  "zombie",
  "hell_rider",
  "banshee",
  "bone_rex",
  "necro_mage",
  "lich",
] as const;

export const WATER_UPGRADE_IDS = [
  "water_golem",
  "water_spirit",
  "water_elemental",
  "triton",
  "aquilite",
  "clawfiend",
  "kraken",
  "mermaid",
] as const;

export const HELL_UPGRADE_IDS = [
  "fire_lizard",
  "fire_gopnik",
  "fire_golem",
  "fire_dragon",
  "cerberus",
  "imp",
  "inferno",
  "motardo",
  "succubus",
  "balthazar",
  "ifrit",
] as const;

export const NATURE_UPGRADE_IDS = [
  "werewolf",
  "elf",
  "spider",
  "hornet_warrior",
  "leprechaun",
  "ent",
  "basilisk",
  "hornet_queen",
  "arch_orc",
  "leshy",
  "veles",
  "unicorn",
] as const;

export const NEUTRAL_UPGRADE_IDS = [
  "orc",
  "troll",
  "goblin",
  "black_dragon",
  "mercenary",
  "recruit",
  "scorpicora",
  "wanderer",
  "rogue",
  "arbiter",
  "archer",
] as const;

/** Все заклинания каталога — те же осколки / L1–L3. */
export const SPELL_UPGRADE_IDS = [
  "poison",
  "strike",
  "undead_strike",
  "undead_bonus",
  "swamp",
  "hero_mana",
  "hell_cuffs",
  "fire_aura",
  "slow_foe",
  "mind_grab",
  "life_root",
  "ice_trap",
  "wave",
  "arrow_cloud",
  "shield",
  "calm",
  "hurricane",
  "extra_card",
  "to_attack",
  "banish",
  "antidote",
  "mass_antidote",
  "return_hand",
  "reveal_hand",
  "freeze",
  "discard_hand",
  "guardian_bond",
  "break_spell",
  "break_all_spells",
  "traitor",
  "fear",
  "marionette",
  "nothingness",
  "mana_stones",
  "mass_poison",
  "betrayer",
  "last_stand",
  "bunker",
  "clear_sky",
  "dust_eyes",
  "sniper",
  "change_hand",
  "awakening",
  "mass_reveille",
] as const;

export const CARD_UPGRADE_DEFS: Record<string, CardUpgradeDef> = {
  skeleton: {
    bonusAtk: [0, 1, 2],
    bonusHp: [0, 2, 4],
    packFrom: 2,
    arrowWardFrom: 3,
    defaultLevel: 1,
  },
  vampire: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { vampire_grow: 1 },
    defaultLevel: 1,
  },
  gravedigger: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { gravedigger_flex: 2 },
    defaultLevel: 1,
  },
  zombie: {
    bonusAtk: [0, 0, 0],
    bonusHp: [-4, 0, 4],
    defaultLevel: 1,
  },
  hell_rider: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [2, 0, 0],
    abilityFrom: { rush: 3 },
    defaultLevel: 1,
  },
  banshee: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { banshee_flex: 2 },
    defaultLevel: 1,
  },
  bone_rex: {
    bonusAtk: [0, 0, 0],
    bonusHp: [-4, 0, 0],
    abilityFrom: { immune_death: 2, immune_spells: 3 },
    defaultLevel: 1,
  },
  necro_mage: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { necro_flex: 2 },
    defaultLevel: 1,
  },
  lich: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { lich_drain: 2 },
    defaultLevel: 1,
  },
  water_golem: {
    bonusAtk: [-1, 0, 0],
    bonusHp: [-4, 0, 2],
    defaultLevel: 1,
  },
  water_spirit: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-2, 0, 0],
    defaultLevel: 1,
  },
  water_elemental: {
    bonusAtk: [-2, 0, 1],
    bonusHp: [-2, 0, 0],
    defaultLevel: 1,
  },
  triton: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { triton_flex: 2 },
    defaultLevel: 1,
  },
  aquilite: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { rush: 1, aquilite_swap: 2 },
    defaultLevel: 1,
  },
  clawfiend: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { water_tide: 2 },
    defaultLevel: 1,
  },
  kraken: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-8, 0, 0],
    defaultLevel: 1,
  },
  mermaid: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { mermaid_flex: 2 },
    defaultLevel: 1,
  },
  spearman: {
    // JSON = L2 (lane3). L1 только напротив.
    bonusAtk: [0, 0, 1],
    bonusHp: [0, 0, 0],
    patternByLevel: { 1: "melee", 2: "melee_lane3", 3: "melee_lane3" },
    defaultLevel: 1,
  },
  crossbowman: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { riposte: 2 },
    defaultLevel: 1,
  },
  tank: {
    // L1 меньше мяса, L3 чуть толще + щит призывом
    bonusAtk: [0, 0, 0],
    bonusHp: [-4, 0, 4],
    defaultLevel: 1,
  },
  berserk: {
    // L1 тоньше (−3/ход), L2 толще (−2/ход)
    bonusAtk: [0, 0, 0],
    bonusHp: [-4, 0, 0],
    abilityFrom: { berserk_decay: 1 },
    defaultLevel: 1,
  },
  mage: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { mage_flex: 2 },
    defaultLevel: 1,
  },
  valkyrie: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { valkyrie_flex: 2 },
    defaultLevel: 1,
  },
  angel: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { angel_heal: 2 },
    defaultLevel: 1,
  },
  paladin: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { paladin_flex: 2 },
    defaultLevel: 1,
  },
  colossus: {
    // Иммун убран с плана; L2 мана, L3 щит армии
    bonusAtk: [0, 0, 0],
    bonusHp: [-8, 0, 0],
    defaultLevel: 1,
  },
  mech_guardian: {
    bonusAtk: [0, 0, 0],
    bonusHp: [-6, 0, 0],
    abilityFrom: { immune_spells: 2 },
    defaultLevel: 1,
  },
  flamethrower: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { flame_burn: 3 },
    patternByLevel: { 1: "melee", 2: "cleave3", 3: "cleave3" },
    defaultLevel: 1,
  },
  fire_lizard: {
    bonusAtk: [-2, 0, 1],
    bonusHp: [-2, 0, 0],
    abilityFrom: { rush: 3 },
    defaultLevel: 1,
  },
  fire_gopnik: {
    bonusAtk: [-3, 0, 0],
    bonusHp: [-2, 0, 0],
    abilityFrom: { flame_burn: 3 },
    defaultLevel: 1,
  },
  fire_golem: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-6, 0, 2],
    defaultLevel: 1,
  },
  fire_dragon: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-4, 0, 0],
    abilityFrom: { flame_burn: 3 },
    patternByLevel: { 1: "melee", 2: "cleave3", 3: "cleave3" },
    defaultLevel: 1,
  },
  cerberus: {
    bonusAtk: [-1, 0, 0],
    bonusHp: [-6, 0, 0],
    defaultLevel: 1,
  },
  imp: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { imp_burn: 2 },
    defaultLevel: 1,
  },
  inferno: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { immune_hell_death: 2, inferno_flex: 3 },
    defaultLevel: 1,
  },
  motardo: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { rush: 2 },
    defaultLevel: 1,
  },
  succubus: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { succubus_flex: 2 },
    defaultLevel: 1,
  },
  balthazar: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { balthazar_flex: 2 },
    defaultLevel: 1,
  },
  ifrit: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-4, 0, 0],
    abilityFrom: { imp_burn: 2, school_mana_aura: 2 },
    defaultLevel: 1,
  },
  werewolf: {
    bonusAtk: [-3, 0, 0],
    bonusHp: [4, 0, 0],
    defaultLevel: 1,
  },
  elf: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-2, 0, 0],
    abilityFrom: { riposte: 3 },
    defaultLevel: 1,
  },
  spider: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { spider_poison: 2 },
    defaultLevel: 1,
  },
  hornet_warrior: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { hornet_pack: 2 },
    defaultLevel: 1,
  },
  leprechaun: {
    bonusAtk: [0, 0, 0],
    bonusHp: [-2, 0, 0],
    abilityFrom: { leprechaun_aura: 1 },
    defaultLevel: 1,
  },
  ent: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [0, 0, 0],
    defaultLevel: 1,
  },
  basilisk: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { basilisk_gaze: 2 },
    defaultLevel: 1,
  },
  hornet_queen: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: {
      hornet_queen_flex: 2,
      hornet_pack: 1,
      spider_poison: 1,
      school_mana_aura: 3,
    },
    defaultLevel: 1,
  },
  arch_orc: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-2, 0, 0],
    defaultLevel: 1,
  },
  leshy: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { leshy_flex: 2 },
    defaultLevel: 1,
  },
  veles: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    defaultLevel: 1,
  },
  unicorn: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: {
      unicorn_flex: 3,
      immune_spells: 2,
      school_mana_aura: 2,
    },
    defaultLevel: 1,
  },
  orc: {
    bonusAtk: [-2, 0, 1],
    bonusHp: [-2, 0, 0],
    defaultLevel: 1,
  },
  troll: {
    bonusAtk: [0, 0, 0],
    bonusHp: [-8, 0, 4],
    defaultLevel: 1,
  },
  goblin: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { rush: 2 },
    defaultLevel: 1,
  },
  black_dragon: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-4, 0, 0],
    patternByLevel: { 1: "melee", 2: "cleave3", 3: "cleave3" },
    defaultLevel: 1,
  },
  mercenary: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-2, 0, 0],
    abilityFrom: { riposte: 3 },
    defaultLevel: 1,
  },
  recruit: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-2, 0, 0],
    defaultLevel: 1,
  },
  scorpicora: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { scorpion_poison: 2 },
    defaultLevel: 1,
  },
  wanderer: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-2, 0, 0],
    abilityFrom: { aquilite_swap: 2 },
    defaultLevel: 1,
  },
  rogue: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { mana_steal: 2 },
    defaultLevel: 1,
  },
  arbiter: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { arbiter_flex: 2 },
    defaultLevel: 1,
  },
  archer: {
    bonusAtk: [-1, 0, 0],
    bonusHp: [-2, 0, 0],
    abilityFrom: { riposte: 3 },
    defaultLevel: 1,
  },

  // —— Заклинания (JSON = ур.2) ——
  poison: {
    ...SPELL_STAT_ZERO,
    spellNums: { amount: [1, 2, 3] },
  },
  strike: {
    ...SPELL_STAT_ZERO,
    spellNums: { amount: [4, 6, 9] },
  },
  undead_strike: {
    ...SPELL_STAT_ZERO,
    spellNums: { amount: [7, 10, 14] },
  },
  undead_bonus: {
    ...SPELL_STAT_ZERO,
    spellNums: { attack: [2, 3, 4], health: [2, 3, 4] },
  },
  swamp: {
    ...SPELL_STAT_ZERO,
    spellNums: { amount: [4, 6, 9] },
  },
  hero_mana: {
    ...SPELL_STAT_ZERO,
    spellNums: { amount: [1, 1, 1] },
    spellExtraFrom: { 3: [{ type: "draw", amount: 1 }] },
  },
  hell_cuffs: {
    ...SPELL_STAT_ZERO,
    spellNums: { amount: [1, 2, 3] },
  },
  fire_aura: {
    ...SPELL_STAT_ZERO,
    spellNums: { amount: [4, 6, 9] },
  },
  slow_foe: {
    ...SPELL_STAT_ZERO,
    spellNums: { amount: [1, 2, 3] },
  },
  mind_grab: {
    ...SPELL_STAT_ZERO,
    spellNums: {
      "damage_hero.amount": [5, 8, 11],
      "draw.amount": [1, 1, 2],
    },
  },
  life_root: {
    ...SPELL_STAT_ZERO,
    spellNums: { amount: [8, 12, 18] },
  },
  ice_trap: {
    ...SPELL_STAT_ZERO,
    spellNums: { amount: [7, 10, 14] },
  },
  wave: {
    ...SPELL_STAT_ZERO,
    spellNums: { amount: [4, 6, 9] },
  },
  arrow_cloud: {
    ...SPELL_STAT_ZERO,
    spellNums: { amount: [4, 6, 9] },
  },
  shield: {
    ...SPELL_STAT_ZERO,
    spellNums: { turns: [2, 3, 4] },
  },
  calm: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: { 3: [{ type: "draw", amount: 1 }] },
  },
  hurricane: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: { 3: [{ type: "damage_all_enemies", amount: 3 }] },
  },
  extra_card: {
    ...SPELL_STAT_ZERO,
    spellNums: { turns: [1, 2, 3] },
  },
  to_attack: {
    ...SPELL_STAT_ZERO,
    spellNums: { amount: [2, 3, 4] },
  },
  banish: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: { 3: [{ type: "damage_hero", amount: 4 }] },
  },
  antidote: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: { 3: [{ type: "heal_unit", amount: 6 }] },
  },
  mass_antidote: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: { 3: [{ type: "heal_hero", amount: 6 }] },
  },
  return_hand: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: { 3: [{ type: "damage_hero", amount: 3 }] },
  },
  reveal_hand: {
    ...SPELL_STAT_ZERO,
    spellNums: { turns: [1, 1, 2] },
  },
  freeze: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: { 3: [{ type: "damage_unit", amount: 4 }] },
  },
  discard_hand: {
    ...SPELL_STAT_ZERO,
    spellNums: { amount: [1, 2, 3] },
  },
  guardian_bond: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: { 3: [{ type: "heal_hero", amount: 6 }] },
  },
  break_spell: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: { 3: [{ type: "draw", amount: 1 }] },
  },
  break_all_spells: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: { 3: [{ type: "heal_hero", amount: 5 }] },
  },
  traitor: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: { 3: [{ type: "damage_hero", amount: 4 }] },
  },
  fear: {
    ...SPELL_STAT_ZERO,
    spellNums: { turns: [1, 2, 3] },
  },
  marionette: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: { 3: [{ type: "damage_hero", amount: 3 }] },
  },
  nothingness: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: { 3: [{ type: "damage_unit", amount: 3 }] },
  },
  mana_stones: {
    ...SPELL_STAT_ZERO,
    spellNums: { amount: [1, 1, 2] },
  },
  mass_poison: {
    ...SPELL_STAT_ZERO,
    spellNums: { amount: [1, 2, 3] },
  },
  betrayer: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: { 3: [{ type: "draw", amount: 1 }] },
  },
  last_stand: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: { 3: [{ type: "heal_hero", amount: 4 }] },
  },
  bunker: {
    ...SPELL_STAT_ZERO,
    spellNums: { turns: [2, 3, 4] },
  },
  clear_sky: {
    ...SPELL_STAT_ZERO,
    spellNums: { turns: [1, 1, 2] },
  },
  dust_eyes: {
    ...SPELL_STAT_ZERO,
    spellNums: { turns: [1, 2, 3] },
  },
  sniper: {
    ...SPELL_STAT_ZERO,
    spellNums: { attack: [1, 2, 3], turns: [1, 1, 2] },
  },
  change_hand: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: { 3: [{ type: "draw", amount: 1 }] },
  },
  awakening: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: {
      3: [{ type: "buff_permanent", attack: 1, health: 1 }],
    },
  },
  mass_reveille: {
    ...SPELL_STAT_ZERO,
    spellExtraFrom: { 3: [{ type: "heal_hero", amount: 8 }] },
  },
};

export function isUpgradeableCard(cardId: string): boolean {
  return cardId in CARD_UPGRADE_DEFS;
}

function spellNumAt(
  nums: Record<string, [number, number, number]> | undefined,
  effectType: string,
  field: string,
  level: CardUpgradeLevel,
): number | null {
  if (!nums) return null;
  const typed = nums[`${effectType}.${field}`];
  if (typed) return typed[level - 1] ?? null;
  const plain = nums[field];
  if (plain) return plain[level - 1] ?? null;
  return null;
}

/** Базовые spellEffects из JSON → с учётом уровня прокачки. */
export function resolveSpellEffects(
  cardId: string,
  base: SpellEffect[],
  level: CardUpgradeLevel,
): SpellEffect[] {
  const def = CARD_UPGRADE_DEFS[cardId];
  const lv = clampUpgradeLevel(level);
  const effects: SpellEffect[] = base.map((eff) => {
    const next = { ...eff } as SpellEffect & Record<string, unknown>;
    for (const field of ["amount", "turns", "attack", "health"] as const) {
      if (typeof next[field] !== "number") continue;
      const scaled = spellNumAt(def?.spellNums, String(next.type), field, lv);
      if (scaled != null) next[field] = scaled;
    }
    return next as SpellEffect;
  });
  if (!def?.spellExtraFrom) return effects;
  for (const need of [1, 2, 3] as const) {
    if (lv < need) continue;
    const extra = def.spellExtraFrom[need];
    if (extra?.length) effects.push(...extra.map((e) => ({ ...e })));
  }
  return effects;
}

export function defaultUpgradeLevel(cardId: string): CardUpgradeLevel {
  return CARD_UPGRADE_DEFS[cardId]?.defaultLevel ?? 1;
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
  try {
    const cost = shardNeedForCard(
      getCard(cardId),
      CARD_TIER_RANK.get(cardId),
    );
    if (level <= 1) return cost.to2;
    return cost.to3;
  } catch {
    const cost = SHARD_COST_BY_TIER[shardTierForCard(cardId)];
    if (level <= 1) return cost.to2;
    return cost.to3;
  }
}

/** Осколки за одну оплату ценника: всегда 1. */
export function shardsPerShopBuy(_cardId: string): number {
  return shardsPerShopBuyAlways();
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

/** Умение доступно с этого уровня? */
export function abilityUnlockedAt(
  cardId: string,
  ability: CreatureAbility,
  level: CardUpgradeLevel,
): boolean {
  const from = CARD_UPGRADE_DEFS[cardId]?.abilityFrom?.[ability];
  if (from == null) return true;
  return level >= from;
}

/** Паттерн удара с учётом уровня. */
export function upgradeAttackPattern(
  cardId: string,
  level: CardUpgradeLevel,
  fallback: AttackPattern,
): AttackPattern {
  return CARD_UPGRADE_DEFS[cardId]?.patternByLevel?.[level] ?? fallback;
}

/** Копейщик ур.3: прокол щита. */
export function spearmanIgnoresShield(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Берсерк: урон тика самоурона. */
export function berserkDecayAmount(level: CardUpgradeLevel): number {
  return level <= 1 ? 3 : 2;
}

/** Берсерк ур.3: ярость при низком HP. */
export function berserkRageBonus(
  level: CardUpgradeLevel,
  health: number,
  maxHp: number,
): number {
  if (level < 3) return 0;
  if (maxHp <= 0) return 0;
  return health * 2 <= maxHp ? 3 : 0;
}

/** Маг: сила лечения по уровню. */
export function mageHealAmount(level: CardUpgradeLevel): number {
  if (level >= 3) return 7;
  return 5;
}

/** Ангел: сила бафа. */
export function angelBuffAmount(level: CardUpgradeLevel): {
  atk: number;
  hp: number;
} {
  if (level >= 3) return { atk: 3, hp: 3 };
  return { atk: 2, hp: 2 };
}

/** Паладин: длительность щита одному / армии. */
export function paladinShieldTurns(level: CardUpgradeLevel): number {
  return level >= 3 ? 1 : 2;
}

export function paladinShieldsArmy(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Танк ур.3: щит себе при призыве. */
export function tankSelfShieldOnPlay(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Колосс: +мана жизни / щит армии. */
export function colossusManaOnPlay(level: CardUpgradeLevel): boolean {
  return level >= 2;
}

export function colossusArmyShieldOnPlay(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Механический страж ур.3: возврат маны при смерти. */
export function mechRefundManaOnDeath(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Валькирия ур.3: перемещение не тратит удар. */
export function valkyrieFreeMove(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Арбалетчик ур.3: 30% ответки по герою. */
export function crossbowRiposteHeroChance(level: CardUpgradeLevel): number {
  return level >= 3 ? 0.3 : 0;
}

/** Вампир: хил за укус. */
export function vampireHealAmount(level: CardUpgradeLevel): number {
  if (level <= 1) return 3;
  if (level === 2) return 5;
  return 7;
}

export function vampireCanOverheal(level: CardUpgradeLevel): boolean {
  return level >= 2;
}

export function vampireGainsAtkOnBite(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Могильщик: лимит подъёмов за бой (null = без лимита). */
export function gravediggerReviveLimit(
  level: CardUpgradeLevel,
): number | null {
  if (level <= 1) return 0;
  if (level === 2) return 1;
  return null;
}

export function gravediggerReviveBuff(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Зомби ур.3: труп / яд убийце. */
export function zombieDeathTrick(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Адский гонщик. */
export function hellRiderKillMana(level: CardUpgradeLevel): "death" | "school" {
  return level <= 1 ? "death" : "school";
}

export function hellRiderRangedWardChance(level: CardUpgradeLevel): number {
  return level >= 2 ? 0.3 : 0;
}

/** Банши: длительность оглушения. */
export function bansheeStunTurns(level: CardUpgradeLevel): number {
  return level >= 3 ? 2 : 1;
}

/** Костяной рекс ур.3: −50% от дальних. */
export function boneRexRangedWard(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Некромант ур.3: два скелета. */
export function necroSummonCount(level: CardUpgradeLevel): number {
  return level >= 3 ? 2 : 1;
}

/** Лич: drain / урон герою. */
export function lichDrainAmount(level: CardUpgradeLevel): number {
  if (level <= 1) return 0;
  if (level === 2) return 5;
  return 8;
}

export function lichHeroPoke(level: CardUpgradeLevel): number {
  return level >= 3 ? 2 : 0;
}

/** Водяной голем ур.3: хил себе при ударе. */
export function waterGolemLifesteal(level: CardUpgradeLevel): number {
  return level >= 3 ? 2 : 0;
}

/** Дух воды ур.3: добор за убийство. */
export function waterSpiritDrawOnKill(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Элементаль ур.3: splash соседу. */
export function waterElementalSplash(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Тритон ур.3: аура акулитам. */
export function tritonAquiliteAura(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Акулит ур.3: бесплатный свап. */
export function aquiliteFreeMove(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/**
 * Водяной (clawfiend): L2 — прилив только если ещё не бил;
 * L3 — прилив всегда.
 */
export function clawfiendTideAlways(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Кракен ур.3: +HP за каждое водное на поле. */
export function krakenWaterHpBonus(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Русалка: длительность сна. */
export function mermaidSleepTurns(level: CardUpgradeLevel): number {
  return level >= 3 ? 2 : 1;
}

/** Имп / ифрит: доп. урон герою при атаке. */
export function impHeroBurn(
  cardId: string,
  level: CardUpgradeLevel,
): number {
  if (level <= 1) return 0;
  if (cardId === "ifrit") return 3;
  if (level === 2) return 3;
  return 5;
}

/** Огненный голем ур.3: сосед цели тоже горит. */
export function fireGolemSplashBurn(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Цербер ур.3: множитель урона по центру. */
export function cerberusCenterMul(level: CardUpgradeLevel): number {
  return level >= 3 ? 2 : 1;
}

/** Мотардо ур.3: доп. урон герою. */
export function motardoHeroBonus(level: CardUpgradeLevel): number {
  return level >= 3 ? 3 : 0;
}

/** Сукуб: длительность сна. */
export function succubusSleepTurns(level: CardUpgradeLevel): number {
  return level >= 3 ? 2 : 1;
}

/** Бальтазар ур.3: −атака после свапа. */
export function balthazarSwapAtkLoss(level: CardUpgradeLevel): number {
  return level >= 3 ? 2 : 0;
}

/** Ифрит ур.3: ответный огонь рукопашному. */
export function ifritMeleeRetaliate(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Оборотень / архи-орк ур.3: +атака за убийство. */
export function killGrowAtk(cardId: string, level: CardUpgradeLevel): number {
  if (level < 3) return 0;
  if (cardId === "werewolf" || cardId === "arch_orc") return 1;
  return 0;
}

/** Эльф ур.3: вторая стрела за ход. */
export function elfDoubleShot(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Паук ур.3: сила яда / щит призывом. */
export function spiderPoisonAmount(level: CardUpgradeLevel): number {
  return level >= 3 ? 2 : 1;
}

export function spiderShieldOnPlay(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Шершень-воин ур.3: лёгкий яд на 2 хода. */
export function hornetTempPoison(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Леприкон: хил героя / союзников. */
export function leprechaunHeroHeal(level: CardUpgradeLevel): number {
  if (level <= 1) return 1;
  return 3;
}

export function leprechaunAllyHeal(level: CardUpgradeLevel): number {
  return level >= 3 ? 1 : 0;
}

/** Энт ур.3: HP от всех бойцов на поле. */
export function entUsesBoardHp(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Василиск: длительность окаменения. */
export function basiliskGazeTurns(level: CardUpgradeLevel): number {
  return level >= 3 ? 2 : 1;
}

/** Леший ур.3: можно менять статы врагу. */
export function leshyCanTargetEnemy(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Велес: хил героя призывом / аура природы. */
export function velesHealOnPlay(level: CardUpgradeLevel): number {
  if (level <= 1) return 0;
  if (level === 2) return 2;
  return 4;
}

export function velesNatureAuraHeal(level: CardUpgradeLevel): number {
  return level >= 3 ? 1 : 0;
}

/** Единорог ур.3: после разбития заклинания ещё можно ударить. */
export function unicornKeepAttackAfterBreak(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Единорог ур.1: +1 мана природы при призыве. */
export function unicornManaOnPlay(level: CardUpgradeLevel): boolean {
  return level <= 1;
}

/** Орк ур.3: оглушение соседа при убийстве. */
export function orcKillStun(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Тролль ур.3: реген. */
export function trollRegen(level: CardUpgradeLevel): number {
  return level >= 3 ? 3 : 0;
}

/** Гоблин ур.3: кража маны при призыве. */
export function goblinStealOnPlay(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Чёрный дракон ур.3: горение всей линии cleave. */
export function blackDragonLineBurn(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Наёмник ур.3: splash соседу атакующего при ответке. */
export function mercenaryRiposteSplash(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Новобранец ур.3: герой +HP при смерти. */
export function recruitDeathHeal(level: CardUpgradeLevel): number {
  return level >= 3 ? 5 : 0;
}

/** Скорпикора ур.3: яд растёт быстрее. */
export function scorpicoraFastPoison(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Странник ур.3: смена слота без траты удара. */
export function wandererFreeMove(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Разбойник: кража маны каждый N-й свой ход. */
export function rogueStealEvery(level: CardUpgradeLevel): number | null {
  if (level <= 1) return null;
  if (level === 2) return 5;
  return 3;
}

/** Арбитр: вердикт раз за бой / щадит легенд / баф себе. */
export function arbiterVerdictOnce(level: CardUpgradeLevel): boolean {
  return level >= 2;
}

export function arbiterSparesAllyLegend(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

export function arbiterSelfBuff(level: CardUpgradeLevel): boolean {
  return level >= 3;
}

/** Лучница ур.3: ответка в половину атаки. */
export function archerHalfRiposte(level: CardUpgradeLevel): boolean {
  return level >= 3;
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

export function cardUpgradeBlurb(
  cardId: string,
  level: CardUpgradeLevel,
): string {
  return upgradePlanLine(cardId, level);
}

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
  upgrades[cardId] = clampUpgradeLevel(level + 1);
  return {
    owned: { ...owned, cardShards: shards, cardUpgrades: upgrades },
    ok: true,
  };
}

/** Миграция: старт с ур.1; осколки сохраняем. */
export function migrateCardUpgrades(owned: OwnedState): OwnedState {
  const upgrades = { ...(owned.cardUpgrades ?? {}) };
  let changed = false;

  // Epoch 1: убираем бесплатный «ур.2 по умолчанию» — кач с нуля (0/30).
  if ((owned.upgradeEpoch ?? 0) < 1) {
    for (const cardId of Object.keys(CARD_UPGRADE_DEFS)) {
      const has =
        (owned.collection?.[cardId] ?? 0) > 0 ||
        owned.unlocked.includes(cardId);
      if (!has) continue;
      upgrades[cardId] = 1;
      changed = true;
    }
    return {
      ...owned,
      cardUpgrades: upgrades,
      upgradeEpoch: 1,
    };
  }

  for (const cardId of Object.keys(CARD_UPGRADE_DEFS)) {
    const has =
      (owned.collection?.[cardId] ?? 0) > 0 ||
      owned.unlocked.includes(cardId);
    if (!has) continue;
    if (upgrades[cardId] != null) continue;
    upgrades[cardId] = defaultUpgradeLevel(cardId);
    changed = true;
  }
  return changed ? { ...owned, cardUpgrades: upgrades } : owned;
}

/** Пул дропа: все прокачиваемые карты, уже открытые тиром игрока (магазин). */
export function shardDropPoolForLevel(playerLevel: number): string[] {
  const lv = Math.max(1, Math.floor(Number(playerLevel) || 1));
  return Object.keys(CARD_UPGRADE_DEFS).filter((id) => {
    try {
      return isCardAvailableInShop(getCard(id), lv);
    } catch {
      return false;
    }
  });
}

function shuffleIds(ids: string[]): string[] {
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
  return arr;
}

/**
 * Победа: N осколков из пула по уровню (не только из своих).
 * Стараемся размазать по разным картам (по 1), пока N не кончится.
 * Бот/тропа/арена: 2–3 · PvP: 3–5. Поражение — не вызывать.
 */
export function rollBattleWinShards(
  owned: OwnedState,
  opts: { min: number; max: number },
): {
  owned: OwnedState;
  gains: Array<{ cardId: string; amount: number; name: string }>;
} {
  const lo = Math.max(1, Math.floor(opts.min));
  const hi = Math.max(lo, Math.floor(opts.max));
  const total = lo + Math.floor(Math.random() * (hi - lo + 1));
  const level = Math.max(1, Math.floor(Number(owned.level) || 1));
  const pool = shardDropPoolForLevel(level);
  if (!pool.length || total <= 0) return { owned, gains: [] };

  const amounts: Record<string, number> = {};
  const order = shuffleIds(pool);
  // Сначала по одной на разные карты.
  let left = total;
  for (const id of order) {
    if (left <= 0) break;
    amounts[id] = (amounts[id] ?? 0) + 1;
    left -= 1;
  }
  // Если осколков больше, чем карт в пуле — докидываем рандомно.
  while (left > 0) {
    const id = order[Math.floor(Math.random() * order.length)]!;
    amounts[id] = (amounts[id] ?? 0) + 1;
    left -= 1;
  }

  let next = owned;
  const gains: Array<{ cardId: string; amount: number; name: string }> = [];
  for (const [cardId, amount] of Object.entries(amounts)) {
    next = grantCardShards(next, cardId, amount);
    let name = cardId;
    try {
      name = getCard(cardId).name;
    } catch {
      /* ignore */
    }
    gains.push({ cardId, amount, name });
  }
  gains.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return { owned: next, gains };
}

/** @deprecated используй rollBattleWinShards */
export function rollBotWinShards(owned: OwnedState): {
  owned: OwnedState;
  gains: Array<{ cardId: string; amount: number; name: string }>;
} {
  return rollBattleWinShards(owned, { min: 2, max: 3 });
}

/** Сумма маны в стоимости (для лога возврата). */
export function manaCostSum(cost: ManaCost | undefined): number {
  if (!cost) return 0;
  return Object.values(cost).reduce<number>((s, n) => s + (n ?? 0), 0);
}
