import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { CARD_MAP } from "../src/game/cards.ts";
import {
  activeSeat,
  applySeatAction,
  forceWin,
  isSeatTurn,
  PVP_MATCH_LEVEL_DELTA,
  PVP_MAX_TIMEOUTS,
  PVP_TURN_SEC,
  seatOpeningDice,
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
  ready: boolean;
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
};

const rooms = new Map<string, Room>();
const KNOWN_CARDS = new Set(Object.keys(CARD_MAP));
const MAX_ROOMS = 200;
const MAX_MSG_BYTES = 120_000;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const TURN_MS = PVP_TURN_SEC * 1000;

type QueueEntry = SeatPlayer & { queuedAt: number };

/** Очередь автопоиска живых соперников (±PVP_MATCH_LEVEL_DELTA). */
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
  let best: QueueEntry | null = null;
  let bestScore = Infinity;
  for (const other of matchQueue) {
    if (other.ws === entry.ws) continue;
    if (other.userId === entry.userId) continue;
    if (!isWsOpen(other.ws)) continue;
    const diff = Math.abs(other.level - entry.level);
    if (diff > PVP_MATCH_LEVEL_DELTA) continue;
    // Ближе по уровню важнее; при равенстве — кто дольше ждёт
    const score = diff * 1000 - (Date.now() - other.queuedAt) / 1000;
    if (score < bestScore) {
      bestScore = score;
      best = other;
    }
  }
  return best;
}

function pairIntoRoom(a: QueueEntry, b: QueueEntry): Room | null {
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
  if (!room) return null;
  const host: SeatPlayer = {
    ws: a.ws,
    userId: a.userId,
    name: a.name,
    heroId: a.heroId,
    deck: a.deck,
    level: a.level,
    ready: true,
  };
  const guest: SeatPlayer = {
    ws: b.ws,
    userId: b.userId,
    name: b.name,
    heroId: b.heroId,
    deck: b.deck,
    level: b.level,
    ready: true,
  };
  room.host = host;
  room.guest = guest;
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
  const room = pairIntoRoom(startWith, partner);
  if (!room || !room.host || !room.guest) return null;
  bindSocketRoom(room.host.ws, room.code);
  bindSocketRoom(room.guest.ws, room.code);
  broadcastLobby(room);
  tryStart(room);
  return room;
}

setInterval(() => {
  pruneQueue();
  // Повторные попытки на случай, если второй зашёл раньше и ждёт
  for (const entry of [...matchQueue]) {
    if (tryMatchQueue(entry)) break;
  }
}, 2000).unref?.();

function send(ws: WebSocket, msg: PvpServerMsg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function clearTurnTimer(room: Room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
  room.turnEndsAt = null;
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
  };
}

function broadcastLobby(room: Room) {
  if (room.host) send(room.host.ws, lobbyPayload(room, "host"));
  if (room.guest) send(room.guest.ws, lobbyPayload(room, "guest"));
}

function battlePayload(room: Room, seat: PvpSeat): PvpServerMsg {
  const battle = room.battle!;
  const yourTimeouts =
    seat === "host" ? room.timeouts.host : room.timeouts.guest;
  const foeTimeouts =
    seat === "host" ? room.timeouts.guest : room.timeouts.host;
  return {
    type: "battle",
    code: room.code,
    youAre: seat,
    state: viewForSeat(battle, seat),
    yourTurn: isSeatTurn(battle, seat),
    turnEndsAt: room.turnEndsAt,
    yourTimeouts,
    foeTimeouts,
    maxTimeouts: PVP_MAX_TIMEOUTS,
    turnLimitSec: PVP_TURN_SEC,
    openingDice: room.openingDice
      ? seatOpeningDice(room.openingDice, seat)
      : undefined,
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
  const win = winnerSeat(room.battle);
  const reason = room.endReason ?? "combat";
  for (const seat of ["host", "guest"] as const) {
    const p = seat === "host" ? room.host : room.guest;
    if (!p) continue;
    if (win) send(p.ws, endMessage(seat, win, reason));
    send(p.ws, battlePayload(room, seat));
  }
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
  broadcastBattle(room);
}

function tryStart(room: Room) {
  if (room.battle) return;
  if (!room.host?.ready || !room.guest?.ready) return;
  try {
    const started = startPvpBattle({
      host: {
        deck: room.host.deck,
        heroId: room.host.heroId,
        name: room.host.name,
        level: room.host.level,
      },
      guest: {
        deck: room.guest.deck,
        heroId: room.guest.heroId,
        name: room.guest.name,
        level: room.guest.level,
      },
    });
    room.battle = started.state;
    room.openingDice = started.dice;
    room.timeouts = { host: 0, guest: 0 };
    room.endReason = null;
    room.battle = {
      ...room.battle,
      log: [
        `Лимит хода: ${PVP_TURN_SEC}с · ${PVP_MAX_TIMEOUTS} пропусков = поражение`,
        ...(room.battle.log ?? []),
      ].slice(0, 14),
    };
    broadcastBattle(room);
    // Дать обоим увидеть кубик, потом стартует лимит хода.
    room.turnTimer = setTimeout(() => {
      if (!room.battle || winnerSeat(room.battle)) return;
      scheduleTurnTimer(room);
      broadcastBattle(room);
    }, 2800);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось начать бой";
    if (room.host) send(room.host.ws, { type: "error", message });
    if (room.guest) send(room.guest.ws, { type: "error", message });
    if (room.host) room.host.ready = false;
    if (room.guest) room.guest.ready = false;
    broadcastLobby(room);
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
  if (hadLiveBattle) {
    finishForfeit(room, seat, reason === "disconnect" ? "disconnect" : "leave");
  }

  const peer = seat === "host" ? room.guest : room.host;
  if (seat === "host") room.host = null;
  else room.guest = null;

  if (!room.battle) {
    if (room.host) room.host.ready = false;
    if (room.guest) room.guest.ready = false;
    if (peer) {
      send(peer.ws, {
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

function gcRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const alive =
      (room.host && room.host.ws.readyState === room.host.ws.OPEN) ||
      (room.guest && room.guest.ws.readyState === room.guest.ws.OPEN);
    if (!alive && now - room.createdAt > 60_000) {
      clearTurnTimer(room);
      rooms.delete(code);
      continue;
    }
    if (now - room.createdAt > ROOM_TTL_MS) {
      clearTurnTimer(room);
      rooms.delete(code);
    }
  }
}

setInterval(gcRooms, 60_000).unref?.();

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
      String(req.headers["x-forwarded-for"] || "")
        .split(",")[0]
        .trim() ||
      req.socket.remoteAddress ||
      "unknown";
    const connRl = rateLimit(`pvp-conn:${ip}`, 12, 60_000);
    if (!connRl.ok) {
      send(ws, { type: "error", message: "Слишком много подключений к PvP" });
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      return;
    }

    const leaveCurrentRoom = (reason: "leave" | "disconnect") => {
      const code = socketRoom.get(ws) ?? null;
      if (!code) return;
      const room = rooms.get(code);
      bindSocketRoom(ws, null);
      if (!room) return;
      const seat = seatOf(room, ws);
      if (seat) detach(room, seat, reason);
    };

    ws.on("message", (raw) => {
      const rl = rateLimit(`ws:${connId}`, 40, 5_000);
      if (!rl.ok) {
        send(ws, { type: "error", message: "Слишком много сообщений" });
        return;
      }
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

      if (msg.type === "cancel_queue") {
        removeFromQueue(ws);
        send(ws, { type: "queue_cancelled" });
        return;
      }

      if (msg.type === "queue") {
        const user = authLookup(String(msg.token || ""));
        if (!user) {
          send(ws, { type: "error", message: "Нужен вход" });
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
        const entry: QueueEntry = {
          ws,
          userId: user.id,
          name,
          heroId,
          deck: deckCheck.deck,
          level,
          ready: false,
          queuedAt: Date.now(),
        };
        matchQueue.push(entry);
        const delta = PVP_MATCH_LEVEL_DELTA;
        send(ws, {
          type: "queued",
          levelMin: Math.max(1, level - delta),
          levelMax: Math.min(50, level + delta),
          delta,
        });
        tryMatchQueue(entry);
        return;
      }

      if (msg.type === "join") {
        const user = authLookup(String(msg.token || ""));
        if (!user) {
          send(ws, { type: "error", message: "Нужен вход" });
          return;
        }
        const joinRl = rateLimit(`ws-join:${user.id}`, 10, 60_000);
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
            send(ws, {
              type: "error",
              message: "Комната не найдена. Проверь код или создай свою.",
            });
            return;
          }
        }

        if (room.battle && !winnerSeat(room.battle)) {
          send(ws, { type: "error", message: "Бой в этой комнате уже идёт" });
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
        }

        const player: SeatPlayer = {
          ws,
          userId: user.id,
          name,
          heroId,
          deck: deckCheck.deck,
          level: Math.max(1, Math.min(50, Math.floor(Number(msg.level) || 1))),
          ready: false,
        };

        if (
          room.host &&
          room.host.userId === user.id &&
          room.host.ws.readyState !== ws.OPEN
        ) {
          room.host = player;
        } else if (!room.host) {
          room.host = player;
        } else if (!room.guest) {
          if (room.host.userId === user.id) {
            send(ws, {
              type: "error",
              message: "Ты уже хост этой комнаты (нужен другой аккаунт)",
            });
            return;
          }
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

      if (msg.type === "action") {
        if (!room.battle) {
          send(ws, { type: "error", message: "Бой ещё не начат" });
          return;
        }
        if (room.battle.winner) {
          send(ws, { type: "error", message: "Бой уже окончен" });
          return;
        }
        const action = msg.action as PvpAction;
        if (
          action.kind !== "commitState" &&
          !isSeatTurn(room.battle, seat)
        ) {
          send(ws, { type: "error", message: "Сейчас ход соперника" });
          return;
        }
        try {
          const beforeActive = room.battle.active;
          const beforeTurn = room.battle.turn;
          room.battle = applySeatAction(room.battle, seat, action);
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
