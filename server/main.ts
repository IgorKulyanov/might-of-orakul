import http from "node:http";
import { logAdminKeyHint } from "./admin.js";
import { app, PORT, findByToken, getLiveDb, markDormantUsers } from "./index.js";
import { attachLobbyChat, pruneChatLog } from "./lobbyChat.ts";
import { attachPvp } from "./pvpRooms.ts";

logAdminKeyHint();

/** Не роняем процесс из‑за одной кривой комнаты / промиса. */
process.on("uncaughtException", (err) => {
  console.error("[orakul] uncaughtException (живём дальше):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[orakul] unhandledRejection:", reason);
});

const server = http.createServer(app);
server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;
server.requestTimeout = 120_000;
server.maxHeadersCount = 50;

const authUser = (token: string) => {
  try {
    const db = getLiveDb();
    const u = findByToken(db, token);
    if (!u) return null;
    return {
      id: u.id,
      login: u.login,
      displayName: u.displayName ?? null,
    };
  } catch (e) {
    console.error("[orakul] authLookup fail:", e);
    return null;
  }
};

attachPvp(server, (token) => {
  const u = authUser(token);
  if (!u) return null;
  return { id: u.id, login: u.login };
});

attachLobbyChat(server, authUser);

function tryListen(retriesLeft: number) {
  const onErr = (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && retriesLeft > 0) {
      console.warn(
        `[orakul] порт ${PORT} занят, повтор через 2с (осталось ${retriesLeft})`,
      );
      try {
        server.close();
      } catch {
        /* ignore */
      }
      setTimeout(() => tryListen(retriesLeft - 1), 2000);
      return;
    }
    console.error("[orakul] listen fail:", err);
  };
  server.removeAllListeners("error");
  server.on("error", onErr);
  if (server.listening) {
    server.close(() => {
      server.listen(PORT, "0.0.0.0", onListening);
    });
    return;
  }
  server.listen(PORT, "0.0.0.0", onListening);
}

function onListening() {
  console.log(`Orakul API http://127.0.0.1:${PORT} (и по Wi‑Fi на :${PORT})`);
  console.log(`Orakul PvP ws://127.0.0.1:${PORT}/ws/pvp`);
  console.log(`Orakul Chat ws://127.0.0.1:${PORT}/ws/chat`);
}

tryListen(5);

/** Пульс БД + спящие аккаунты + подчистка чата. */
setInterval(() => {
  try {
    getLiveDb();
  } catch (e) {
    console.error("[orakul] db pulse fail:", e);
  }
}, 60_000).unref?.();

setInterval(() => {
  try {
    markDormantUsers();
  } catch (e) {
    console.error("[orakul] dormant fail:", e);
  }
}, 6 * 60 * 60 * 1000).unref?.();

setInterval(() => {
  try {
    pruneChatLog();
  } catch (e) {
    console.error("[orakul] chat prune fail:", e);
  }
}, 24 * 60 * 60 * 1000).unref?.();

// Первый проход через минуту после старта
setTimeout(() => {
  try {
    markDormantUsers();
    pruneChatLog();
  } catch {
    /* ignore */
  }
}, 60_000).unref?.();
