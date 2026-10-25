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

/** Своя фракция +1 каждый ход; чужие +1 на чётных ходах (2,4,6…). */
export function growMana(p: PlayerState, turn: number, cap = 10): void {
  const own = manaSchoolOf(p);
  const schools = FACTIONS.length ? FACTIONS : [own];
  for (const f of schools) {
    const cur = Number(p.mana[f]) || 0;
    if (f === own) {
      p.mana[f] = Math.min(cap, cur + 1);
    } else if (turn % 2 === 0) {
      p.mana[f] = Math.min(cap, cur + 1);
    }
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
