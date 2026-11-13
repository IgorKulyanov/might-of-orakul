/**
 * Дальний бой: стрелы только у луков/арбалетов.
 * Остальные ranged — огонь / вода / яд / колдовство.
 */
import { getCard } from "./cards";
import type { AttackPattern } from "./types";

/** Лук / арбалет / лучница — визуал и звук стрелы. */
export const ARROW_SHOT_IDS = new Set([
  "elf",
  "crossbowman",
  "archer",
]);

/** Огненный плевок / болт. */
export const FIRE_BOLT_IDS = new Set([
  "fire_gopnik",
  "inferno",
  "ifrit",
  "flamethrower",
  "fire_dragon",
]);

/** Водный снаряд. */
export const WATER_BOLT_IDS = new Set(["water_spirit"]);

/** Ядовитый выстрел (скорпикора и т.п.). */
export const POISON_BOLT_IDS = new Set(["scorpicora"]);

/** Колдовской болт (маги, нежить, валькирия, арбитр…). */
export const MAGIC_BOLT_IDS = new Set([
  "mage",
  "necro_mage",
  "lich",
  "arbiter",
  "valkyrie",
]);

export type RangedShotStyle =
  | "arrow"
  | "fire"
  | "water"
  | "magic"
  | "poison"
  | "bolt";

export function isFireBoltCard(cardId: string | undefined): boolean {
  return !!cardId && FIRE_BOLT_IDS.has(cardId);
}

export function isArrowShotCard(cardId: string | undefined): boolean {
  return !!cardId && ARROW_SHOT_IDS.has(cardId);
}

/** Стиль дальнего выстрела по id (и запасной разбор по школе). */
export function rangedShotStyle(
  cardId: string | undefined,
): RangedShotStyle | null {
  if (!cardId) return null;
  if (ARROW_SHOT_IDS.has(cardId)) return "arrow";
  if (FIRE_BOLT_IDS.has(cardId)) return "fire";
  if (WATER_BOLT_IDS.has(cardId)) return "water";
  if (POISON_BOLT_IDS.has(cardId)) return "poison";
  if (MAGIC_BOLT_IDS.has(cardId)) return "magic";
  try {
    const c = getCard(cardId);
    const pat = c.attackPattern ?? "melee";
    if (pat !== "ranged") return null;
    if (c.school === "hell") return "fire";
    if (c.school === "water") return "water";
    if (c.school === "death") return "magic";
    if (c.school === "life") return "magic";
    if (c.school === "nature") return "bolt";
    return "bolt";
  } catch {
    return null;
  }
}

/** motion для FX: стрела = ranged, любой другой дальник = bolt, иначе melee. */
export function attackMotionForCard(
  cardId: string,
): "melee" | "ranged" | "bolt" {
  const style = rangedShotStyle(cardId);
  if (style === "arrow") return "ranged";
  if (style != null) return "bolt";
  return "melee";
}

const PATTERN_FALLBACK: Record<
  AttackPattern,
  { icon: string; title: string }
> = {
  melee: { icon: "⚔️", title: "Бьёт только напротив" },
  melee_lane3: { icon: "🗡️", title: "Бьёт напротив, слева или справа" },
  ranged: { icon: "✨", title: "Дальний выстрел (не лук)" },
  cleave3: { icon: "🔱", title: "Бьёт цель и соседей" },
  lane_cleave3: { icon: "🐕", title: "Бьёт сразу троих напротив" },
  aoe_all: { icon: "🌊", title: "Бьёт всех вражеских существ" },
};

const SHOT_GLYPH: Record<RangedShotStyle, { icon: string; title: string }> = {
  arrow: { icon: "🏹", title: "Лук / арбалет — стрелы" },
  fire: { icon: "🔥", title: "Огненный выстрел" },
  water: { icon: "💧", title: "Водный выстрел" },
  magic: { icon: "🔮", title: "Колдовской выстрел" },
  poison: { icon: "🦂", title: "Ядовитый выстрел" },
  bolt: { icon: "✨", title: "Дальний выстрел" },
};

/** Иконка и подсказка паттерна атаки на карте. */
export function patternGlyphForCard(
  cardId: string,
  pattern: AttackPattern,
): { icon: string; title: string } {
  if (pattern === "ranged") {
    const style = rangedShotStyle(cardId) ?? "bolt";
    return SHOT_GLYPH[style];
  }
  return PATTERN_FALLBACK[pattern] ?? PATTERN_FALLBACK.melee;
}
