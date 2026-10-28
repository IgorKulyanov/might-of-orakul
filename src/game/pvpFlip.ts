import type { BattleState } from "./types";

export type PvpSeat = "host" | "guest";

/** Host-frame: host=you, guest=enemy. Flip so viewer is always you. */
export function flipBattle(state: BattleState): BattleState {
  const next = structuredClone(state) as BattleState;
  const tmp = next.you;
  next.you = next.enemy;
  next.enemy = tmp;
  next.you.id = "you";
  next.enemy.id = "enemy";
  next.active = state.active === "you" ? "enemy" : "you";
  if (state.pvpFirst === "you") next.pvpFirst = "enemy";
  else if (state.pvpFirst === "enemy") next.pvpFirst = "you";
  if (state.winner === "you") next.winner = "enemy";
  else if (state.winner === "enemy") next.winner = "you";
  else next.winner = null;
  next.selectedHand = null;
  next.selectedSlot = null;
  return next;
}

export function viewForSeat(
  hostFrame: BattleState,
  seat: PvpSeat,
): BattleState {
  return seat === "host" ? hostFrame : flipBattle(hostFrame);
}

export function isSeatTurn(hostFrame: BattleState, seat: PvpSeat): boolean {
  if (hostFrame.winner) return false;
  if (seat === "host") return hostFrame.active === "you";
  return hostFrame.active === "enemy";
}
