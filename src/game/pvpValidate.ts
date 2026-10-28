import type { BattleState, Faction, ManaPool } from "./types";
import { flipBattle, type PvpSeat } from "./pvpFlip";

const FACTIONS: Faction[] = ["water", "hell", "death", "life", "nature"];

/**
 * Анти-чит для снимка стейта: режем «бог-режим».
 * Запасная проверка снимка. Боевой PvP снимок больше не принимает — только типизированный ход.
 */
export function validateBattleCommit(
  prevHost: BattleState,
  nextFromClientAsYou: BattleState,
  seat: PvpSeat,
): { ok: true; host: BattleState } | { ok: false; error: string } {
  let nextHost: BattleState;
  try {
    nextHost =
      seat === "host" ? nextFromClientAsYou : flipBattle(nextFromClientAsYou);
  } catch {
    return { ok: false, error: "Битый стейт" };
  }

  if (!nextHost?.you || !nextHost?.enemy) {
    return { ok: false, error: "Битый стейт" };
  }

  // Ход: либо ещё твой, либо только что закончил (active сменился)
  const wasMine =
    seat === "host" ? prevHost.active === "you" : prevHost.active === "enemy";
  if (!wasMine && !prevHost.winner) {
    return { ok: false, error: "Не твой ход" };
  }

  for (const side of ["you", "enemy"] as const) {
    const p = nextHost[side];
    const prev = prevHost[side];
    if (p.hp > p.maxHp + 2) {
      return { ok: false, error: "Некорректное HP" };
    }
    if (p.maxHp > prev.maxHp + 5) {
      return { ok: false, error: "Некорректный max HP" };
    }
    if (p.hp < -50) {
      return { ok: false, error: "Некорректное HP" };
    }
    for (const f of FACTIONS) {
      const m = Number(p.mana?.[f] ?? 0);
      const pm = Number(prev.mana?.[f] ?? 0);
      if (!Number.isFinite(m) || m < 0 || m > 20) {
        return { ok: false, error: "Некорректная мана" };
      }
      if (m > pm + 8) {
        return { ok: false, error: "Слишком большой прирост маны" };
      }
    }
    if ((p.hand?.length ?? 0) > 12 || (p.slots?.length ?? 0) !== 5) {
      return { ok: false, error: "Битая рука/поле" };
    }
  }

  // Урон за один пакет
  const foeKey = seat === "host" ? "enemy" : "you";
  const meKey = seat === "host" ? "you" : "enemy";
  const dmgFoe = prevHost[foeKey].hp - nextHost[foeKey].hp;
  const healMe = nextHost[meKey].hp - prevHost[meKey].hp;
  if (dmgFoe > 60) return { ok: false, error: "Подозрительный урон" };
  if (healMe > 35) return { ok: false, error: "Подозрительный хил" };

  // Победа только если у кого-то hp <= 0
  if (nextHost.winner) {
    const w = nextHost.winner;
    if (w === "you" && nextHost.enemy.hp > 0) {
      return { ok: false, error: "Ложная победа" };
    }
    if (w === "enemy" && nextHost.you.hp > 0) {
      return { ok: false, error: "Ложная победа" };
    }
  }

  // Нельзя откатить ход назад
  if ((nextHost.turn ?? 1) < (prevHost.turn ?? 1)) {
    return { ok: false, error: "Откат хода" };
  }
  if ((nextHost.turn ?? 1) > (prevHost.turn ?? 1) + 1) {
    return { ok: false, error: "Скачок хода" };
  }

  // Юниты: режем «бог-статы» на поле
  for (const side of ["you", "enemy"] as const) {
    for (const u of nextHost[side].slots ?? []) {
      if (!u) continue;
      if (u.attack > 40 || u.health > 80 || u.baseHealth > 80) {
        return { ok: false, error: "Подозрительные статы юнита" };
      }
      if (u.attack < 0 || u.health < -5) {
        return { ok: false, error: "Битые статы юнита" };
      }
    }
  }

  // Имена героев не меняются в бою
  if (
    nextHost.you.name !== prevHost.you.name ||
    nextHost.enemy.name !== prevHost.enemy.name
  ) {
    return { ok: false, error: "Подмена имени" };
  }

  // Уровни и кто ходил первым — серверные, клиент не подменяет.
  nextHost.you.level = prevHost.you.level;
  nextHost.enemy.level = prevHost.enemy.level;
  nextHost.pvpFirst = prevHost.pvpFirst;

  return { ok: true, host: stripHeavyLog(nextHost) };
}

export function stripHeavyLog(state: BattleState): BattleState {
  return {
    ...state,
    log: (state.log ?? []).slice(0, 14),
  };
}

export function saneMana(pool: ManaPool): ManaPool {
  const out = { ...pool };
  for (const f of FACTIONS) {
    const n = Number(out[f] ?? 0);
    out[f] = Math.max(0, Math.min(20, Number.isFinite(n) ? n : 0));
  }
  return out;
}
