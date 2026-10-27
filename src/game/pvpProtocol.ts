import {
  attackWith,
  buffWithMage,
  createBattle,
  endPlayerTurn,
  healWithAngel,
  moveUnitToEmptySlot,
  playCard,
  playGuardianBond,
  playMarionette,
  reviveWithGravedigger,
  shieldWithPaladin,
  sleepWithMermaid,
  sleepWithSuccubus,
  stunWithBanshee,
  summonAquiliteWithTriton,
  summonHornetWithQueen,
  summonSkeletonWithNecro,
  swapEnemyWithBalthazar,
  swapStatsWithLeshy,
  verdictWithArbiter,
  type MarionetteTarget,
} from "./engine";
import type { AttackTarget, BattleState } from "./types";
import {
  flipBattle,
  isSeatTurn,
  viewForSeat,
  type PvpSeat,
} from "./pvpFlip";
import { validateBattleCommit } from "./pvpValidate";

export type { PvpSeat };
export { flipBattle, isSeatTurn, viewForSeat };

/** Разница уровней для автопоиска живого соперника. */
export const PVP_MATCH_LEVEL_DELTA = 5;

/** Клиент → сервер */
export type PvpClientMsg =
  | {
      type: "join";
      code: string;
      token: string;
      heroId: string;
      deck: string[];
      name: string;
      level: number;
    }
  | {
      type: "queue";
      token: string;
      heroId: string;
      deck: string[];
      name: string;
      level: number;
    }
  | { type: "cancel_queue" }
  | { type: "ready" }
  | { type: "leave" }
  | { type: "action"; action: PvpAction };

/** Лимит хода PvP (сек) и сколько авто-пропусков до поражения. */
export const PVP_TURN_SEC = 20;
export const PVP_MAX_TIMEOUTS = 5;

export type PvpEndReason = "combat" | "leave" | "disconnect" | "timeout";

/** Сервер → клиент */
export type PvpServerMsg =
  | {
      type: "lobby";
      code: string;
      youAre: PvpSeat;
      hostName: string | null;
      guestName: string | null;
      hostReady: boolean;
      guestReady: boolean;
    }
  | {
      type: "battle";
      code: string;
      youAre: PvpSeat;
      /** Уже отзеркалено под «ты = you». */
      state: BattleState;
      yourTurn: boolean;
      /** Epoch ms — когда истечёт ход (серверный таймер). */
      turnEndsAt: number | null;
      yourTimeouts: number;
      foeTimeouts: number;
      maxTimeouts: number;
      turnLimitSec: number;
    }
  | { type: "error"; message: string }
  | { type: "peer_left"; message: string }
  | {
      /** В очереди поиска: ищем соперника ±PVP_MATCH_LEVEL_DELTA уровней. */
      type: "queued";
      levelMin: number;
      levelMax: number;
      delta: number;
    }
  | { type: "queue_cancelled" }
  | {
      type: "ended";
      winnerSeat: PvpSeat | null;
      youWon: boolean;
      reason: PvpEndReason;
      message: string;
    };

export type PvpAction =
  | { kind: "endTurn" }
  | { kind: "playCard"; handIndex: number; slotIndex: number | null }
  | { kind: "attack"; fromSlot: number; target: AttackTarget }
  | { kind: "healAngel"; fromSlot: number; toSlot: number }
  | { kind: "buffMage"; fromSlot: number; toSlot: number }
  | { kind: "moveUnit"; fromSlot: number; toSlot: number }
  | { kind: "shieldPaladin"; fromSlot: number; toSlot: number }
  | {
      kind: "reviveGravedigger";
      fromSlot: number;
      graveIndex: number;
      toSlot: number;
    }
  | { kind: "summonAquilite"; fromSlot: number; toSlot: number }
  | { kind: "sleepMermaid"; fromSlot: number; toSlot: number }
  | { kind: "sleepSuccubus"; fromSlot: number; toSlot: number }
  | { kind: "stunBanshee"; fromSlot: number; toSlot: number }
  | { kind: "swapBalthazar"; fromSlot: number; a: number; b: number }
  | { kind: "summonSkeleton"; fromSlot: number; toSlot: number }
  | { kind: "summonHornet"; fromSlot: number; toSlot: number }
  | {
      kind: "swapLeshy";
      fromSlot: number;
      side: "you" | "enemy";
      toSlot: number;
    }
  | { kind: "verdictArbiter"; fromSlot: number }
  | {
      kind: "marionette";
      handIndex: number;
      puppetSlot: number;
      target: MarionetteTarget;
    }
  | {
      kind: "guardianBond";
      handIndex: number;
      tankSlot: number;
      wardSlot: number;
    }
  /** Клиент посчитал ход локально (полный UI); сервер принимает снимок от активного. */
  | { kind: "commitState"; state: BattleState };

/** Применить действие от сидящего: в его системе координат (он = you). */
export function applyPvpAction(
  viewedAsYou: BattleState,
  action: PvpAction,
): BattleState {
  if (viewedAsYou.winner || viewedAsYou.active !== "you") {
    return viewedAsYou;
  }
  switch (action.kind) {
    case "endTurn":
      return endPlayerTurn(viewedAsYou);
    case "playCard":
      return playCard(viewedAsYou, action.handIndex, action.slotIndex);
    case "attack":
      return attackWith(viewedAsYou, action.fromSlot, action.target);
    case "healAngel":
      return healWithAngel(viewedAsYou, action.fromSlot, action.toSlot);
    case "buffMage":
      return buffWithMage(viewedAsYou, action.fromSlot, action.toSlot);
    case "moveUnit":
      return moveUnitToEmptySlot(viewedAsYou, action.fromSlot, action.toSlot);
    case "shieldPaladin":
      return shieldWithPaladin(viewedAsYou, action.fromSlot, action.toSlot);
    case "reviveGravedigger":
      return reviveWithGravedigger(
        viewedAsYou,
        action.fromSlot,
        action.graveIndex,
        action.toSlot,
      );
    case "summonAquilite":
      return summonAquiliteWithTriton(
        viewedAsYou,
        action.fromSlot,
        action.toSlot,
      );
    case "sleepMermaid":
      return sleepWithMermaid(viewedAsYou, action.fromSlot, action.toSlot);
    case "sleepSuccubus":
      return sleepWithSuccubus(viewedAsYou, action.fromSlot, action.toSlot);
    case "stunBanshee":
      return stunWithBanshee(viewedAsYou, action.fromSlot, action.toSlot);
    case "swapBalthazar":
      return swapEnemyWithBalthazar(
        viewedAsYou,
        action.fromSlot,
        action.a,
        action.b,
      );
    case "summonSkeleton":
      return summonSkeletonWithNecro(
        viewedAsYou,
        action.fromSlot,
        action.toSlot,
      );
    case "summonHornet":
      return summonHornetWithQueen(viewedAsYou, action.fromSlot, action.toSlot);
    case "swapLeshy":
      return swapStatsWithLeshy(
        viewedAsYou,
        action.fromSlot,
        action.side,
        action.toSlot,
      );
    case "verdictArbiter":
      return verdictWithArbiter(viewedAsYou, action.fromSlot);
    case "marionette":
      return playMarionette(
        viewedAsYou,
        action.handIndex,
        action.puppetSlot,
        action.target,
      );
    case "guardianBond":
      return playGuardianBond(
        viewedAsYou,
        action.handIndex,
        action.tankSlot,
        action.wardSlot,
      );
    default:
      return viewedAsYou;
  }
}

/** Действие от seat в host-frame. */
export function applySeatAction(
  hostFrame: BattleState,
  seat: PvpSeat,
  action: PvpAction,
): BattleState {
  if (action.kind === "commitState") {
    // Снимок с клиента — только после анти-чит проверки (бог-режим режется).
    const check = validateBattleCommit(hostFrame, action.state, seat);
    if (!check.ok) {
      throw new Error(check.error);
    }
    return check.host;
  }
  if (!isSeatTurn(hostFrame, seat)) return hostFrame;
  if (seat === "host") {
    return applyPvpAction(hostFrame, action);
  }
  const asGuest = flipBattle(hostFrame);
  const next = applyPvpAction(asGuest, action);
  return flipBattle(next);
}

export function startPvpBattle(opts: {
  host: {
    deck: string[];
    heroId: string;
    name: string;
    level: number;
  };
  guest: {
    deck: string[];
    heroId: string;
    name: string;
    level: number;
  };
}): BattleState {
  const state = createBattle(
    opts.host.deck,
    opts.guest.deck,
    opts.host.heroId,
    opts.guest.heroId,
    opts.host.name,
    opts.host.level,
    opts.guest.level,
  );
  state.enemy.name = opts.guest.name;
  state.log = [
    `Сетевая дуэль: ${opts.host.name} vs ${opts.guest.name}`,
    ...state.log,
  ].slice(0, 12);
  return state;
}

export function winnerSeat(
  hostFrame: BattleState,
): PvpSeat | null {
  if (hostFrame.winner === "you") return "host";
  if (hostFrame.winner === "enemy") return "guest";
  return null;
}

export function activeSeat(hostFrame: BattleState): PvpSeat | null {
  if (hostFrame.winner) return null;
  return hostFrame.active === "you" ? "host" : "guest";
}

/** Форфейт / AFK-кик: победа seat без боя до 0 HP. */
export function forceWin(
  hostFrame: BattleState,
  winner: PvpSeat,
  logLine: string,
): BattleState {
  const next = structuredClone(hostFrame) as BattleState;
  next.winner = winner === "host" ? "you" : "enemy";
  if (winner === "host") next.enemy.hp = 0;
  else next.you.hp = 0;
  next.selectedHand = null;
  next.selectedSlot = null;
  next.log = [logLine, ...(next.log ?? [])].slice(0, 14);
  return next;
}
