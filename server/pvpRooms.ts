import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { CARD_MAP } from "../src/game/cards.ts";
import type { BattleFx } from "../src/game/engine.ts";
import {
  activeSeat,
  applyOpeningDice,
  applySeatAction,
  flipBattleFx,
  forceWin,
  fxForPvpAction,
  isSeatTurn,
  PVP_MAX_TIMEOUTS,
  PVP_OPENING_MS,
  PVP_TURN_SEC,
  pvpOpeningView,
  pvpQueueBand,
  pvpQueueDelta,
  startPvpBattle,
  viewForSeat,
  winnerSeat,
  type OpeningDice,
  type PvpAction,
  type PvpClientMsg,
  type PvpEndReason,
  type PvpSeat,
  type PvpServerMsg,
} from "../src/game/pvpProtocol.ts";
import type { BattleState } from "../src/game/types.ts";
import { rateLimit, sanitizeDisplayName, sanitizeHeroId } from "./security.js";

type AuthLookup = (token: string) => { id: string; login: string } | null;

type SeatPlayer = {
  ws: WebSocket;
  userId: string;
  name: string;
  heroId: string;
  deck: string[];
  level: number;
  skills?: (string | null)[];
  ready: boolean;
  /** false = сокет умер (свернул вкладку), место держим для reclaim. */
  online: boolean;
  disconnectedAt: number | null;
};

type Room = {
  code: string;
  host: SeatPlayer | null;
  guest: SeatPlayer | null;
  battle: BattleState | null;
  createdAt: number;
  turnEndsAt: number | null;
  turnTimer: ReturnType<typeof setTimeout> | null;
  timeouts: { host: number; guest: number };
  endReason: PvpEndReason | null;
  openingDice: OpeningDice | null;
  diceRolls: { host: number | null; guest: number | null };
  openingPhase: "wait" | "reveal" | "done";
  endedSent: boolean;
  /** До этого момента ходы с кубика не принимаем. */
  openingLockedUntil: number | null;
  /** Повторная рассылка стола, пока крутится жеребьёвка (Telegram глотает пакеты). */
  openingPulse: ReturnType<typeof setInterval> | null;
  /** Подряд пульсов с офлайном — чтобы разовый мигающий WS не рвал матч. */
  openingOfflineStrikes: number;
  /** Номер снимка стола — догоняем клиента, если пакет потерялся. */
  battleSeq: number;
  /** FX последнего хода в координатах seat (для анимации/звука у зрителя). */
  lastFx: { host: BattleFx | null; guest: BattleFx | null; seq: number } | null;
  /** Ход на паузе: игрок свернул игру (звонок) — ждём reconnect. */
  turnPausedForReconnect: boolean;
};

const rooms = new Map<string, Room>();
const KNOWN_CARDS = new Set(Object.keys(CARD_MAP));
const MAX_ROOMS = 200;
const MAX_MSG_BYTES = 120_000;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
/** Сколько держим место в лобби после обрыва (Telegram / сворачивание). */
const LOBBY_RECONNECT_MS = 5 * 60 * 1000;
/** В бою: звонок/сворачивание — не сдаём сразу, ждём возврата. */
const BATTLE_RECONNECT_MS = 90_000;
const TURN_MS = PVP_TURN_SEC * 1000;

function makeSeat(
  partial: Omit<SeatPlayer, "online" | "disconnectedAt" | "ready"> & {
    ready?: boolean;
  },
): SeatPlayer {
  return {
    ...partial,
    ready: Boolean(partial.ready),
    online: true,
    disconnectedAt: null,
  };
}

type QueueEntry = SeatPlayer & { queuedAt: number };

/** Очередь автопоиска: сначала ±5, потом расширение по времени. */
const matchQueue: QueueEntry[] = [];

function randomMatchCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "Q";
  for (let i = 0; i < 5; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return s;
}

function removeFromQueue(ws: WebSocket) {
  for (let i = matchQueue.length - 1; i >= 0; i--) {
    if (matchQueue[i]!.ws === ws) matchQueue.splice(i, 1);
  }
}

function removeUserFromQueue(userId: string) {
  for (let i = matchQueue.length - 1; i >= 0; i--) {
    if (matchQueue[i]!.userId === userId) matchQueue.splice(i, 1);
  }
}

function isWsOpen(ws: WebSocket) {
  return ws.readyState === ws.OPEN;
}

function pruneQueue() {
  for (let i = matchQueue.length - 1; i >= 0; i--) {
    if (!isWsOpen(matchQueue[i]!.ws)) matchQueue.splice(i, 1);
  }
}

function findMatchFor(entry: QueueEntry): QueueEntry | null {
  pruneQueue();
  const now = Date.now();
  const entryDelta = pvpQueueDelta(now - entry.queuedAt);
  let best: QueueEntry | null = null;
  let bestScore = Infinity;
  for (const other of matchQueue) {
    if (other.ws === entry.ws) continue;
    if (other.userId === entry.userId) continue;
    if (!isWsOpen(other.ws)) continue;
    const diff = Math.abs(other.level - entry.level);
    // Матч, если разницу покрывает хотя бы один (max delta) — не запираем узкой полосой.
    const otherDelta = pvpQueueDelta(now - other.queuedAt);
    const allowed = Math.max(entryDelta, otherDelta);
    if (diff > allowed) continue;
    // Ближе по уровню важнее; при равенстве — кто дольше ждёт
    const score = diff * 1000 - (now - other.queuedAt) / 1000;
    if (score < bestScore) {
      bestScore = score;
      best = other;
    }
  }
  return best;
}

function sendQueueStatus(entry: QueueEntry) {
  const waitMs = Date.now() - entry.queuedAt;
  const band = pvpQueueBand(entry.level, waitMs);
  send(entry.ws, {
    type: "queue_update",
    levelMin: band.levelMin,
    levelMax: band.levelMax,
    delta: band.delta,
    waiting: Math.floor(waitMs / 1000),
  });
}

function requeuePlayer(p: SeatPlayer, queuedAt = Date.now()) {
  if (!isWsOpen(p.ws)) return;
  removeFromQueue(p.ws);
  removeUserFromQueue(p.userId);
  const entry: QueueEntry = {
    ...makeSeat({
      ws: p.ws,
      userId: p.userId,
      name: p.name,
      heroId: p.heroId,
      deck: p.deck,
      level: p.level,
      ready: false,
    }),
    queuedAt,
  };
  matchQueue.push(entry);
  const band = pvpQueueBand(entry.level, 0);
  send(entry.ws, {
    type: "queued",
    levelMin: band.levelMin,
    levelMax: band.levelMax,
    delta: band.delta,
    waiting: 0,
  });
}

/** Сломать кривой матч: без победы, живых вернуть в поиск. */
function dissolveMatchRequeue(room: Room, reason: string) {
  clearTurnTimer(room);
  clearOpeningPulse(room);
  const host = room.host;
  const guest = room.guest;
  room.battle = null;
  room.host = null;
  room.guest = null;
  room.endReason = null;
  room.openingPhase = "done";
  room.endedSent = false;
  for (const p of [host, guest]) {
    if (!p) continue;
    bindSocketRoom(p.ws, null);
    if (!isWsOpen(p.ws)) continue;
    send(p.ws, {
      type: "error",
      message: reason,
    });
    requeuePlayer(p);
  }
  rooms.delete(room.code);
  console.warn("[pvp] dissolve match", room.code, reason);
}

function pairIntoRoom(a: QueueEntry, b: QueueEntry): Room | null {
  if (!isWsOpen(a.ws) || !isWsOpen(b.ws)) return null;
  removeFromQueue(a.ws);
  removeFromQueue(b.ws);
  // Случайный код, пока не свободен
  let code = randomMatchCode();
  let guard = 0;
  while (rooms.has(code) && guard < 40) {
    code = randomMatchCode();
    guard++;
  }
  const room = getOrCreate(code);
  if (!room) {
    // Вернуть в очередь, если комнату не создали
    requeuePlayer(a, a.queuedAt);
    requeuePlayer(b, b.queuedAt);
    return null;
  }
  room.host = makeSeat({
    ws: a.ws,
    userId: a.userId,
    name: a.name,
    heroId: a.heroId,
    deck: a.deck,
    level: a.level,
    skills: a.skills,
    ready: true,
  });
  room.guest = makeSeat({
    ws: b.ws,
    userId: b.userId,
    name: b.name,
    heroId: b.heroId,
    deck: b.deck,
    level: b.level,
    skills: b.skills,
    ready: true,
  });
  room.battle = null;
  room.timeouts = { host: 0, guest: 0 };
  room.endReason = null;
  return room;
}

/** Сокет → код комнаты (очередь матчит два разных connection). */
const socketRoom = new Map<WebSocket, string>();

function bindSocketRoom(ws: WebSocket, code: string | null) {
  if (code) socketRoom.set(ws, code);
  else socketRoom.delete(ws);
}

function tryMatchQueue(seed?: QueueEntry) {
  pruneQueue();
  const startWith = seed && matchQueue.includes(seed) ? seed : matchQueue[0];
  if (!startWith) return null;
  const partner = findMatchFor(startWith);
  if (!partner) return null;
  // Ещё раз прямо перед парой — иначе один уже в бою, второй крутит поиск.
  if (!isWsOpen(startWith.ws) || !isWsOpen(partner.ws)) {
    pruneQueue();
    return null;
  }
  const room = pairIntoRoom(startWith, partner);
  if (!room || !room.host || !room.guest) return null;
  if (!isWsOpen(room.host.ws) || !isWsOpen(room.guest.ws)) {
    dissolveMatchRequeue(room, "Связь соперника пропала — ищем снова");
    return null;
  }
  bindSocketRoom(room.host.ws, room.code);
  bindSocketRoom(room.guest.ws, room.code);
  console.warn(
    "[pvp] match",
    room.code,
    room.host.name,
    "vs",
    room.guest.name,
  );
  // Сразу бой — без лобби-экрана, чтобы оба гарантированно получили battle.
  tryStart(room);
  if (
    room.battle &&
    (!isWsOpen(room.host.ws) || !isWsOpen(room.guest.ws))
  ) {
    dissolveMatchRequeue(
      room,
      "Соперник не подключился к бою — ищем снова",
    );
    return null;
  }
  return room;
}

setInterval(() => {
  pruneQueue();
  // Повторные попытки на случай, если второй зашёл раньше и ждёт
  for (const entry of [...matchQueue]) {
    if (tryMatchQueue(entry)) break;
  }
  // Обновить полосу уровней у оставшихся в очереди (расширение)
  for (const entry of matchQueue) {
    if (isWsOpen(entry.ws)) sendQueueStatus(entry);
  }
}, 2000).unref?.();

function send(ws: WebSocket, msg: PvpServerMsg): boolean {
  if (ws.readyState !== ws.OPEN) return false;
  try {
    ws.send(JSON.stringify(msg));
    return true;
  } catch (e) {
    console.error(
      `[pvp:FAIL] code=WS_SEND detail=${JSON.stringify(
        e instanceof Error ? e.message : String(e),
      )}`,
    );
    return false;
  }
}

function pvpFail(code: string, detail: Record<string, unknown>) {
  console.error(`[pvp:FAIL] code=${code} ${JSON.stringify(detail)}`);
}

function clearTurnTimer(room: Room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
  room.turnEndsAt = null;
}

function clearOpeningPulse(room: Room) {
  if (room.openingPulse) {
    clearInterval(room.openingPulse);
    room.openingPulse = null;
  }
}

/** Пока кубик — долбим снимок обоим, чтобы один не застрял на «крутится». */
function startOpeningPulse(room: Room) {
  clearOpeningPulse(room);
  room.openingOfflineStrikes = 0;
  room.openingPulse = setInterval(() => {
    if (!room.battle || room.openingPhase === "done") {
      clearOpeningPulse(room);
      return;
    }
    if (!seatOnline(room.host) || !seatOnline(room.guest)) {
      room.openingOfflineStrikes += 1;
      if (room.openingOfflineStrikes >= 3) {
        dissolveMatchRequeue(room, "Соперник не вошёл в бой — ищем снова");
      }
      return;
    }
    room.openingOfflineStrikes = 0;
    broadcastBattle(room);
  }, 1200);
}

function lobbyPayload(room: Room, seat: PvpSeat): PvpServerMsg {
  return {
    type: "lobby",
    code: room.code,
    youAre: seat,
    hostName: room.host?.name ?? null,
    guestName: room.guest?.name ?? null,
    hostReady: Boolean(room.host?.ready),
    guestReady: Boolean(room.guest?.ready),
    hostOnline: seatOnline(room.host),
    guestOnline: seatOnline(room.guest),
  };
}

function broadcastLobby(room: Room) {
  if (room.host?.online && isWsOpen(room.host.ws)) {
    send(room.host.ws, lobbyPayload(room, "host"));
  }
  if (room.guest?.online && isWsOpen(room.guest.ws)) {
    send(room.guest.ws, lobbyPayload(room, "guest"));
  }
}

function seatOnline(p: SeatPlayer | null): boolean {
  return Boolean(p && p.online && isWsOpen(p.ws));
}

/** Обрыв сети: место сохраняем (лобби или бой) — звонок / сворачивание. */
function softDisconnectSeat(room: Room, seat: PvpSeat, ws: WebSocket) {
  const me = seat === "host" ? room.host : room.guest;
  if (!me || me.ws !== ws) return;
  me.online = false;
  me.ready = false;
  me.disconnectedAt = Date.now();
  bindSocketRoom(ws, null);
  if (room.battle && !winnerSeat(room.battle)) {
    // Если ход ушедшего — не крутим таймер, пока не вернётся.
    if (isSeatTurn(room.battle, seat)) {
      clearTurnTimer(room);
      room.turnPausedForReconnect = true;
    }
    const peer = seat === "host" ? room.guest : room.host;
    if (peer && isWsOpen(peer.ws)) {
      send(peer.ws, {
        type: "error",
        message: "Соперник без связи — ждём до ~1.5 мин (звонок/свёртка)",
      });
    }
    return;
  }
  broadcastLobby(room);
}

/** Если таймер reveal потерялся — не держим стол вечно (без рекурсии broadcast). */
function unlockOpeningIfDue(room: Room) {
  if (!room.battle) return;
  if (room.openingPhase !== "reveal") return;
  if (room.openingLockedUntil == null) return;
  if (Date.now() < room.openingLockedUntil) return;
  room.openingPhase = "done";
  room.openingLockedUntil = null;
  if (!room.turnEndsAt && !winnerSeat(room.battle)) {
    scheduleTurnTimer(room);
  }
}

function battlePayload(
  room: Room,
  seat: PvpSeat,
  opts?: { includeFx?: boolean },
): PvpServerMsg {
  unlockOpeningIfDue(room);
  const battle = room.battle!;
  const yourTimeouts =
    seat === "host" ? room.timeouts.host : room.timeouts.guest;
  const foeTimeouts =
    seat === "host" ? room.timeouts.guest : room.timeouts.host;
  const opening = pvpOpeningView(
    room.openingPhase,
    room.diceRolls,
    seat,
    room.openingDice,
  );
  const win = winnerSeat(battle);
  const matchEnded = Boolean(win) || room.endedSent;
  const reason = room.endReason ?? "combat";
  const endMsg = win
    ? (endMessage(seat, win, reason) as Extract<
        PvpServerMsg,
        { type: "ended" }
      >)
    : null;
  const wantFx = opts?.includeFx !== false;
  const fxPack =
    wantFx && room.lastFx && room.lastFx.seq === room.battleSeq
      ? room.lastFx
      : null;
  const seatFx = fxPack
    ? seat === "host"
      ? fxPack.host
      : fxPack.guest
    : null;
  return {
    type: "battle",
    code: room.code,
    youAre: seat,
    // JSON-клон: structuredClone иногда падает на столе и рвёт broadcast.
    state: JSON.parse(JSON.stringify(viewForSeat(battle, seat))) as BattleState,
    yourTurn: isSeatTurn(battle, seat),
    battleSeq: room.battleSeq,
    turnEndsAt: matchEnded ? null : room.turnEndsAt,
    yourTimeouts,
    foeTimeouts,
    maxTimeouts: PVP_MAX_TIMEOUTS,
    turnLimitSec: PVP_TURN_SEC,
    openingDice: opening.openingDice ?? undefined,
    openingLocked: false,
    needRoll: false,
    youRolled: true,
    foeRolled: true,
    matchEnded: matchEnded || undefined,
    youWon: endMsg ? endMsg.youWon : undefined,
    endMessage: endMsg?.message,
    fx: seatFx ?? undefined,
    fxSeq: seatFx && fxPack ? fxPack.seq : undefined,
  };
}

function endMessage(
  seat: PvpSeat,
  win: PvpSeat,
  reason: PvpEndReason,
): PvpServerMsg {
  const messages: Record<PvpEndReason, string> = {
    combat: win === seat ? "Победа!" : "Поражение",
    leave:
      win === seat
        ? "Соперник сдался — победа"
        : "Ты вышел из боя — поражение",
    disconnect:
      win === seat
        ? "Соперник отключился — победа"
        : "Связь оборвалась — поражение",
    timeout:
      win === seat
        ? "Соперник слишком часто пропускал ход — победа"
        : "Слишком много пропусков хода — поражение",
  };
  return {
    type: "ended",
    winnerSeat: win,
    youWon: win === seat,
    reason,
    message: messages[reason],
  };
}

function broadcastBattle(room: Room) {
  if (!room.battle) return;
  room.battleSeq += 1;
  const win = winnerSeat(room.battle);
  const reason = room.endReason ?? "combat";
  const dead: PvpSeat[] = [];
  for (const seat of ["host", "guest"] as const) {
    const p = seat === "host" ? room.host : room.guest;
    if (!p) continue;
    if (!isWsOpen(p.ws)) {
      dead.push(seat);
      continue;
    }
    if (win && !room.endedSent) {
      send(p.ws, endMessage(seat, win, reason));
    }
    send(p.ws, battlePayload(room, seat));
  }
  if (win) room.endedSent = true;
  // Мёртвый сокет больше не = мгновенный forfeit: ждём soft-reconnect (gcRooms).
  if (!win && dead.length === 1 && room.openingPhase === "done") {
    const gone = dead[0]!;
    const p = gone === "host" ? room.host : room.guest;
    if (p && p.online) {
      p.online = false;
      p.disconnectedAt = Date.now();
      if (room.battle && isSeatTurn(room.battle, gone)) {
        clearTurnTimer(room);
        room.turnPausedForReconnect = true;
      }
      pvpFail("PEER_WS_SOFT", {
        room: room.code,
        dead: gone,
        seq: room.battleSeq,
      });
    }
  }
}

/** Повторная досылка — Telegram/прокси иногда глотают один пакет. */
function broadcastBattleSoon(room: Room, delayMs = 350) {
  const code = room.code;
  const seq = room.battleSeq;
  setTimeout(() => {
    const r = rooms.get(code);
    if (!r?.battle || r.battleSeq !== seq) return;
    if (winnerSeat(r.battle)) return;
    // не бампим seq повторно — шлём тот же снимок, без fx:
    // повторный fxSeq на клиенте срывал выстрелы/магию.
    const win = winnerSeat(r.battle);
    for (const seat of ["host", "guest"] as const) {
      const p = seat === "host" ? r.host : r.guest;
      if (!p) continue;
      if (win && !r.endedSent) send(p.ws, endMessage(seat, win, r.endReason ?? "combat"));
      send(p.ws, battlePayload(r, seat, { includeFx: false }));
    }
  }, delayMs);
}

function scheduleTurnTimer(room: Room) {
  clearTurnTimer(room);
  if (!room.battle || room.battle.winner) return;
  const seat = activeSeat(room.battle);
  if (!seat) return;
  room.turnEndsAt = Date.now() + TURN_MS;
  room.turnTimer = setTimeout(() => {
    room.turnTimer = null;
    onTurnTimeout(room);
  }, TURN_MS);
}

function onTurnTimeout(room: Room) {
  if (!room.battle || room.battle.winner) return;
  const seat = activeSeat(room.battle);
  if (!seat) return;

  room.timeouts[seat] += 1;
  const n = room.timeouts[seat];
  const name =
    seat === "host" ? room.host?.name ?? "Хост" : room.guest?.name ?? "Гость";

  if (n >= PVP_MAX_TIMEOUTS) {
    const winner: PvpSeat = seat === "host" ? "guest" : "host";
    room.endReason = "timeout";
    room.battle = forceWin(
      room.battle,
      winner,
      `${name}: ${PVP_MAX_TIMEOUTS} пропусков хода — поражение`,
    );
    clearTurnTimer(room);
    broadcastBattle(room);
    return;
  }

  try {
    room.battle = applySeatAction(room.battle, seat, { kind: "endTurn" });
    room.battle = {
      ...room.battle,
      log: [
        `${name}: время вышло (${n}/${PVP_MAX_TIMEOUTS}) — ход передан`,
        ...(room.battle.log ?? []),
      ].slice(0, 14),
    };
  } catch (e) {
    console.error("[pvp] turn timeout apply fail:", e);
  }

  if (winnerSeat(room.battle)) {
    room.endReason = room.endReason ?? "combat";
    clearTurnTimer(room);
    broadcastBattle(room);
    return;
  }
  scheduleTurnTimer(room);
  broadcastBattle(room);
}

function finishForfeit(room: Room, loser: PvpSeat, reason: PvpEndReason) {
  if (!room.battle || room.battle.winner) return;
  const winner: PvpSeat = loser === "host" ? "guest" : "host";
  const loserName =
    loser === "host" ? room.host?.name ?? "Игрок" : room.guest?.name ?? "Игрок";
  const line =
    reason === "disconnect"
      ? `${loserName} отключился — поражение`
      : `${loserName} вышел из боя — поражение`;
  room.endReason = reason;
  room.battle = forceWin(room.battle, winner, line);
  clearTurnTimer(room);
  clearOpeningPulse(room);
  broadcastBattle(room);
}

function d6(): number {
  return 1 + Math.floor(Math.random() * 6);
}

function finishOpeningDice(room: Room) {
  if (!room.battle || room.openingPhase !== "wait") return;
  if (room.diceRolls.host == null || room.diceRolls.guest == null) return;
  let host = room.diceRolls.host;
  let guest = room.diceRolls.guest;
  for (let i = 0; i < 24 && host === guest; i++) {
    host = d6();
    guest = d6();
  }
  if (host === guest) {
    host = 6;
    guest = 1;
  }
  room.diceRolls = { host, guest };
  const dice: OpeningDice = {
    host,
    guest,
    first: host > guest ? "host" : "guest",
  };
  room.openingDice = dice;
  room.battle = applyOpeningDice(
    room.battle,
    dice,
    room.host?.name ?? "Хост",
    room.guest?.name ?? "Гость",
  );
  room.openingPhase = "reveal";
  room.openingLockedUntil = Date.now() + PVP_OPENING_MS;
  startOpeningPulse(room);
  broadcastBattle(room);
  clearTurnTimer(room);
  room.turnTimer = setTimeout(() => {
    if (!room.battle || winnerSeat(room.battle)) return;
    room.openingPhase = "done";
    room.openingLockedUntil = null;
    clearOpeningPulse(room);
    scheduleTurnTimer(room);
    broadcastBattle(room);
    // Ещё один снимок — у кого кубик «крутился», снимет оверлей.
    const code = room.code;
    setTimeout(() => {
      const r = rooms.get(code);
      if (!r?.battle || r.openingPhase !== "done") return;
      broadcastBattle(r);
    }, 500);
  }, PVP_OPENING_MS);
}

function rollSeatDice(room: Room, seat: PvpSeat) {
  if (!room.battle || room.openingPhase !== "wait") return;
  if (room.diceRolls[seat] != null) return;
  room.diceRolls[seat] = d6();
  if (room.diceRolls.host != null && room.diceRolls.guest != null) {
    finishOpeningDice(room);
    return;
  }
  broadcastBattle(room);
}

function tryStart(room: Room) {
  if (room.battle) return;
  if (!room.host?.ready || !room.guest?.ready) return;
  if (!seatOnline(room.host) || !seatOnline(room.guest)) {
    dissolveMatchRequeue(room, "Соперник офлайн — ищем снова");
    return;
  }
  try {
    const started = startPvpBattle({
      host: {
        deck: room.host.deck,
        heroId: room.host.heroId,
        name: room.host.name,
        level: room.host.level,
        skills: room.host.skills,
      },
      guest: {
        deck: room.guest.deck,
        heroId: room.guest.heroId,
        name: room.guest.name,
        level: room.guest.level,
        skills: room.guest.skills,
      },
      waitForDice: true,
    });
    room.battle = started.state;
    // Жребий мгновенно и без оверлея: иначе один уже ходит, у второго
    // навечно трясутся кубики (пакет reveal/done не дошёл).
    let hostRoll = d6();
    let guestRoll = d6();
    for (let i = 0; i < 24 && hostRoll === guestRoll; i++) {
      hostRoll = d6();
      guestRoll = d6();
    }
    if (hostRoll === guestRoll) {
      hostRoll = 6;
      guestRoll = 1;
    }
    const dice: OpeningDice = {
      host: hostRoll,
      guest: guestRoll,
      first: hostRoll > guestRoll ? "host" : "guest",
    };
    room.diceRolls = { host: hostRoll, guest: guestRoll };
    room.openingDice = dice;
    room.battle = applyOpeningDice(
      room.battle,
      dice,
      room.host.name,
      room.guest.name,
    );
    room.openingPhase = "done";
    room.endedSent = false;
    room.timeouts = { host: 0, guest: 0 };
    room.endReason = null;
    room.openingLockedUntil = null;
    room.turnEndsAt = null;
    clearOpeningPulse(room);
    room.battle = {
      ...room.battle,
      log: [
        `Лимит хода: ${PVP_TURN_SEC}с · ${PVP_MAX_TIMEOUTS} пропусков = поражение`,
        ...(room.battle.log ?? []),
      ].slice(0, 14),
    };
    broadcastBattle(room);
    // Повтор через 0.5с и 1.5с — если первый battle проглотили.
    const code = room.code;
    for (const ms of [500, 1500]) {
      setTimeout(() => {
        const r = rooms.get(code);
        if (!r?.battle || r.openingPhase !== "done" || winnerSeat(r.battle)) {
          return;
        }
        broadcastBattle(r);
      }, ms);
    }
    scheduleTurnTimer(room);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось начать бой";
    dissolveMatchRequeue(room, message);
  }
}

function seatOf(room: Room, ws: WebSocket): PvpSeat | null {
  if (room.host?.ws === ws) return "host";
  if (room.guest?.ws === ws) return "guest";
  return null;
}

function detach(
  room: Room,
  seat: PvpSeat,
  reason: "leave" | "disconnect" = "leave",
) {
  const hadLiveBattle = Boolean(room.battle && !winnerSeat(room.battle));
  // Кубик / старт: уход ≠ победа сопернику (типичный баг «я в бою, она ещё ищет»).
  if (
    hadLiveBattle &&
    (room.openingPhase === "wait" || room.openingPhase === "reveal")
  ) {
    dissolveMatchRequeue(
      room,
      "Соперник не успел войти в бой — ищем снова",
    );
    return;
  }
  if (hadLiveBattle) {
    finishForfeit(room, seat, reason === "disconnect" ? "disconnect" : "leave");
  }

  const peer = seat === "host" ? room.guest : room.host;
  if (seat === "host") room.host = null;
  else room.guest = null;

  if (!room.battle) {
    if (room.host) room.host.ready = false;
    if (room.guest) room.guest.ready = false;
    if (seatOnline(peer)) {
      send(peer!.ws, {
        type: "peer_left",
        message: "Соперник вышел из комнаты",
      });
      broadcastLobby(room);
    }
  } else if (!hadLiveBattle && peer) {
    // Бой уже был окончен — просто уходим; peer сам выйдет с экрана результата
  }

  if (!room.host && !room.guest) {
    clearTurnTimer(room);
    clearOpeningPulse(room);
    rooms.delete(room.code);
  }
}

function getOrCreate(code: string): Room | null {
  let room = rooms.get(code);
  if (!room) {
    if (rooms.size >= MAX_ROOMS) return null;
    room = {
      code,
      host: null,
      guest: null,
      battle: null,
      createdAt: Date.now(),
      turnEndsAt: null,
      turnTimer: null,
      timeouts: { host: 0, guest: 0 },
      endReason: null,
      openingDice: null,
      diceRolls: { host: null, guest: null },
      openingPhase: "done",
      endedSent: false,
      openingLockedUntil: null,
      openingPulse: null,
      openingOfflineStrikes: 0,
      battleSeq: 0,
      lastFx: null,
      turnPausedForReconnect: false,
    };
    rooms.set(code, room);
  }
  return room;
}

function validateDeck(
  deck: unknown,
): { ok: true; deck: string[] } | { ok: false; error: string } {
  if (!Array.isArray(deck)) return { ok: false, error: "Колода битая" };
  if (deck.length < 4 || deck.length > 40) {
    return { ok: false, error: "В колоде 4–40 карт" };
  }
  const out: string[] = [];
  for (const id of deck) {
    const s = String(id).slice(0, 64);
    if (!KNOWN_CARDS.has(s)) {
      return { ok: false, error: `Неизвестная карта: ${s}` };
    }
    out.push(s);
  }
  return { ok: true, deck: out };
}

function sanitizeSkills(raw: unknown): (string | null)[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: (string | null)[] = [];
  for (let i = 0; i < 4; i++) {
    const v = raw[i];
    if (v == null || v === "") {
      out.push(null);
      continue;
    }
    const s = String(v).slice(0, 64);
    out.push(/^[a-z0-9_]+$/i.test(s) ? s : null);
  }
  return out;
}

function gcRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    // Просроченный офлайн в лобби → окончательно освобождаем место
    if (!room.battle) {
      for (const seat of ["host", "guest"] as const) {
        const p = seat === "host" ? room.host : room.guest;
        if (
          p &&
          !p.online &&
          p.disconnectedAt != null &&
          now - p.disconnectedAt > LOBBY_RECONNECT_MS
        ) {
          detach(room, seat, "disconnect");
        }
      }
      if (!rooms.has(code)) continue;
    } else if (!winnerSeat(room.battle)) {
      // Бой: слишком долго без связи после звонка/свёртки → поражение.
      for (const seat of ["host", "guest"] as const) {
        const p = seat === "host" ? room.host : room.guest;
        if (
          p &&
          !p.online &&
          p.disconnectedAt != null &&
          now - p.disconnectedAt > BATTLE_RECONNECT_MS
        ) {
          pvpFail("BATTLE_RECONNECT_TIMEOUT", {
            room: code,
            seat,
            ms: now - p.disconnectedAt,
          });
          finishForfeit(room, seat, "disconnect");
          break;
        }
      }
      if (!rooms.has(code)) continue;
    }

    const alive = seatOnline(room.host) || seatOnline(room.guest);
    const waitingReconnect =
      (room.host && !room.host.online) || (room.guest && !room.guest.online);
    if (!alive && !waitingReconnect && now - room.createdAt > 60_000) {
      clearTurnTimer(room);
      clearOpeningPulse(room);
      rooms.delete(code);
      continue;
    }
    if (now - room.createdAt > ROOM_TTL_MS) {
      clearTurnTimer(room);
      clearOpeningPulse(room);
      rooms.delete(code);
    }
  }
}

setInterval(gcRooms, 15_000).unref?.();

export function getPvpLiveStats(): {
  rooms: number;
  players: number;
  inBattle: number;
  inLobby: number;
  inQueue: number;
} {
  pruneQueue();
  let roomsN = 0;
  let inBattle = 0;
  let inLobby = 0;
  for (const room of rooms.values()) {
    roomsN += 1;
    const n = (room.host ? 1 : 0) + (room.guest ? 1 : 0);
    if (room.battle && !room.endReason) inBattle += n;
    else inLobby += n;
  }
  return {
    rooms: roomsN,
    players: inBattle + inLobby + matchQueue.length,
    inBattle,
    inLobby,
    inQueue: matchQueue.length,
  };
}

export function attachPvp(authLookup: AuthLookup): WebSocketServer {
  // noServer: два WS на одном HTTP иначе бьются (чат ловил 400, PvP жил).
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MSG_BYTES,
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const connId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ip =
      String(req.headers["cf-connecting-ip"] || "").trim() ||
      String(req.headers["x-real-ip"] || "").trim() ||
      String(req.headers["x-forwarded-for"] || "")
        .split(",")[0]
        .trim() ||
      req.socket.remoteAddress ||
      "unknown";
    const connRl = rateLimit(`pvp-conn:${ip}`, 40, 60_000);
    if (!connRl.ok) {
      send(ws, { type: "error", message: "Слишком много подключений к PvP" });
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      return;
    }

    /** Токен из ?token= — запасной канал, если join-пакет потерялся. */
    let queryUser: { id: string; login: string } | null = null;
    try {
      const u = new URL(req.url || "/", "http://localhost");
      const qTok = String(u.searchParams.get("token") || "").trim();
      if (qTok) queryUser = authLookup(qTok);
    } catch {
      /* ignore */
    }

    const resolveUser = (rawToken: unknown) => {
      const t = String(rawToken || "").trim();
      if (t) {
        const u = authLookup(t);
        if (u) return u;
      }
      return queryUser;
    };

    // Сразу подтверждаем канал — иначе клиент может сидеть на «пустом» WS-прокси.
    send(ws, { type: "hello", ok: true });

    const leaveCurrentRoom = (reason: "leave" | "disconnect") => {
      const code = socketRoom.get(ws) ?? null;
      if (!code) return;
      const room = rooms.get(code);
      if (!room) {
        bindSocketRoom(ws, null);
        return;
      }
      const seat = seatOf(room, ws);
      if (!seat) {
        bindSocketRoom(ws, null);
        return;
      }
      // Обрыв сети (звонок/свёртка) — не сдаём сразу ни в лобби, ни в бою.
      if (
        reason === "disconnect" &&
        (!room.battle || !winnerSeat(room.battle))
      ) {
        softDisconnectSeat(room, seat, ws);
        return;
      }
      bindSocketRoom(ws, null);
      detach(room, seat, reason);
    };

    ws.on("message", (raw) => {
      if (typeof raw !== "string" && !Buffer.isBuffer(raw)) {
        send(ws, { type: "error", message: "Битый пакет" });
        return;
      }
      const text = String(raw);
      if (text.length > MAX_MSG_BYTES) {
        send(ws, { type: "error", message: "Слишком большой пакет" });
        return;
      }

      let msg: PvpClientMsg;
      try {
        msg = JSON.parse(text) as PvpClientMsg;
      } catch {
        send(ws, { type: "error", message: "Битый пакет" });
        return;
      }

      // sync/roll_dice не режем — иначе жеребьёвка навечно просит бросок.
      const skipRl = msg.type === "sync" || msg.type === "roll_dice";
      if (!skipRl) {
        const rl = rateLimit(`ws:${connId}`, 40, 5_000);
        if (!rl.ok) {
          send(ws, { type: "error", message: "Слишком много сообщений" });
          return;
        }
      }

      if (msg.type === "cancel_queue") {
        removeFromQueue(ws);
        send(ws, { type: "queue_cancelled" });
        return;
      }

      if (msg.type === "queue") {
        const user = resolveUser(msg.token);
        if (!user) {
          console.warn("[pvp] queue auth fail ip=", ip);
          send(ws, {
            type: "error",
            message: "Нужен вход — выйди и войди в аккаунт снова",
          });
          return;
        }
        const qRl = rateLimit(`ws-queue:${user.id}`, 20, 60_000);
        if (!qRl.ok) {
          send(ws, { type: "error", message: "Слишком много поисков" });
          return;
        }
        const deckCheck = validateDeck(msg.deck);
        if (!deckCheck.ok) {
          send(ws, { type: "error", message: deckCheck.error });
          return;
        }
        const heroId =
          sanitizeHeroId(msg.heroId) || sanitizeHeroId("hero_life")!;
        const name =
          sanitizeDisplayName(msg.name) ||
          sanitizeDisplayName(user.login) ||
          "Игрок";
        if (name.length < 2) {
          send(ws, { type: "error", message: "Короткое имя" });
          return;
        }

        // Выйти из комнаты/старой очереди
        leaveCurrentRoom("leave");
        removeFromQueue(ws);
        removeUserFromQueue(user.id);

        const level = Math.max(
          1,
          Math.min(50, Math.floor(Number(msg.level) || 1)),
        );
        const skills = sanitizeSkills((msg as { skills?: unknown }).skills);
        const entry: QueueEntry = {
          ws,
          userId: user.id,
          name,
          heroId,
          deck: deckCheck.deck,
          level,
          skills,
          ready: false,
          queuedAt: Date.now(),
        };
        matchQueue.push(entry);
        const band = pvpQueueBand(level, 0);
        send(ws, {
          type: "queued",
          levelMin: band.levelMin,
          levelMax: band.levelMax,
          delta: band.delta,
          waiting: 0,
        });
        tryMatchQueue(entry);
        return;
      }

      if (msg.type === "join") {
        const user = resolveUser(msg.token);
        if (!user) {
          console.warn("[pvp] join auth fail ip=", ip, "mode=", msg.mode);
          send(ws, {
            type: "error",
            message: "Нужен вход — выйди и войди в аккаунт снова",
          });
          return;
        }
        const joinRl = rateLimit(`ws-join:${user.id}`, 30, 60_000);
        if (!joinRl.ok) {
          send(ws, {
            type: "error",
            message: "Слишком много входов в комнаты",
          });
          return;
        }
        const mode = msg.mode === "create" ? "create" : "join";
        const deckCheck = validateDeck(msg.deck);
        if (!deckCheck.ok) {
          send(ws, { type: "error", message: deckCheck.error });
          return;
        }
        const heroId =
          sanitizeHeroId(msg.heroId) || sanitizeHeroId("hero_life")!;
        const name =
          sanitizeDisplayName(msg.name) ||
          sanitizeDisplayName(user.login) ||
          "Игрок";
        if (name.length < 2) {
          send(ws, { type: "error", message: "Короткое имя" });
          return;
        }

        removeFromQueue(ws);
        leaveCurrentRoom("leave");

        let code: string;
        let room: Room | null;
        if (mode === "create") {
          code = randomMatchCode();
          let guard = 0;
          while (rooms.has(code) && guard < 40) {
            code = randomMatchCode();
            guard++;
          }
          room = getOrCreate(code);
          if (!room) {
            send(ws, {
              type: "error",
              message: "Сервер переполнен, попробуй позже",
            });
            return;
          }
        } else {
          code = String(msg.code || "")
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .slice(0, 8);
          if (code.length < 3) {
            send(ws, {
              type: "error",
              message: "Код комнаты слишком короткий",
            });
            return;
          }
          room = rooms.get(code) ?? null;
          if (!room) {
            console.warn(
              "[pvp] join miss code=",
              code,
              "rooms=",
              rooms.size,
              "ip=",
              ip,
            );
            send(ws, {
              type: "error",
              message:
                "Комната не найдена. Хост пусть заново нажмёт «Создать комнату» и пришлёт новый код.",
            });
            return;
          }
        }

        // Возврат в свой бой после звонка/свёртки.
        if (room.battle && !winnerSeat(room.battle)) {
          const reclaimSeat: PvpSeat | null =
            room.host?.userId === user.id
              ? "host"
              : room.guest?.userId === user.id
                ? "guest"
                : null;
          if (!reclaimSeat) {
            send(ws, { type: "error", message: "Бой в этой комнате уже идёт" });
            return;
          }
          const old = reclaimSeat === "host" ? room.host! : room.guest!;
          if (seatOnline(old) && old.ws !== ws) {
            send(ws, {
              type: "error",
              message: "Ты уже в этом бою с другого окна",
            });
            return;
          }
          old.ws = ws;
          old.online = true;
          old.disconnectedAt = null;
          bindSocketRoom(ws, code);
          if (room.turnPausedForReconnect) {
            room.turnPausedForReconnect = false;
            if (!winnerSeat(room.battle)) scheduleTurnTimer(room);
          }
          send(ws, battlePayload(room, reclaimSeat));
          const peer = reclaimSeat === "host" ? room.guest : room.host;
          if (peer && isWsOpen(peer.ws)) {
            send(peer.ws, {
              type: "error",
              message: "Соперник вернулся в бой",
            });
          }
          return;
        }
        // После оконченного боя — чистая комната
        if (room.battle && winnerSeat(room.battle)) {
          clearTurnTimer(room);
          room.battle = null;
          room.host = null;
          room.guest = null;
          room.timeouts = { host: 0, guest: 0 };
          room.endReason = null;
          room.turnPausedForReconnect = false;
        }

        const player = makeSeat({
          ws,
          userId: user.id,
          name,
          heroId,
          deck: deckCheck.deck,
          level: Math.max(1, Math.min(50, Math.floor(Number(msg.level) || 1))),
          skills: sanitizeSkills((msg as { skills?: unknown }).skills),
          ready: false,
        });

        // Вернулся после сворачивания — забираем своё место по userId.
        if (room.host && room.host.userId === user.id) {
          if (seatOnline(room.host) && room.host.ws !== ws) {
            send(ws, {
              type: "error",
              message: "Ты уже хост этой комнаты (нужен другой аккаунт)",
            });
            return;
          }
          room.host = player;
        } else if (room.guest && room.guest.userId === user.id) {
          if (seatOnline(room.guest) && room.guest.ws !== ws) {
            send(ws, {
              type: "error",
              message: "Ты уже в этой комнате с другого окна",
            });
            return;
          }
          room.guest = player;
        } else if (!room.host) {
          room.host = player;
        } else if (!room.guest) {
          room.guest = player;
        } else {
          send(ws, { type: "error", message: "Комната заполнена" });
          return;
        }
        bindSocketRoom(ws, code);
        broadcastLobby(room);
        return;
      }

      const joinedCode = socketRoom.get(ws) ?? null;
      if (!joinedCode) {
        send(ws, { type: "error", message: "Сначала войди в комнату" });
        return;
      }
      const room = rooms.get(joinedCode);
      if (!room) {
        bindSocketRoom(ws, null);
        send(ws, { type: "error", message: "Комната исчезла" });
        return;
      }
      const seat = seatOf(room, ws);
      if (!seat) {
        bindSocketRoom(ws, null);
        send(ws, { type: "error", message: "Ты не в комнате" });
        return;
      }
      const me = seat === "host" ? room.host! : room.guest!;

      if (msg.type === "leave") {
        leaveCurrentRoom("leave");
        return;
      }

      if (msg.type === "ready") {
        if (room.battle) {
          send(ws, { type: "error", message: "Бой уже начат" });
          return;
        }
        me.ready = true;
        broadcastLobby(room);
        tryStart(room);
        return;
      }

      if (msg.type === "roll_dice") {
        if (!room.battle) {
          send(ws, { type: "error", message: "Бой ещё не начат" });
          return;
        }
        rollSeatDice(room, seat);
        return;
      }

      if (msg.type === "sync") {
        if (!room.battle) {
          send(ws, lobbyPayload(room, seat));
          return;
        }
        send(ws, battlePayload(room, seat));
        return;
      }

      if (msg.type === "action") {
        if (!room.battle) {
          send(ws, { type: "error", message: "Бой ещё не начат" });
          return;
        }
        if (room.battle.winner) {
          send(ws, { type: "error", message: "Бой уже окончен" });
          broadcastBattle(room);
          return;
        }
        unlockOpeningIfDue(room);
        const action = msg.action as PvpAction;
        if (room.openingPhase !== "done") {
          send(ws, { type: "error", message: "Сначала бросьте кубики" });
          broadcastBattle(room);
          return;
        }
        if (!isSeatTurn(room.battle, seat)) {
          pvpFail("ACTION_OUT_OF_TURN", {
            room: room.code,
            seat,
            active: room.battle.active,
            kind:
              action && typeof action === "object" && "kind" in action
                ? (action as { kind?: string }).kind
                : "?",
          });
          send(ws, { type: "error", message: "Сейчас ход соперника" });
          // Клиент мог успеть применить ход локально — вернём правду со стола.
          broadcastBattle(room);
          return;
        }
        try {
          const beforeActive = room.battle.active;
          const beforeTurn = room.battle.turn;
          const kind =
            action && typeof action === "object" && "kind" in action
              ? String((action as { kind?: string }).kind)
              : "?";
          const before = room.battle;
          const actorView = viewForSeat(before, seat);
          let actorFx: BattleFx | null = null;
          try {
            actorFx = fxForPvpAction(actorView, action);
          } catch {
            actorFx = null;
          }
          room.battle = applySeatAction(room.battle, seat, action);
          // seq ещё не ++ — broadcastBattle поднимет; пишем provisional seq+1
          const nextSeq = room.battleSeq + 1;
          room.lastFx = {
            seq: nextSeq,
            host: seat === "host" ? actorFx : actorFx ? flipBattleFx(actorFx) : null,
            guest:
              seat === "guest" ? actorFx : actorFx ? flipBattleFx(actorFx) : null,
          };
          const changed =
            room.battle.active !== beforeActive ||
            room.battle.turn !== beforeTurn ||
            room.battle !== before;
          if (kind === "endTurn" && room.battle.active === beforeActive) {
            pvpFail("ENDTURN_NOOP", {
              room: room.code,
              seat,
              active: beforeActive,
              turn: beforeTurn,
              pvpFirst: room.battle.pvpFirst,
            });
          }
          console.warn(
            `[pvp:OK] code=ACTION room=${room.code} seat=${seat} kind=${kind} ${beforeActive}/${beforeTurn}->${room.battle.active}/${room.battle.turn} changed=${changed}`,
          );
          if (winnerSeat(room.battle)) {
            room.endReason = "combat";
            clearTurnTimer(room);
            broadcastBattle(room);
            return;
          }
          if (
            room.battle.active !== beforeActive ||
            room.battle.turn !== beforeTurn
          ) {
            scheduleTurnTimer(room);
          }
          broadcastBattle(room);
          broadcastBattleSoon(room, 300);
          broadcastBattleSoon(room, 900);
        } catch (e) {
          send(ws, {
            type: "error",
            message: e instanceof Error ? e.message : "Ход отклонён",
          });
          broadcastBattle(room);
        }
      }
    });

    ws.on("error", () => {
      /* не роняем процесс */
    });

    ws.on("close", () => {
      removeFromQueue(ws);
      leaveCurrentRoom("disconnect");
    });
  });

  console.log(
    "[orakul] PvP WebSocket /ws/pvp (secured + turn timer + matchmaking)",
  );
  return wss;
}
