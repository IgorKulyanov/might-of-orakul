/**
 * Прокачка карт.
 * Механика: скелет + Жизнь + Смерть + Вода + Ад + Природа + Нейтрал.
 * L2 = текущий полный кит (по умолчанию в сейве), L1 урезано, L3 капстоун.
 */
import { getCard } from "./cards";
import type { AttackPattern, CreatureAbility, ManaCost, OwnedState } from "./types";
import { upgradePlanLine } from "./cardUpgradePlan";

export type CardUpgradeLevel = 1 | 2 | 3;

/** Стоимость осколков: до ур.2 / до ур.3. */
export const SHARD_COST_COMMON = {
  unlock: 20,
  to2: 80,
  to3: 150,
} as const;

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

export const CARD_UPGRADE_DEFS: Record<string, CardUpgradeDef> = {
  skeleton: {
    bonusAtk: [0, 1, 2],
    bonusHp: [0, 2, 4],
    packFrom: 2,
    arrowWardFrom: 3,
    defaultLevel: 2,
  },
  vampire: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { vampire_grow: 1 },
    defaultLevel: 2,
  },
  gravedigger: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { gravedigger_flex: 2 },
    defaultLevel: 2,
  },
  zombie: {
    bonusAtk: [0, 0, 0],
    bonusHp: [-4, 0, 4],
    defaultLevel: 2,
  },
  hell_rider: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [2, 0, 0],
    abilityFrom: { rush: 3 },
    defaultLevel: 2,
  },
  banshee: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { banshee_flex: 2 },
    defaultLevel: 2,
  },
  bone_rex: {
    bonusAtk: [0, 0, 0],
    bonusHp: [-4, 0, 0],
    abilityFrom: { immune_death: 2, immune_spells: 3 },
    defaultLevel: 2,
  },
  necro_mage: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { necro_flex: 2 },
    defaultLevel: 2,
  },
  lich: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { lich_drain: 2 },
    defaultLevel: 2,
  },
  water_golem: {
    bonusAtk: [-1, 0, 0],
    bonusHp: [-4, 0, 2],
    defaultLevel: 2,
  },
  water_spirit: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-2, 0, 0],
    defaultLevel: 2,
  },
  water_elemental: {
    bonusAtk: [-2, 0, 1],
    bonusHp: [-2, 0, 0],
    defaultLevel: 2,
  },
  triton: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { triton_flex: 2 },
    defaultLevel: 2,
  },
  aquilite: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { rush: 1, aquilite_swap: 2 },
    defaultLevel: 2,
  },
  clawfiend: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { water_tide: 2 },
    defaultLevel: 2,
  },
  kraken: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-8, 0, 0],
    defaultLevel: 2,
  },
  mermaid: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { mermaid_flex: 2 },
    defaultLevel: 2,
  },
  spearman: {
    // JSON = L2 (lane3). L1 только напротив.
    bonusAtk: [0, 0, 1],
    bonusHp: [0, 0, 0],
    patternByLevel: { 1: "melee", 2: "melee_lane3", 3: "melee_lane3" },
    defaultLevel: 2,
  },
  crossbowman: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { riposte: 2 },
    defaultLevel: 2,
  },
  tank: {
    // L1 меньше мяса, L3 чуть толще + щит призывом
    bonusAtk: [0, 0, 0],
    bonusHp: [-4, 0, 4],
    defaultLevel: 2,
  },
  berserk: {
    // L1 тоньше (−3/ход), L2 толще (−2/ход)
    bonusAtk: [0, 0, 0],
    bonusHp: [-4, 0, 0],
    abilityFrom: { berserk_decay: 1 },
    defaultLevel: 2,
  },
  mage: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { mage_flex: 2 },
    defaultLevel: 2,
  },
  valkyrie: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { valkyrie_flex: 2 },
    defaultLevel: 2,
  },
  angel: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { angel_heal: 2 },
    defaultLevel: 2,
  },
  paladin: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { paladin_flex: 2 },
    defaultLevel: 2,
  },
  colossus: {
    // Иммун убран с плана; L2 мана, L3 щит армии
    bonusAtk: [0, 0, 0],
    bonusHp: [-8, 0, 0],
    defaultLevel: 2,
  },
  mech_guardian: {
    bonusAtk: [0, 0, 0],
    bonusHp: [-6, 0, 0],
    abilityFrom: { immune_spells: 2 },
    defaultLevel: 2,
  },
  flamethrower: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { flame_burn: 3 },
    patternByLevel: { 1: "melee", 2: "cleave3", 3: "cleave3" },
    defaultLevel: 2,
  },
  fire_lizard: {
    bonusAtk: [-2, 0, 1],
    bonusHp: [-2, 0, 0],
    abilityFrom: { rush: 3 },
    defaultLevel: 2,
  },
  fire_gopnik: {
    bonusAtk: [-3, 0, 0],
    bonusHp: [-2, 0, 0],
    abilityFrom: { flame_burn: 3 },
    defaultLevel: 2,
  },
  fire_golem: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-6, 0, 2],
    defaultLevel: 2,
  },
  fire_dragon: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-4, 0, 0],
    abilityFrom: { flame_burn: 3 },
    patternByLevel: { 1: "melee", 2: "cleave3", 3: "cleave3" },
    defaultLevel: 2,
  },
  cerberus: {
    bonusAtk: [-1, 0, 0],
    bonusHp: [-6, 0, 0],
    defaultLevel: 2,
  },
  imp: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { imp_burn: 2 },
    defaultLevel: 2,
  },
  inferno: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { immune_hell_death: 2, inferno_flex: 3 },
    defaultLevel: 2,
  },
  motardo: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { rush: 2 },
    defaultLevel: 2,
  },
  succubus: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { succubus_flex: 2 },
    defaultLevel: 2,
  },
  balthazar: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { balthazar_flex: 2 },
    defaultLevel: 2,
  },
  ifrit: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-4, 0, 0],
    abilityFrom: { imp_burn: 2, school_mana_aura: 2 },
    defaultLevel: 2,
  },
  werewolf: {
    bonusAtk: [-3, 0, 0],
    bonusHp: [4, 0, 0],
    defaultLevel: 2,
  },
  elf: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-2, 0, 0],
    abilityFrom: { riposte: 3 },
    defaultLevel: 2,
  },
  spider: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { spider_poison: 2 },
    defaultLevel: 2,
  },
  hornet_warrior: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { hornet_pack: 2 },
    defaultLevel: 2,
  },
  leprechaun: {
    bonusAtk: [0, 0, 0],
    bonusHp: [-2, 0, 0],
    abilityFrom: { leprechaun_aura: 1 },
    defaultLevel: 2,
  },
  ent: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [0, 0, 0],
    defaultLevel: 2,
  },
  basilisk: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { basilisk_gaze: 2 },
    defaultLevel: 2,
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
    defaultLevel: 2,
  },
  arch_orc: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-2, 0, 0],
    defaultLevel: 2,
  },
  leshy: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { leshy_flex: 2 },
    defaultLevel: 2,
  },
  veles: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    defaultLevel: 2,
  },
  unicorn: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: {
      unicorn_flex: 3,
      immune_spells: 2,
      school_mana_aura: 2,
    },
    defaultLevel: 2,
  },
  orc: {
    bonusAtk: [-2, 0, 1],
    bonusHp: [-2, 0, 0],
    defaultLevel: 2,
  },
  troll: {
    bonusAtk: [0, 0, 0],
    bonusHp: [-8, 0, 4],
    defaultLevel: 2,
  },
  goblin: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { rush: 2 },
    defaultLevel: 2,
  },
  black_dragon: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-4, 0, 0],
    patternByLevel: { 1: "melee", 2: "cleave3", 3: "cleave3" },
    defaultLevel: 2,
  },
  mercenary: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-2, 0, 0],
    abilityFrom: { riposte: 3 },
    defaultLevel: 2,
  },
  recruit: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-2, 0, 0],
    defaultLevel: 2,
  },
  scorpicora: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { scorpion_poison: 2 },
    defaultLevel: 2,
  },
  wanderer: {
    bonusAtk: [-2, 0, 0],
    bonusHp: [-2, 0, 0],
    abilityFrom: { aquilite_swap: 2 },
    defaultLevel: 2,
  },
  rogue: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { mana_steal: 2 },
    defaultLevel: 2,
  },
  arbiter: {
    bonusAtk: [0, 0, 0],
    bonusHp: [0, 0, 0],
    abilityFrom: { arbiter_flex: 2 },
    defaultLevel: 2,
  },
  archer: {
    bonusAtk: [-1, 0, 0],
    bonusHp: [-2, 0, 0],
    abilityFrom: { riposte: 3 },
    defaultLevel: 2,
  },
};

export function isUpgradeableCard(cardId: string): boolean {
  return cardId in CARD_UPGRADE_DEFS;
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

/** Миграция: открытые прокачиваемые карты без записи → defaultLevel (обычно 2). */
export function migrateCardUpgrades(owned: OwnedState): OwnedState {
  const upgrades = { ...(owned.cardUpgrades ?? {}) };
  let changed = false;
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

/** Победа vs бот: 1–2 осколка случайной своей прокачиваемой карты. */
export function rollBotWinShards(owned: OwnedState): {
  owned: OwnedState;
  gains: Array<{ cardId: string; amount: number; name: string }>;
} {
  const pool = Object.keys(CARD_UPGRADE_DEFS).filter(
    (id) =>
      (owned.collection?.[id] ?? 0) > 0 || owned.unlocked.includes(id),
  );
  if (!pool.length) return { owned, gains: [] };
  const cardId = pool[Math.floor(Math.random() * pool.length)]!;
  const amount = Math.random() < 0.5 ? 1 : 2;
  const next = grantCardShards(owned, cardId, amount);
  let name = cardId;
  try {
    name = getCard(cardId).name;
  } catch {
    /* ignore */
  }
  return {
    owned: next,
    gains: [{ cardId, amount, name }],
  };
}

/** Сумма маны в стоимости (для лога возврата). */
export function manaCostSum(cost: ManaCost | undefined): number {
  if (!cost) return 0;
  return Object.values(cost).reduce<number>((s, n) => s + (n ?? 0), 0);
}
