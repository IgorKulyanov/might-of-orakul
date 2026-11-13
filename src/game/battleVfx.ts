/**
 * Боевые VFX: физика vs магия.
 * Мечи / шипы / укол / разрез — слэш и искры, без огня и «магических болтов».
 * Огонь — только у явного burn / огненных кастеров.
 */
import type { BattleFx, BattleFxMotion, BattleFxVfx } from "./engine";
import { attackMotionFor } from "./engine";
import type { Faction } from "./types";

/** Огненные «стреляльщики» — им огненный снаряд уместен. */
export const FIRE_BOLT_IDS = new Set([
  "fire_gopnik",
  "inferno",
  "flamethrower",
  "fire_dragon",
]);

export type FxSpriteKind =
  | "slash"
  | "spark"
  | "flame"
  | "explosion"
  | "flash"
  | "smoke"
  | "water"
  | "lightning"
  | "arcane"
  | "heal";

const FX_BASE = "/fx";

const SEQ: Record<FxSpriteKind, string[]> = {
  slash: [1, 2, 3, 4].map((i) => `${FX_BASE}/slash/slash_0${i}.png`),
  spark: [1, 2, 3, 4, 5].map((i) => `${FX_BASE}/spark/spark_0${i}.png`),
  flame: [
    `${FX_BASE}/flame/flame_01.png`,
    `${FX_BASE}/flame/flame_02.png`,
    `${FX_BASE}/flame/fire_01.png`,
    `${FX_BASE}/flame/fire_02.png`,
  ],
  explosion: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(
    (i) => `${FX_BASE}/explosion/explosion0${i}.png`,
  ),
  flash: [0, 1, 2, 3, 4, 5].map((i) => `${FX_BASE}/flash/flash0${i}.png`),
  smoke: [0, 2, 4, 6, 8, 10, 12, 14].map(
    (i) => `${FX_BASE}/smoke/blackSmoke${String(i).padStart(2, "0")}.png`,
  ),
  water: [
    `${FX_BASE}/water/01_Water__01.png`,
    `${FX_BASE}/water/01_Water__02.png`,
    `${FX_BASE}/water/01_Water__03.png`,
    `${FX_BASE}/water/01_Water__04.png`,
    `${FX_BASE}/water/01_Water__05.png`,
    `${FX_BASE}/water/05_Water__03.png`,
    `${FX_BASE}/water/05_Water__05.png`,
  ],
  lightning: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `${FX_BASE}/lightning/${i}.png`),
  arcane: [1, 2, 3, 4, 5, 6, 7].map(
    (i) => `${FX_BASE}/arcane/01_Arcane_Effect_${i}.png`,
  ),
  heal: [1, 2, 3, 4, 5].map((i) => `${FX_BASE}/magic_particle/star_0${i}.png`),
};

export function fxSequence(kind: FxSpriteKind): string[] {
  return SEQ[kind] ?? SEQ.flash;
}

/** Физическая атака (не магический болт/стрела). */
export function isPhysicalMeleeMotion(motion: BattleFxMotion | undefined): boolean {
  return (motion ?? "melee") === "melee";
}

export function isFireBoltCard(cardId: string | undefined): boolean {
  return !!cardId && FIRE_BOLT_IDS.has(cardId);
}

/**
 * Тема попадания для UI.
 * Меlee → slash (не burn/magic).
 * Огонь только при vfx=burn или огненном болте.
 */
export function resolveImpactKind(
  fx: BattleFx | null | undefined,
): BattleFxVfx | "slash" | "heal" | null {
  if (!fx) return null;
  if (fx.kind === "heal") return "heal";

  if (fx.kind === "lunge") {
    const motion = fx.motion ?? (fx.cardId ? attackMotionFor(fx.cardId) : "melee");
    if (motion === "melee") {
      // Явный поджог от способности — вспышка огня на цели, без «выстрела».
      if (fx.vfx === "burn") return "burn";
      return "slash";
    }
    if (motion === "ranged") return "arrow";
    // bolt
    if (fx.vfx === "burn" || isFireBoltCard(fx.cardId)) return "burn";
    if (fx.school === "water" || fx.vfx === "water") return "water";
    if (fx.school === "death" || fx.vfx === "magic") return "magic";
    if (fx.vfx === "poison") return "poison";
    return "shock";
  }

  if (fx.kind === "spell") {
    if (fx.vfx === "slash") return "slash";
    if (fx.vfx === "poison") return "poison";
    if (fx.vfx === "burn") return "burn";
    if (fx.vfx === "water") return "water";
    if (fx.vfx === "arrow") return "arrow";
    if (fx.vfx === "shock") return "shock";
    if (fx.vfx === "magic") return "magic";
    // Школа ада сама по себе не делает любое заклинание огнём —
    // только если spellProjectileVfx уже выставил burn.
    if (fx.school === "water") return "water";
    return fx.vfx ?? null;
  }
  return null;
}

export function impactToSprite(
  impact: BattleFxVfx | "slash" | "heal" | null | undefined,
): FxSpriteKind | null {
  switch (impact) {
    case "slash":
      return "slash";
    case "burn":
      return "explosion";
    case "water":
      return "water";
    case "shock":
      return "lightning";
    case "magic":
      return "arcane";
    case "poison":
      return "smoke";
    case "heal":
      return "heal";
    case "arrow":
      return "spark";
    default:
      return null;
  }
}

/** Снаряд летит только у дальних/магии; melee — никогда. */
export function shouldFlyMissile(fx: BattleFx | null | undefined): boolean {
  if (!fx) return false;
  if (fx.kind === "lunge") {
    const motion = fx.motion ?? "melee";
    return motion === "ranged" || motion === "bolt";
  }
  if (fx.kind !== "spell") return false;
  // Физический клинок — только вспышка на цели, без огненного «плевка».
  if (fx.vfx === "slash") return false;
  const hasAim =
    !!fx.hitHero ||
    fx.toSlot != null ||
    (Array.isArray(fx.hitSlots) && fx.hitSlots.length > 0);
  if (!hasAim) return false;
  return (
    fx.vfx === "poison" ||
    fx.vfx === "magic" ||
    fx.vfx === "arrow" ||
    fx.vfx === "shock" ||
    fx.vfx === "water" ||
    fx.vfx === "burn"
  );
}

export function missileVisual(
  fx: BattleFx,
): "arrow" | "bolt" | "magic" | "poison" | "fire" | "water" {
  if (fx.kind === "spell") {
    if (fx.vfx === "poison") return "poison";
    if (fx.vfx === "arrow") return "arrow";
    if (fx.vfx === "burn") return "fire";
    if (fx.vfx === "water") return "water";
    if (fx.vfx === "slash") return "arrow";
    return "magic";
  }
  const motion = fx.motion ?? "melee";
  if (motion === "ranged") return "arrow";
  if (fx.vfx === "burn" || isFireBoltCard(fx.cardId)) return "fire";
  if (fx.school === "water") return "water";
  if (fx.school === "death") return "magic";
  return "bolt";
}

export function schoolTone(school: Faction | undefined): string {
  return school ? `school-${school}` : "school-neutral";
}
