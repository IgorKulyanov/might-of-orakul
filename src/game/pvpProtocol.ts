import {
  attackWith,
  buffWithMage,
  createBattle,
  endEnemyTurn,
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
export type { PvpSeat };
export { flipBattle, isSeatTurn, viewForSeat };

/** Разница уровней для автопоиска живого соперника. */
export const PVP_MATCH_LEVEL_DELTA = 5;

/** Клиент → сервер */
export type PvpClientMsg =
  | {
      type: "join";
      /** create — новая комната (код с сервера); join — только существующая */
      mode?: "create" | "join";
      code?: string;
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
  | { type: "roll_dice" }
  | { type: "action"; action: PvpAction };

/** Лимит хода PvP (сек) и сколько авто-пропусков до поражения. */
export const PVP_TURN_SEC = 20;
export const PVP_MAX_TIMEOUTS = 5;
/** После броска обоих — сколько держим результат на экране. */
export const PVP_OPENING_MS = 2400;

export type OpeningDice = {
  host: number;
  guest: number;
  first: PvpSeat;
};

/** Кубик как видит игрок: своё / чужое. */
export type SeatOpeningDice = {
  you: number;
  foe: number;
  youFirst: boolean;
};

export function seatOpeningDice(
  dice: OpeningDice,
  seat: PvpSeat,
): SeatOpeningDice {
  return {
    you: seat === "host" ? dice.host : dice.guest,
    foe: seat === "host" ? dice.guest : dice.host,
    youFirst: dice.first === seat,
  };
}

export type OpeningPhase = "wait" | "reveal" | "done";

/** Как каждый сидящий видит кубик: хост бросил — гость всё ещё needRoll. */
export function pvpOpeningView(
  phase: OpeningPhase,
  rolls: { host: number | null; guest: number | null },
  seat: PvpSeat,
  dice: OpeningDice | null,
): {
  needRoll: boolean;
  youRolled: boolean;
  foeRolled: boolean;
  openingLocked: boolean;
  openingDice: SeatOpeningDice | null;
} {
  const other: PvpSeat = seat === "host" ? "guest" : "host";
  return {
    needRoll: phase === "wait" && rolls[seat] == null,
    youRolled: rolls[seat] != null,
    foeRolled: rolls[other] != null,
    openingLocked: phase !== "done",
    openingDice:
      phase === "reveal" && dice ? seatOpeningDice(dice, seat) : null,
  };
}

/** Обычный d6. Ничья — переброс, пока не будет победителя. */
export function rollOpeningDice(rng: () => number = Math.random): OpeningDice {
  for (let i = 0; i < 24; i++) {
    const host = 1 + Math.floor(rng() * 6);
    const guest = 1 + Math.floor(rng() * 6);
    if (host === guest) continue;
    return {
      host,
      guest,
      first: host > guest ? "host" : "guest",
    };
  }
  return { host: 6, guest: 1, first: "host" };
}

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
      openingDice?: SeatOpeningDice;
      /** true, пока оба смотрят кубик — ходить нельзя. */
      openingLocked?: boolean;
      /** Ещё не нажал «Бросить кубик». */
      needRoll?: boolean;
      youRolled?: boolean;
      foeRolled?: boolean;
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
  | { kind: "buffMage"; fromSlot: number; toSlot: number | "hero" }
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
    case "endTurn": {
      // Как vs бот: первый в раунде отдаёт ход без turn++, второй закрывает цикл.
      const first = viewedAsYou.pvpFirst ?? "you";
      if (first === "you") return endPlayerTurn(viewedAsYou);
      const asFirst = flipBattle(viewedAsYou);
      return flipBattle(endEnemyTurn(asFirst));
    }
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
        action.toSlot,
        action.graveIndex,
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
    case "commitState":
      throw new Error("Снимок стола не принимается — ходи действием");
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
    throw new Error("Снимок стола не принимается — ходи действием");
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
  dice?: OpeningDice;
  /** Стол уже есть, кубик бросят кнопкой. */
  waitForDice?: boolean;
}): { state: BattleState; dice: OpeningDice | null } {
  if (opts.waitForDice) {
    const state = createBattle(
      opts.host.deck,
      opts.guest.deck,
      opts.host.heroId,
      opts.guest.heroId,
      opts.host.name,
      opts.host.level,
      opts.guest.level,
      "you",
    );
    state.enemy.name = opts.guest.name;
    state.log = [
      `Сетевая дуэль: ${opts.host.name} vs ${opts.guest.name}`,
      ...state.log,
    ].slice(0, 14);
    return { state, dice: null };
  }
  const dice = opts.dice ?? rollOpeningDice();
  const state = createBattle(
    opts.host.deck,
    opts.guest.deck,
    opts.host.heroId,
    opts.guest.heroId,
    opts.host.name,
    opts.host.level,
    opts.guest.level,
    dice.first === "host" ? "you" : "enemy",
  );
  state.enemy.name = opts.guest.name;
  state.log = [
    `Сетевая дуэль: ${opts.host.name} vs ${opts.guest.name}`,
    ...state.log,
  ].slice(0, 14);
  return {
    state: applyOpeningDice(state, dice, opts.host.name, opts.guest.name),
    dice,
  };
}

/** Записать результат кубика в уже созданный стол (кто ходит первым). */
export function applyOpeningDice(
  state: BattleState,
  dice: OpeningDice,
  hostName: string,
  guestName: string,
): BattleState {
  const next = structuredClone(state) as BattleState;
  const firstActive = dice.first === "host" ? "you" : "enemy";
  next.active = firstActive;
  next.pvpFirst = firstActive;
  const firstName = dice.first === "host" ? hostName : guestName;
  next.log = [
    `Кубик: ${hostName} ${dice.host} — ${guestName} ${dice.guest}. Первым ходит ${firstName}.`,
    ...next.log.filter((line) => !line.startsWith("Кубик:")),
  ].slice(0, 14);
  return next;
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
