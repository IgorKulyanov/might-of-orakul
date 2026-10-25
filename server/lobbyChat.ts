import type { IncomingMessage, Server as HttpServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { rateLimit, sanitizeChatText, sanitizeDisplayName } from "./security.js";

type AuthLookup = (
  token: string,
) => { id: string; login: string; displayName?: string | null } | null;

type ChatMsg = {
  id: string;
  at: number;
  userId: string;
  name: string;
  text: string;
};

type ClientMsg =
  | { type: "hello"; token: string }
  | { type: "say"; text: string }
  | { type: "report"; msgId: string; reason?: string };

type ServerMsg =
  | { type: "history"; messages: ChatMsg[] }
  | { type: "chat"; message: ChatMsg }
  | { type: "error"; message: string }
  | { type: "ok"; message: string };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ORACUL_DATA_DIR
  ? path.resolve(process.env.ORACUL_DATA_DIR)
  : path.join(__dirname, "data");
const CHAT_FILE = path.join(DATA_DIR, "chat.jsonl");
const REPORT_FILE = path.join(DATA_DIR, "chat-reports.jsonl");
const MUTES_FILE = path.join(DATA_DIR, "chat-mutes.json");

const HISTORY_MAX = 80;
const MSG_MAX = 200;
const CHAT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_CLIENTS = 200;

const history: ChatMsg[] = [];
const clients = new Set<WebSocket>();
/** userId -> until ms */
const mutes = new Map<string, number>();
/** userId -> login (для админки) */
const muteMeta = new Map<string, { login: string; reason: string }>();

function loadMutes() {
  try {
    if (!fs.existsSync(MUTES_FILE)) return;
    const data = JSON.parse(fs.readFileSync(MUTES_FILE, "utf8")) as Record<
      string,
      { until: number; login?: string; reason?: string }
    >;
    const now = Date.now();
    for (const [id, row] of Object.entries(data || {})) {
      if (row?.until > now) {
        mutes.set(id, row.until);
        muteMeta.set(id, {
          login: row.login || id,
          reason: row.reason || "",
        });
      }
    }
  } catch (e) {
    console.warn("[chat] mutes load fail:", (e as Error).message);
  }
}

function saveMutes() {
  try {
    const now = Date.now();
    const out: Record<
      string,
      { until: number; login: string; reason: string }
    > = {};
    for (const [id, until] of mutes) {
      if (until <= now) {
        mutes.delete(id);
        muteMeta.delete(id);
        continue;
      }
      const meta = muteMeta.get(id);
      out[id] = {
        until,
        login: meta?.login || id,
        reason: meta?.reason || "",
      };
    }
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(MUTES_FILE, JSON.stringify(out, null, 2), "utf8");
  } catch (e) {
    console.warn("[chat] mutes save fail:", (e as Error).message);
  }
}

loadMutes();

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg: ServerMsg) {
  for (const ws of clients) send(ws, msg);
}

function loadHistory() {
  try {
    if (!fs.existsSync(CHAT_FILE)) return;
    const lines = fs.readFileSync(CHAT_FILE, "utf8").split("\n").filter(Boolean);
    const cutoff = Date.now() - CHAT_TTL_MS;
    for (const line of lines.slice(-HISTORY_MAX * 2)) {
      try {
        const m = JSON.parse(line) as ChatMsg;
        if (m?.text && m.at >= cutoff) history.push(m);
      } catch {
        /* skip */
      }
    }
    while (history.length > HISTORY_MAX) history.shift();
  } catch (e) {
    console.warn("[chat] load fail:", (e as Error).message);
  }
}

function appendChat(m: ChatMsg) {
  history.push(m);
  while (history.length > HISTORY_MAX) history.shift();
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(CHAT_FILE, `${JSON.stringify(m)}\n`, "utf8");
  } catch (e) {
    console.warn("[chat] append fail:", (e as Error).message);
  }
}

/** Раз в сутки: обрезать старый chat.jsonl. */
export function pruneChatLog() {
  try {
    if (!fs.existsSync(CHAT_FILE)) return;
    const cutoff = Date.now() - CHAT_TTL_MS;
    const lines = fs.readFileSync(CHAT_FILE, "utf8").split("\n").filter(Boolean);
    const keep: string[] = [];
    for (const line of lines) {
      try {
        const m = JSON.parse(line) as ChatMsg;
        if (m.at >= cutoff) keep.push(line);
      } catch {
        /* drop */
      }
    }
    const trimmed = keep.slice(-HISTORY_MAX * 3);
    fs.writeFileSync(CHAT_FILE, trimmed.length ? `${trimmed.join("\n")}\n` : "", "utf8");
    console.log(`[chat] prune: было ${lines.length}, осталось ${trimmed.length}`);
  } catch (e) {
    console.warn("[chat] prune fail:", (e as Error).message);
  }
}

loadHistory();

export function attachLobbyChat(
  server: HttpServer,
  authLookup: AuthLookup,
): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: "/ws/chat",
    maxPayload: 4096,
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    if (clients.size >= MAX_CLIENTS) {
      send(ws, { type: "error", message: "Чат переполнен, зайди позже" });
      ws.close();
      return;
    }

    let user: { id: string; login: string; name: string } | null = null;
    clients.add(ws);

    ws.on("message", (raw) => {
      const text = String(raw);
      if (text.length > 4000) {
        send(ws, { type: "error", message: "Слишком длинное сообщение" });
        return;
      }
      let msg: ClientMsg;
      try {
        msg = JSON.parse(text) as ClientMsg;
      } catch {
        send(ws, { type: "error", message: "Битый пакет" });
        return;
      }

      if (msg.type === "hello") {
        const u = authLookup(String(msg.token || ""));
        if (!u) {
          send(ws, { type: "error", message: "Нужен вход" });
          return;
        }
        const name =
          sanitizeDisplayName(u.displayName) ||
          sanitizeDisplayName(u.login) ||
          "Игрок";
        user = { id: u.id, login: u.login, name };
        send(ws, { type: "history", messages: history.slice(-HISTORY_MAX) });
        return;
      }

      if (!user) {
        send(ws, { type: "error", message: "Сначала авторизуйся в чате" });
        return;
      }

      if (msg.type === "report") {
        const rl = rateLimit(`chat-report:${user.id}`, 8, 60_000);
        if (!rl.ok) {
          send(ws, { type: "error", message: "Слишком много жалоб" });
          return;
        }
        const row = {
          at: new Date().toISOString(),
          by: user.id,
          byLogin: user.login,
          msgId: String(msg.msgId || "").slice(0, 64),
          reason: sanitizeChatText(msg.reason, 120) || "spam",
        };
        try {
          fs.appendFileSync(REPORT_FILE, `${JSON.stringify(row)}\n`, "utf8");
        } catch {
          /* ignore */
        }
        send(ws, { type: "ok", message: "Жалоба принята" });
        return;
      }

      if (msg.type === "say") {
        const muteUntil = mutes.get(user.id) || 0;
        if (Date.now() < muteUntil) {
          send(ws, { type: "error", message: "Ты в муте чата" });
          return;
        }
        const rl = rateLimit(`chat-say:${user.id}`, 8, 20_000);
        if (!rl.ok) {
          send(ws, { type: "error", message: "Пиши помедленнее" });
          return;
        }
        const body = sanitizeChatText(msg.text, MSG_MAX);
        if (body.length < 1) {
          send(ws, { type: "error", message: "Пустое сообщение" });
          return;
        }
        // Грубая защита от ссылок-спама
        if (/https?:\/\/|www\./i.test(body)) {
          send(ws, { type: "error", message: "Ссылки в чате запрещены" });
          return;
        }
        const chatMsg: ChatMsg = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          at: Date.now(),
          userId: user.id,
          name: user.name,
          text: body,
        };
        appendChat(chatMsg);
        broadcast({ type: "chat", message: chatMsg });
      }
    });

    ws.on("error", () => {
      /* ignore */
    });
    ws.on("close", () => {
      clients.delete(ws);
    });
  });

  console.log("[orakul] Lobby chat WebSocket /ws/chat");
  return wss;
}

export function muteChatUser(
  userId: string,
  ms: number,
  meta?: { login?: string; reason?: string },
) {
  const until = Date.now() + Math.max(0, ms);
  mutes.set(userId, until);
  muteMeta.set(userId, {
    login: meta?.login || muteMeta.get(userId)?.login || userId,
    reason: meta?.reason || "",
  });
  saveMutes();
  return until;
}

export function unmuteChatUser(userId: string) {
  mutes.delete(userId);
  muteMeta.delete(userId);
  saveMutes();
}

export function listChatMutes(): Array<{
  userId: string;
  login: string;
  until: number;
  reason: string;
}> {
  const now = Date.now();
  const out: Array<{
    userId: string;
    login: string;
    until: number;
    reason: string;
  }> = [];
  for (const [userId, until] of mutes) {
    if (until <= now) {
      mutes.delete(userId);
      muteMeta.delete(userId);
      continue;
    }
    const meta = muteMeta.get(userId);
    out.push({
      userId,
      login: meta?.login || userId,
      until,
      reason: meta?.reason || "",
    });
  }
  return out.sort((a, b) => a.until - b.until);
}

export function readTailJsonl(file: string, max = 40): unknown[] {
  try {
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    const slice = lines.slice(-max);
    const out: unknown[] = [];
    for (const line of slice) {
      try {
        out.push(JSON.parse(line));
      } catch {
        /* skip */
      }
    }
    return out.reverse();
  } catch {
    return [];
  }
}

export function chatDataPaths() {
  return { CHAT_FILE, REPORT_FILE, MUTES_FILE, FEEDBACK_HINT: "feedback.jsonl" };
}
