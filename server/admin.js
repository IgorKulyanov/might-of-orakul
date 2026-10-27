import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getChatOnlineCount,
  listChatMutes,
  muteChatUser,
  readTailJsonl,
  unmuteChatUser,
} from "./lobbyChat.ts";
import { getPresenceStats } from "./presence.ts";
import { getPvpLiveStats } from "./pvpRooms.ts";
import { LIMITS, sanitizeDisplayName } from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ORACUL_DATA_DIR
  ? path.resolve(process.env.ORACUL_DATA_DIR)
  : path.join(__dirname, "data");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.jsonl");
const REPORT_FILE = path.join(DATA_DIR, "chat-reports.jsonl");
const GRANTS_FILE = path.join(DATA_DIR, "admin-grants.jsonl");

const ADMIN_KEY_FILE = path.join(DATA_DIR, "admin.key");

/**
 * Ключ админки:
 * 1) env ORACUL_ADMIN_KEY
 * 2) иначе файл server/data/admin.key (создаётся сам, ключ только в логе сервера)
 * В UI ключ не светим — случайный игрок форму откроет, но не угадает.
 */
export function resolveAdminKey() {
  if (process.env.ORACUL_ADMIN_KEY) {
    return String(process.env.ORACUL_ADMIN_KEY).trim();
  }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(ADMIN_KEY_FILE)) {
      const existing = fs.readFileSync(ADMIN_KEY_FILE, "utf8").trim();
      if (existing.length >= 4) return existing;
    }
    const generated = `ora_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 12)}`;
    fs.writeFileSync(ADMIN_KEY_FILE, `${generated}\n`, "utf8");
    console.log(
      `[orakul] Админ-ключ создан → server/data/admin.key\n[orakul] Ключ: ${generated}`,
    );
    return generated;
  } catch (e) {
    console.error("[orakul] admin key fail:", e.message);
    return "";
  }
}

/** Один раз при старте — напомнить, где ключ (не в браузере). */
export function logAdminKeyHint() {
  const key = resolveAdminKey();
  if (!key) {
    console.warn("[orakul] админка выключена — нет ключа");
    return;
  }
  if (process.env.ORACUL_ADMIN_KEY) {
    console.log("[orakul] админка: ключ из ORACUL_ADMIN_KEY");
  } else {
    console.log(
      `[orakul] админка: ключ в server/data/admin.key (смотри лог выше / файл)`,
    );
  }
}

export function adminAuth(req, res, next) {
  const key = resolveAdminKey();
  if (!key) {
    res.status(403).json({ error: "Админка выключена (задай ORACUL_ADMIN_KEY)" });
    return;
  }
  const got =
    req.headers["x-admin-key"] ||
    req.body?.adminKey ||
    req.query?.adminKey ||
    "";
  if (String(got) !== key) {
    res.status(401).json({ error: "Неверный ключ админки" });
    return;
  }
  next();
}

function findUser(db, loginOrId) {
  const q = String(loginOrId || "")
    .trim()
    .toLowerCase();
  if (!q) return null;
  return (
    db.users.find((u) => u.id === loginOrId) ||
    db.users.find((u) => u.login === q) ||
    db.users.find(
      (u) =>
        (u.displayName || "").toLowerCase() ===
        String(loginOrId).trim().toLowerCase(),
    ) ||
    null
  );
}

/**
 * @param {import('express').Express} app
 * @param {{ withDb: Function, persistLiveDb: Function, publicUser: Function, getLiveDb: Function }} deps
 */
const OWNER_CODE = String(
  process.env.ORACUL_OWNER_CODE || "оракул792640",
)
  .trim()
  .toLowerCase()
  .replace(/\s+/g, "");

export function mountAdminRoutes(app, deps) {
  const { withDb, persistLiveDb, publicUser, getLiveDb, rateLimitMiddleware } =
    deps;

  /** Компенсация по коду из чата: себе не нужно — UI шлёт логин другого. */
  app.post(
    "/api/owner/boost",
    rateLimitMiddleware({ name: "owner-boost", maxN: 40, windowMs: 60_000 }),
    async (req, res) => {
      try {
        const code = String(req.body?.code || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "");
        if (!OWNER_CODE || code !== OWNER_CODE) {
          res.status(401).json({ error: "Неверный код" });
          return;
        }
        const login = String(req.body?.login || "").trim();
        const goldAdd = Math.floor(Number(req.body?.gold) || 0);
        const diaAdd = Math.floor(Number(req.body?.diamonds) || 0);
        const cardId = String(req.body?.cardId || "")
          .trim()
          .slice(0, 64);
        const note = String(req.body?.note || "компенсация")
          .slice(0, 120)
          .trim();
        if (!login) {
          res.status(400).json({ error: "Укажи логин игрока" });
          return;
        }
        if (goldAdd <= 0 && diaAdd <= 0 && !cardId) {
          res.status(400).json({ error: "Укажи золото, алмазы или карту" });
          return;
        }
        if (goldAdd > 500_000 || diaAdd > 50_000) {
          res.status(400).json({ error: "Слишком много за раз" });
          return;
        }
        const result = await withDb((db) => {
          const user = findUser(db, login);
          if (!user) return { missing: true };
          const pending = user.pendingGrants || {
            gold: 0,
            diamonds: 0,
            cards: [],
          };
          pending.gold = (Number(pending.gold) || 0) + Math.max(0, goldAdd);
          pending.diamonds =
            (Number(pending.diamonds) || 0) + Math.max(0, diaAdd);
          if (cardId) {
            const cards = Array.isArray(pending.cards) ? pending.cards : [];
            cards.push(cardId);
            pending.cards = cards.slice(0, 50);
          }
          user.pendingGrants = pending;
          persistLiveDb();
          const row = {
            at: new Date().toISOString(),
            login: user.login,
            userId: user.id,
            goldAdd: Math.max(0, goldAdd),
            diamondsAdd: Math.max(0, diaAdd),
            cardId: cardId || null,
            note: note || null,
          };
          try {
            fs.appendFileSync(GRANTS_FILE, `${JSON.stringify(row)}\n`, "utf8");
          } catch {
            /* ignore */
          }
          return { grant: row };
        });
        if (result.missing) {
          res.status(404).json({ error: "Игрок не найден" });
          return;
        }
        const parts = [];
        if (result.grant.goldAdd) parts.push(`+${result.grant.goldAdd}🪙`);
        if (result.grant.diamondsAdd)
          parts.push(`+${result.grant.diamondsAdd}💎`);
        if (result.grant.cardId) parts.push(`карта ${result.grant.cardId}`);
        res.json({
          ok: true,
          message: `${result.grant.login}: ${parts.join(" · ")} (увидит после входа/сейва)`,
          grant: result.grant,
        });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Не удалось выдать" });
      }
    },
  );

  app.post(
    "/api/admin/ping",
    rateLimitMiddleware({ name: "admin-ping", maxN: 30, windowMs: 60_000 }),
    adminAuth,
    (_req, res) => {
      res.json({
        ok: true,
        message: "Админ-ключ принят",
        users: getLiveDb().users.length,
      });
    },
  );

  app.get("/api/admin/inbox", adminAuth, (_req, res) => {
    res.json({
      feedback: readTailJsonl(FEEDBACK_FILE, 50),
      reports: readTailJsonl(REPORT_FILE, 50),
      mutes: listChatMutes(),
    });
  });

  app.get("/api/admin/stats", adminAuth, (_req, res) => {
    const db = getLiveDb();
    const now = Date.now();
    const users = db.users;
    const activeSince = (ms) =>
      users.filter((u) => {
        const t = Date.parse(u.lastLoginAt || u.createdAt || "");
        return Number.isFinite(t) && now - t <= ms;
      }).length;
    const registeredToday = users.filter((u) => {
      const t = Date.parse(u.createdAt || "");
      return Number.isFinite(t) && now - t <= 24 * 60 * 60_000;
    }).length;
    const bannedPvp = users.filter(
      (u) => Number(u.pvpFlee?.bannedUntil) > now,
    ).length;
    const pendingCampaign = users.filter((u) => u.pendingResetCampaign).length;
    const pvp = getPvpLiveStats();
    const presence = getPresenceStats(now);
    const chatOnline = getChatOnlineCount();
    /** В клиенте сейчас + кто в PvP/чате без пульса (перестраховка). */
    const onlineNow = Math.max(presence.online, chatOnline, pvp.players);
    res.json({
      ok: true,
      registered: users.length,
      registeredToday,
      dormant: users.filter((u) => u.dormant).length,
      onlineNow,
      onlineWho: presence.who,
      screens: {
        menu: presence.inMenu,
        battle: presence.inBattle,
        battlePvp: presence.inPvpClient,
        cabinet: presence.inCabinet,
        multi: presence.inMulti,
        other: presence.inOther,
      },
      active15m: activeSince(15 * 60_000),
      active1h: activeSince(60 * 60_000),
      active24h: activeSince(24 * 60 * 60_000),
      chatOnline,
      pvpRooms: pvp.rooms,
      pvpPlayers: pvp.players,
      pvpInBattle: pvp.inBattle,
      pvpInLobby: pvp.inLobby,
      bannedPvp,
      pendingCampaignResets: pendingCampaign,
      uptimeSec: Math.floor(process.uptime()),
    });
  });

  /** Снять бан за побеги из PvP (сервер + флаг клиенту). */
  app.post(
    "/api/admin/clear-pvp-ban",
    adminAuth,
    rateLimitMiddleware({ name: "admin-unban", maxN: 40, windowMs: 60_000 }),
    async (req, res) => {
      try {
        const login = String(req.body?.login || "").trim();
        if (!login) {
          res.status(400).json({ error: "Укажи логин" });
          return;
        }
        const result = await withDb((db) => {
          const user = findUser(db, login);
          if (!user) return { missing: true };
          user.pvpFlee = {
            day: new Date().toISOString().slice(0, 10),
            fleeCount: 0,
            bannedUntil: 0,
          };
          user.pendingClearPvpBan = true;
          persistLiveDb();
          return { login: user.login };
        });
        if (result.missing) {
          res.status(404).json({ error: "Игрок не найден" });
          return;
        }
        res.json({
          ok: true,
          message: `Бан PvP снят: ${result.login} (сработает при следующем входе/сейве)`,
        });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Не удалось снять бан" });
      }
    },
  );

  /** Сброс тропы игрока (клиент применит при /api/me). */
  app.post(
    "/api/admin/reset-campaign",
    adminAuth,
    rateLimitMiddleware({ name: "admin-reset-camp", maxN: 40, windowMs: 60_000 }),
    async (req, res) => {
      try {
        const login = String(req.body?.login || "").trim();
        if (!login) {
          res.status(400).json({ error: "Укажи логин" });
          return;
        }
        const result = await withDb((db) => {
          const user = findUser(db, login);
          if (!user) return { missing: true };
          user.pendingResetCampaign = true;
          persistLiveDb();
          return { login: user.login };
        });
        if (result.missing) {
          res.status(404).json({ error: "Игрок не найден" });
          return;
        }
        res.json({
          ok: true,
          message: `Кампания сбросится у ${result.login} при следующем входе/обновлении`,
        });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Не удалось сбросить кампанию" });
      }
    },
  );

  app.get("/api/admin/users", adminAuth, (req, res) => {
    const q = String(req.query?.q || "")
      .trim()
      .toLowerCase();
    const db = getLiveDb();
    let list = db.users;
    if (q) {
      list = list.filter(
        (u) =>
          u.login.includes(q) ||
          (u.displayName || "").toLowerCase().includes(q) ||
          u.id.includes(q),
      );
    }
    const now = Date.now();
    const out = list.slice(0, 40).map((u) => {
      const pg = Number(u.pendingGrants?.gold) || 0;
      const pd = Number(u.pendingGrants?.diamonds) || 0;
      const banUntil = Number(u.pvpFlee?.bannedUntil) || 0;
      return {
        id: u.id,
        login: u.login,
        displayName: u.displayName ?? null,
        lastLoginAt: u.lastLoginAt ?? null,
        dormant: Boolean(u.dormant),
        gold: (Number(u.owned?.gold) || 0) + pg,
        diamonds: (Number(u.owned?.diamonds) || 0) + pd,
        pendingGold: pg,
        pendingDiamonds: pd,
        level: u.owned?.level ?? 1,
        chatMutedUntil:
          listChatMutes().find((m) => m.userId === u.id)?.until ?? null,
        pvpBanned: banUntil > now,
        pvpBannedUntil: banUntil > now ? banUntil : null,
        pendingResetCampaign: Boolean(u.pendingResetCampaign),
      };
    });
    res.json({ users: out });
  });

  app.post(
    "/api/admin/mute",
    adminAuth,
    rateLimitMiddleware({ name: "admin-mute", maxN: 40, windowMs: 60_000 }),
    async (req, res) => {
      try {
        const login = String(req.body?.login || "").trim();
        const minutes = Math.max(
          1,
          Math.min(60 * 24 * 30, Math.floor(Number(req.body?.minutes) || 60)),
        );
        const reason = sanitizeDisplayName(req.body?.reason || "mute").slice(
          0,
          80,
        );
        const user = await withDb((db) => findUser(db, login));
        if (!user) {
          res.status(404).json({ error: "Игрок не найден" });
          return;
        }
        const until = muteChatUser(user.id, minutes * 60_000, {
          login: user.login,
          reason,
        });
        res.json({
          ok: true,
          login: user.login,
          until,
          message: `${user.login} в муте ${minutes} мин`,
        });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Не удалось выдать мут" });
      }
    },
  );

  app.post("/api/admin/unmute", adminAuth, async (req, res) => {
    try {
      const login = String(req.body?.login || "").trim();
      const user = await withDb((db) => findUser(db, login));
      if (!user) {
        res.status(404).json({ error: "Игрок не найден" });
        return;
      }
      unmuteChatUser(user.id);
      res.json({ ok: true, message: `Мут снят: ${user.login}` });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Не удалось снять мут" });
    }
  });

  /** Поощрение: золото и/или алмазы на аккаунт. */
  app.post(
    "/api/admin/grant",
    adminAuth,
    rateLimitMiddleware({ name: "admin-grant", maxN: 40, windowMs: 60_000 }),
    async (req, res) => {
      try {
        const login = String(req.body?.login || "").trim();
        const goldAdd = Math.floor(Number(req.body?.gold) || 0);
        const diaAdd = Math.floor(Number(req.body?.diamonds) || 0);
        const note = String(req.body?.note || "")
          .slice(0, 120)
          .trim();
        if (!login || (goldAdd <= 0 && diaAdd <= 0)) {
          res.status(400).json({
            error: "Укажи логин и сумму gold и/или diamonds (>0)",
          });
          return;
        }
        if (goldAdd > 500_000 || diaAdd > 50_000) {
          res.status(400).json({ error: "Слишком жирный грант за раз" });
          return;
        }
        const result = await withDb((db) => {
          const user = findUser(db, login);
          if (!user) return { missing: true };
          // Только pending: применится на /api/me или PUT сейва — локальный сейв не сотрёт.
          const pending = user.pendingGrants || { gold: 0, diamonds: 0 };
          pending.gold = (Number(pending.gold) || 0) + Math.max(0, goldAdd);
          pending.diamonds =
            (Number(pending.diamonds) || 0) + Math.max(0, diaAdd);
          user.pendingGrants = pending;
          persistLiveDb();
          const curG = Number(user.owned?.gold) || 0;
          const curD = Number(user.owned?.diamonds) || 0;
          const row = {
            at: new Date().toISOString(),
            login: user.login,
            userId: user.id,
            goldAdd: Math.max(0, goldAdd),
            diamondsAdd: Math.max(0, diaAdd),
            goldAfter: Math.min(LIMITS.MAX_GOLD, curG + pending.gold),
            diamondsAfter: Math.min(LIMITS.MAX_DIAMONDS, curD + pending.diamonds),
            pendingGold: pending.gold,
            pendingDiamonds: pending.diamonds,
            note: note || null,
          };
          try {
            fs.appendFileSync(GRANTS_FILE, `${JSON.stringify(row)}\n`, "utf8");
          } catch {
            /* ignore */
          }
          return { user: publicUser(user), grant: row };
        });
        if (result.missing) {
          res.status(404).json({ error: "Игрок не найден" });
          return;
        }
        res.json({
          ok: true,
          message: `Начислено ${result.grant.login}: +${result.grant.goldAdd}🪙 +${result.grant.diamondsAdd}💎`,
          user: result.user,
          grant: result.grant,
        });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Не удалось начислить" });
      }
    },
  );

  /** Скачать users.json (сейвы всех игроков) — потом залить на платный хост. */
  app.get("/api/admin/backup", adminAuth, (_req, res) => {
    const file = path.join(DATA_DIR, "users.json");
    if (!fs.existsSync(file)) {
      res.status(404).json({ error: "users.json ещё нет" });
      return;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="orakul-users-${stamp}.json"`,
    );
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.send(fs.readFileSync(file, "utf8"));
  });

  /** Залить users.json на этот сервер (миграция с домашнего ПК → Render). */
  app.post(
    "/api/admin/restore",
    rateLimitMiddleware({ name: "admin-restore", maxN: 3, windowMs: 60_000 }),
    adminAuth,
    async (req, res) => {
      try {
        const body = req.body;
        if (!body || typeof body !== "object" || !Array.isArray(body.users)) {
          res.status(400).json({
            error: "Нужен JSON вида { \"users\": [ ... ] } как в users.json",
          });
          return;
        }
        if (body.users.length > 50_000) {
          res.status(400).json({ error: "Слишком много пользователей" });
          return;
        }
        const result = await withDb((db) => {
          db.users = body.users;
          persistLiveDb();
          return { n: db.users.length };
        });
        res.json({
          ok: true,
          message: `Восстановлено игроков: ${result.n}`,
          users: result.n,
        });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Не удалось восстановить" });
      }
    },
  );
}
