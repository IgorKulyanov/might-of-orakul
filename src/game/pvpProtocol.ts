import { getCard } from "./cards";
import {
  attackFxPreview,
  attackWith,
  buffWithMage,
  castOracleSkill,
  createBattle,
  endEnemyTurn,
  endPlayerTurn,
  enrichSpellFx,
  healWithAngel,
  moveUnitToEmptySlot,
  normalizeBattleFx,
  playCard,
  playGuardianBond,
  playMarionette,
  recentGraveCreatures,
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
  breakSpellWithUnicorn,
  cleaveBreathWithInferno,
  verdictWithArbiter,
  type BattleFx,
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

/** Стартовая разница уровней для автопоиска живого соперника. */
export const PVP_MATCH_LEVEL_DELTA = 5;

/** Пороги расширения очереди (мс ожидания → допустимый |Δlevel|). */
export const PVP_QUEUE_WIDEN: ReadonlyArray<{ afterMs: number; delta: number }> =
  [
    { afterMs: 0, delta: 5 },
    { afterMs: 15_000, delta: 10 },
    { afterMs: 30_000, delta: 20 },
    { afterMs: 60_000, delta: 49 },
  ];

/** Текущий delta по времени в очереди (слепой матч расширяется). */
export function pvpQueueDelta(waitMs: number): number {
  const w = Math.max(0, waitMs);
  let delta = PVP_MATCH_LEVEL_DELTA;
  for (const step of PVP_QUEUE_WIDEN) {
    if (w >= step.afterMs) delta = step.delta;
  }
  return delta;
}

export function pvpQueueBand(level: number, waitMs: number) {
  const delta = pvpQueueDelta(waitMs);
  const lv = Math.max(1, Math.min(50, Math.floor(level) || 1));
  return {
    delta,
    levelMin: Math.max(1, lv - delta),
    levelMax: Math.min(50, lv + delta),
  };
}

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
      skills?: (string | null)[];
    }
  | {
      type: "queue";
      token: string;
      heroId: string;
      deck: string[];
      name: string;
      level: number;
      skills?: (string | null)[];
    }
  | { type: "cancel_queue" }
  | { type: "ready" }
  | { type: "leave" }
  | { type: "roll_dice" }
  /** Клиент просит актуальный снимок стола (жеребьёвка / пропущенный пакет). */
  | { type: "sync" }
  | { type: "action"; action: PvpAction };

/** Лимит хода PvP (сек) и сколько авто-пропусков до поражения. */
export const PVP_TURN_SEC = 60;
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
      /** Сокет живой (отсекает «пустой» 101 через CF Functions). */
      type: "hello";
      ok: true;
    }
  | {
      type: "lobby";
      code: string;
      youAre: PvpSeat;
      hostName: string | null;
      guestName: string | null;
      hostReady: boolean;
      guestReady: boolean;
      /** false = свернул вкладку / Telegram, комната ещё жива */
      hostOnline?: boolean;
      guestOnline?: boolean;
    }
  | {
      type: "battle";
      code: string;
      youAre: PvpSeat;
      /** Уже отзеркалено под «ты = you». */
      state: BattleState;
      yourTurn: boolean;
      /** Монотонный номер снимка — клиент не проглотит устаревшее. */
      battleSeq?: number;
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
      /** Дубль сигнала конца боя (если `ended` потерялся — клиент не зависает). */
      matchEnded?: boolean;
      youWon?: boolean;
      endMessage?: string;
      /**
       * FX последнего действия уже в координатах зрителя (ты = you).
       * Повторы sync/delayed без нового хода — без fx / тот же fxSeq.
       */
      fx?: BattleFx;
      fxSeq?: number;
    }
  | { type: "error"; message: string }
  | { type: "peer_left"; message: string }
  | {
      /** В очереди поиска: старт ±PVP_MATCH_LEVEL_DELTA, потом расширение. */
      type: "queued";
      levelMin: number;
      levelMax: number;
      delta: number;
      waiting?: number;
    }
  | {
      /** Периодическое обновление полосы уровней / ожидания. */
      type: "queue_update";
      levelMin: number;
      levelMax: number;
      delta: number;
      waiting: number;
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
  | { kind: "breakUnicorn"; fromSlot: number }
  | { kind: "cleaveInferno"; fromSlot: number; toSlot: number }
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
  /** Активное умение оракула (1× за бой). */
  | {
      kind: "oracleSkill";
      skillId: string;
      targetSlot?: number | null;
      toSlot?: number | null;
      healAll?: boolean;
    }
  /** Клиент посчитал ход локально (полный UI); сервер принимает снимок от активного. */
  | { kind: "commitState"; state: BattleState };

/** FX действия в координатах «я = you» (до применения хода). */
export function fxForPvpAction(
  viewedAsYou: BattleState,
  action: PvpAction,
): BattleFx | null {
  switch (action.kind) {
    case "attack":
      return attackFxPreview(viewedAsYou, action.fromSlot, action.target);
    case "playCard": {
      const id = viewedAsYou.you.hand[action.handIndex];
      if (!id) return null;
      const card = getCard(id);
      if (card.kind === "creature") {
        return normalizeBattleFx({
          side: "you",
          kind: "play",
          cardId: id,
          toSlot: action.slotIndex ?? undefined,
        });
      }
      return enrichSpellFx(
        {
          side: "you",
          kind: "spell",
          cardId: id,
          toSlot: action.slotIndex ?? undefined,
          hitHero: action.slotIndex == null ? true : undefined,
        },
        viewedAsYou,
      );
    }
    case "healAngel":
      return normalizeBattleFx({
        side: "you",
        kind: "heal",
        fromSlot: action.fromSlot,
        toSlot: action.toSlot,
        hitSlots: [action.toSlot],
      });
    case "buffMage":
      return normalizeBattleFx({
        side: "you",
        kind: "heal",
        fromSlot: action.fromSlot,
        toSlot: action.toSlot === "hero" ? undefined : action.toSlot,
        hitHero: action.toSlot === "hero",
        hitSlots: action.toSlot === "hero" ? undefined : [action.toSlot],
      });
    case "shieldPaladin":
      return normalizeBattleFx({
        side: "you",
        kind: "heal",
        fromSlot: action.fromSlot,
        toSlot: action.toSlot,
        hitSlots: [action.toSlot],
      });
    case "sleepMermaid":
    case "sleepSuccubus":
    case "stunBanshee":
      return normalizeBattleFx({
        side: "you",
        kind: "lunge",
        fromSlot: action.fromSlot,
        hitSlots: [action.toSlot],
        motion: "bolt",
        vfx: "magic",
      });
    case "cleaveInferno":
      return normalizeBattleFx({
        side: "you",
        kind: "lunge",
        fromSlot: action.fromSlot,
        hitSlots: [action.toSlot],
        motion: "bolt",
        vfx: "burn",
      });
    case "summonAquilite":
      return normalizeBattleFx({
        side: "you",
        kind: "play",
        fromSlot: action.fromSlot,
        toSlot: action.toSlot,
        cardId: "aquilite",
        summonCast: true,
      });
    case "summonSkeleton":
      return normalizeBattleFx({
        side: "you",
        kind: "play",
        fromSlot: action.fromSlot,
        toSlot: action.toSlot,
        cardId: "skeleton",
        summonCast: true,
      });
    case "summonHornet":
      return normalizeBattleFx({
        side: "you",
        kind: "play",
        fromSlot: action.fromSlot,
        toSlot: action.toSlot,
        cardId: "hornet_warrior",
        summonCast: true,
      });
    case "reviveGravedigger": {
      const digger = viewedAsYou.you.slots[action.fromSlot];
      const gy = digger
        ? recentGraveCreatures(viewedAsYou.you.graveyard, 5).find(
            (e) => e.index === action.graveIndex,
          )
        : undefined;
      return normalizeBattleFx({
        side: "you",
        kind: "play",
        fromSlot: action.fromSlot,
        toSlot: action.toSlot,
        cardId: gy?.cardId,
        summonCast: true,
      });
    }
    case "marionette":
      return enrichSpellFx(
        {
          side: "you",
          kind: "spell",
          cardId: viewedAsYou.you.hand[action.handIndex],
        },
        viewedAsYou,
      );
    case "guardianBond":
      return enrichSpellFx(
        {
          side: "you",
          kind: "spell",
          cardId: viewedAsYou.you.hand[action.handIndex],
        },
        viewedAsYou,
      );
    case "oracleSkill":
      return normalizeBattleFx({
        side: "you",
        kind: "spell",
        cardId: action.skillId,
        toSlot: action.targetSlot ?? action.toSlot ?? undefined,
        hitHero: action.targetSlot == null && action.toSlot == null,
      });
    default:
      return null;
  }
}

/** Перевернуть FX для соперника (ты ↔ враг). */
export function flipBattleFx(fx: BattleFx): BattleFx {
  const side =
    fx.side === "you" ? "enemy" : fx.side === "enemy" ? "you" : fx.side;
  return normalizeBattleFx({ ...fx, side });
}

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
      if (viewedAsYou.active !== "you") return viewedAsYou;
      const first = viewedAsYou.pvpFirst ?? "you";
      if (first === "you") return endPlayerTurn(viewedAsYou);
      const asFirst = flipBattle(viewedAsYou);
      // Защита от десинка active/pvpFirst — иначе endEnemyTurn no-op и ход «не передаётся».
      if (asFirst.active !== "enemy") asFirst.active = "enemy";
      return flipBattle(endEnemyTurn(asFirst));
    }
    case "oracleSkill":
      return castOracleSkill(viewedAsYou, {
        skillId: action.skillId,
        targetSlot: action.targetSlot,
        toSlot: action.toSlot,
        healAll: action.healAll,
      });
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
    case "breakUnicorn":
      return breakSpellWithUnicorn(viewedAsYou, action.fromSlot);
    case "cleaveInferno":
      return cleaveBreathWithInferno(
        viewedAsYou,
        action.fromSlot,
        action.toSlot,
      );
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
    skills?: (string | null)[];
  };
  guest: {
    deck: string[];
    heroId: string;
    name: string;
    level: number;
    skills?: (string | null)[];
  };
  dice?: OpeningDice;
  /** Стол уже есть, кубик бросят кнопкой. */
  waitForDice?: boolean;
}): { state: BattleState; dice: OpeningDice | null } {
  const skillOpts = {
    youSkills: opts.host.skills,
    enemySkills: opts.guest.skills,
  };
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
      skillOpts,
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
    skillOpts,
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
