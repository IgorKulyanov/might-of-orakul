import { FACTIONS } from "./heroes";
import type { Faction, ManaCost, ManaPool, PlayerState } from "./types";

export function canPay(pool: ManaPool, cost: ManaCost): boolean {
  for (const f of FACTIONS) {
    const need = cost[f] ?? 0;
    if (need > 0 && (pool[f] ?? 0) < need) return false;
  }
  return true;
}

export function payMana(pool: ManaPool, cost: ManaCost): void {
  for (const f of FACTIONS) {
    const need = cost[f] ?? 0;
    if (need > 0) pool[f] -= need;
  }
}

/** Своя школа оракула; чужой ключ из эффекта — только если это реальная фракция. */
export function manaSchoolOf(
  p: PlayerState,
  faction?: Faction | string | null,
): Faction {
  if (faction && FACTIONS.includes(faction as Faction)) {
    return faction as Faction;
  }
  if (FACTIONS.includes(p.faction)) return p.faction;
  return FACTIONS[0]!;
}

/**
 * Старт боя (в духе Orions): все школы с базы 2, своя чуть сильнее.
 * bonus — уровень / эпик / дар воды и т.п. (только на свою школу).
 */
export function startingManaPool(
  own: Faction,
  bonus = 0,
  cap = 10,
): ManaPool {
  const pool: ManaPool = {
    water: 0,
    hell: 0,
    death: 0,
    life: 0,
    nature: 0,
  };
  for (const f of FACTIONS) {
    // База 2 у всех → сразу можно чужие дешёвые карты, не только «свою».
    pool[f] = 2;
  }
  const ownExtra = 1 + Math.max(0, Math.floor(bonus));
  pool[own] = Math.min(cap, (pool[own] ?? 0) + ownExtra);
  return pool;
}

/** Каждая школа +1 в начале своего хода (как в Orions). */
export function growMana(p: PlayerState, _turn: number, cap = 10): void {
  for (const f of FACTIONS) {
    const cur = Number(p.mana[f]) || 0;
    p.mana[f] = Math.min(cap, cur + 1);
  }
}

export function addMana(
  pool: ManaPool,
  faction: Faction,
  amount: number,
  cap = 10,
): void {
  const have = Number(pool[faction]);
  const add = Number(amount);
  const cur = Number.isFinite(have) ? have : 0;
  const n = Number.isFinite(add) ? add : 0;
  pool[faction] = Math.min(cap, cur + n);
}
