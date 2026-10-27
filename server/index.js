import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v4 as uuid } from "uuid";
import { mountAdminRoutes } from "./admin.js";
import { mountPaymentRoutes } from "./paymentsYookassa.js";
import { touchPresence } from "./presence.ts";
import {
  hasRemoteDb,
  pullRemoteUsers,
  pushRemoteUsers,
} from "./remoteDb.js";
import {
  checkLoginThrottle,
  clientIp,
  noteLoginFail,
  noteLoginOk,
  rateLimitMiddleware,
  sanitizeChatText,
  sanitizeDisplayName,
  sanitizeHeroId,
  sanitizeLogin,
  sanitizeOwned,
} from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Для QA можно задать ORACUL_DATA_DIR — изолированная база, живые игроки не трогаются. */
const DATA_DIR = process.env.ORACUL_DATA_DIR
  ? path.resolve(process.env.ORACUL_DATA_DIR)
  : path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.jsonl");
const PORT = Number(process.env.PORT || 8787);
const DORMANT_AFTER_MS = 90 * 24 * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function touchSeen(user) {
  if (!user) return;
  user.lastLoginAt = nowIso();
  if (user.dormant) user.dormant = false;
}

/** Админ-поощрения: добить pending поверх owned (после мержа клиента). */
function flushPendingGrants(user) {
  if (!user?.pendingGrants) return;
  const g = Math.max(0, Math.floor(Number(user.pendingGrants.gold) || 0));
  const d = Math.max(0, Math.floor(Number(user.pendingGrants.diamonds) || 0));
  const cards = Array.isArray(user.pendingGrants.cards)
    ? user.pendingGrants.cards.map((c) => String(c).slice(0, 64)).filter(Boolean)
    : [];
  if (g <= 0 && d <= 0 && cards.length === 0) {
    user.pendingGrants = { gold: 0, diamonds: 0, cards: [] };
    return;
  }
  if (!user.owned || typeof user.owned !== "object") {
    user.owned = {
      unlocked: [],
      purchased: [],
      collection: {},
      decks: {},
      activeDeckId: "main",
      gold: 0,
      diamonds: 0,
      level: 1,
      xp: 0,
    };
  }
  user.owned.gold = Math.min(
    5_000_000,
    Math.max(0, (Number(user.owned.gold) || 0) + g),
  );
  user.owned.diamonds = Math.min(
    100_000,
    Math.max(0, (Number(user.owned.diamonds) || 0) + d),
  );
  if (cards.length > 0) {
    const unlocked = new Set(
      Array.isArray(user.owned.unlocked) ? user.owned.unlocked : [],
    );
    const purchased = new Set(
      Array.isArray(user.owned.purchased) ? user.owned.purchased : [],
    );
    const collection =
      user.owned.collection && typeof user.owned.collection === "object"
        ? { ...user.owned.collection }
        : {};
    for (const id of cards) {
      unlocked.add(id);
      purchased.add(id);
      const have = Math.max(0, Math.floor(Number(collection[id]) || 0));
      collection[id] = Math.min(3, have + 1);
    }
    user.owned.unlocked = [...unlocked].slice(0, 500);
    user.owned.purchased = [...purchased].slice(0, 500);
    user.owned.collection = collection;
  }
  user.pendingGrants = { gold: 0, diamonds: 0, cards: [] };
}
const MAX_BACKUPS = 20;
/** Не плодить бэкап на каждый клик — иначе 1000 входов = 1000 копий и тормоз. */
let lastBackupAt = 0;
const BACKUP_MIN_INTERVAL_MS = 60_000;

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

function emptyDb() {
  return { users: [] };
}

function parseDb(raw, label = "db") {
  const data = JSON.parse(raw);
  if (!data || !Array.isArray(data.users)) {
    throw new Error(`${label}: нет массива users`);
  }
  return data;
}

function listBackupFiles() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((n) => n.startsWith("users-") && n.endsWith(".json"))
    .map((n) => path.join(BACKUP_DIR, n))
    .sort()
    .reverse();
}

/** Восстановить из самого свежего валидного бэкапа (с игроками). */
function restoreFromBackup() {
  for (const file of listBackupFiles()) {
    try {
      const db = parseDb(fs.readFileSync(file, "utf8"), path.basename(file));
      if (db.users.length === 0) continue;
      atomicWriteUsers(db, { skipBackup: true });
      console.warn(
        `[orakul] users.json восстановлен из бэкапа ${path.basename(file)} (${db.users.length} акк.)`,
      );
      return db;
    } catch (e) {
      console.warn(`[orakul] битый бэкап ${path.basename(file)}:`, e.message);
    }
  }
  return null;
}

function ensureUsersFile() {
  if (!fs.existsSync(USERS_FILE)) {
    const restored = restoreFromBackup();
    if (restored) return;
    atomicWriteUsers(emptyDb(), { skipBackup: true });
    console.warn("[orakul] users.json создан пустым (бэкапов нет)");
    return;
  }
  try {
    const db = parseDb(fs.readFileSync(USERS_FILE, "utf8"), "users.json");
    if (db.users.length === 0) {
      const restored = restoreFromBackup();
      if (restored) return;
    }
  } catch (e) {
    console.error("[orakul] users.json повреждён:", e.message);
    const restored = restoreFromBackup();
    if (!restored) {
      atomicWriteUsers(emptyDb(), { skipBackup: true });
      console.error("[orakul] не удалось восстановить — начат пустой users.json");
    }
  }
}

function rotateBackup(currentRaw) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(BACKUP_DIR, `users-${stamp}.json`);
  fs.writeFileSync(dest, currentRaw, "utf8");
  const all = listBackupFiles();
  for (const old of all.slice(MAX_BACKUPS)) {
    try {
      fs.unlinkSync(old);
    } catch {
      /* ignore */
    }
  }
}

/** Атомарная запись: temp → rename. Не даём затереть живую базу пустой. */
function atomicWriteUsers(db, opts = {}) {
  if (!db || !Array.isArray(db.users)) {
    throw new Error("writeDb: некорректная структура");
  }

  let existingCount = 0;
  if (fs.existsSync(USERS_FILE)) {
    try {
      existingCount = parseDb(fs.readFileSync(USERS_FILE, "utf8")).users.length;
    } catch {
      existingCount = 0;
    }
  }

  // Защита от «скинуть 1000 игроков»: пустая запись поверх непустой — только явно
  if (
    db.users.length === 0 &&
    existingCount > 0 &&
    !opts.allowEmptyOverwrite
  ) {
    console.error(
      `[orakul] ОТКАЗ записи: попытка обнулить ${existingCount} аккаунтов. База не тронута.`,
    );
    throw new Error("Отказ обнулить базу пользователей");
  }

  const now = Date.now();
  if (
    !opts.skipBackup &&
    fs.existsSync(USERS_FILE) &&
    existingCount > 0 &&
    now - lastBackupAt >= BACKUP_MIN_INTERVAL_MS
  ) {
    try {
      rotateBackup(fs.readFileSync(USERS_FILE, "utf8"));
      lastBackupAt = now;
    } catch (e) {
      console.warn("[orakul] бэкап не создан:", e.message);
    }
  }

  const payload = JSON.stringify(db, null, 2);
  // Уникальный temp: иначе параллельные записи дерутся за один .tmp и роняют API.
  const tmp = `${USERS_FILE}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}.tmp`;
  fs.writeFileSync(tmp, payload, "utf8");
  fs.renameSync(tmp, USERS_FILE);
}

ensureUsersFile();

/** Живая копия в памяти — иначе 1000 одновременных read/write теряют аккаунты. */
let liveDb = null;

function loadDbFromDisk() {
  try {
    return parseDb(fs.readFileSync(USERS_FILE, "utf8"), "users.json");
  } catch (e) {
    console.error("[orakul] readDb fail:", e.message);
    const restored = restoreFromBackup();
    if (restored) return restored;
    return emptyDb();
  }
}

function getLiveDb() {
  if (!liveDb) liveDb = loadDbFromDisk();
  return liveDb;
}

function persistLiveDb() {
  atomicWriteUsers(liveDb);
  void pushRemoteUsers(liveDb);
}

/**
 * После sleep/redeploy диск Render пустой — поднимаем аккаунты из Redis-зеркала.
 * Вызывать до listen (см. main.ts).
 */
async function hydrateUsersFromRemote() {
  const local = getLiveDb();
  if (local.users.length > 0) {
    // Локальная база жива — освежить зеркало на всякий случай.
    void pushRemoteUsers(local);
    return { restored: false, users: local.users.length, remote: hasRemoteDb() };
  }
  const remote = await pullRemoteUsers();
  if (!remote || remote.users.length === 0) {
    console.warn(
      `[orakul] локально 0 аккаунтов` +
        (hasRemoteDb()
          ? ", Redis тоже пуст"
          : " (REDIS_URL не задан — после sleep аккаунты пропадут)"),
    );
    return { restored: false, users: 0, remote: hasRemoteDb() };
  }
  liveDb = remote;
  try {
    atomicWriteUsers(liveDb, { skipBackup: true });
  } catch (e) {
    console.warn("[orakul] запись после Redis:", e.message);
  }
  console.warn(
    `[orakul] восстановлено ${liveDb.users.length} акк. из Redis-зеркала`,
  );
  return { restored: true, users: liveDb.users.length, remote: true };
}

/** Очередь: все изменения users.json идут строго по одному. */
let dbChain = Promise.resolve();

function withDb(fn) {
  const run = dbChain.then(async () => {
    const db = getLiveDb();
    return await fn(db);
  });
  dbChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function publicUser(u) {
  return {
    id: u.id,
    login: u.login,
    displayName: u.displayName ?? null,
    heroId: u.heroId ?? null,
    telegramId: u.telegramId ?? null,
    owned: u.owned ?? null,
    needsOnboarding: !u.displayName || !u.heroId,
    lastLoginAt: u.lastLoginAt ?? null,
    dormant: Boolean(u.dormant),
    pendingResetCampaign: Boolean(u.pendingResetCampaign),
    pendingClearPvpBan: Boolean(u.pendingClearPvpBan),
    pvpFlee: u.pvpFlee
      ? {
          day: String(u.pvpFlee.day || ""),
          fleeCount: Math.max(0, Math.floor(Number(u.pvpFlee.fleeCount) || 0)),
          bannedUntil: Math.max(
            0,
            Math.floor(Number(u.pvpFlee.bannedUntil) || 0),
          ),
        }
      : null,
  };
}

/** Пометить спящих (90 дней без входа). Аккаунты НЕ удаляем. */
export function markDormantUsers() {
  const db = getLiveDb();
  const cutoff = Date.now() - DORMANT_AFTER_MS;
  let n = 0;
  for (const u of db.users) {
    const last = Date.parse(u.lastLoginAt || u.createdAt || "");
    if (!Number.isFinite(last)) continue;
    if (last < cutoff && !u.dormant) {
      u.dormant = true;
      n += 1;
    }
  }
  if (n > 0) {
    try {
      persistLiveDb();
      console.log(`[orakul] dormant: помечено ${n} акк. (90+ дней без входа)`);
    } catch (e) {
      console.warn("[orakul] dormant persist fail:", e.message);
    }
  }
  return n;
}

function findByToken(db, token) {
  if (!token) return null;
  return db.users.find((u) => u.token === token) ?? null;
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const db = getLiveDb();
  const user = findByToken(db, token);
  if (!user) {
    res.status(401).json({ error: "Нужен вход" });
    return;
  }
  req.user = user;
  next();
}

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "512kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
/** Health без rate-limit — иначе мониторинг/QA ловят 429 после шторма. */
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    uptime: Math.floor(process.uptime()),
    users: getLiveDb().users.length,
    remoteDb: hasRemoteDb(),
  });
});

app.use(
  "/api",
  rateLimitMiddleware({ name: "api", maxN: 180, windowMs: 60_000 }),
);

/** Пульс «я в игре» — админка считает онлайн без записи на диск. */
app.post(
  "/api/presence",
  auth,
  rateLimitMiddleware({
    name: "presence",
    maxN: 60,
    windowMs: 60_000,
    keyFn: (req) => `presence:${req.user?.id || clientIp(req)}`,
  }),
  (req, res) => {
    try {
      const row = touchPresence({
        userId: req.user.id,
        login: req.user.login,
        displayName: req.user.displayName,
        screen: req.body?.screen,
      });
      res.json({ ok: true, screen: row.screen });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "presence fail" });
    }
  },
);

app.post(
  "/api/register",
  rateLimitMiddleware({ name: "register", maxN: 8, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const login = sanitizeLogin(req.body?.login);
      const password = String(req.body?.password || "").slice(0, 72);
      if (login.length < 3 || password.length < 4) {
        res.status(400).json({
          error:
            "Логин от 3 лат. букв/цифр (a-z, 0-9, _ - .), пароль от 4. Кириллица в логине срезается.",
        });
        return;
      }
      // bcrypt вне очереди — иначе 1000 регистраций встанут в один ряд на минуты.
      const passwordHash = await bcrypt.hash(password, 10);
      const result = await withDb((db) => {
        if (db.users.some((u) => u.login === login)) {
          return { conflict: true };
        }
        const user = {
          id: uuid(),
          login,
          passwordHash,
          token: uuid(),
          displayName: null,
          heroId: null,
          telegramId: null,
          owned: null,
          createdAt: nowIso(),
          lastLoginAt: nowIso(),
          dormant: false,
        };
        db.users.push(user);
        persistLiveDb();
        return { token: user.token, user: publicUser(user) };
      });
      if (result.conflict) {
        res.status(409).json({ error: "Такой логин уже есть" });
        return;
      }
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Ошибка регистрации" });
    }
  },
);

app.post(
  "/api/login",
  rateLimitMiddleware({ name: "login", maxN: 20, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const login = sanitizeLogin(req.body?.login);
      const password = String(req.body?.password || "").slice(0, 72);
      const ip = clientIp(req);
      const throttle = checkLoginThrottle(ip, login);
      if (!throttle.ok) {
        res.status(429).json({ error: throttle.error });
        return;
      }
      const found = getLiveDb().users.find((u) => u.login === login);
      if (!found) {
        // Не троттлим IP за «нет аккаунта» — иначе брутфорс логинов
        // и сброс хоста блокируют всех с одного Wi‑Fi.
        res.status(401).json({
          error:
            "Аккаунт не найден. На бесплатном хосте база могла сброситься — нажми «Восстановить аккаунт» с тем же логином и паролем (прогресс в браузере сохранится).",
          code: "ACCOUNT_MISSING",
        });
        return;
      }
      const okPass = await bcrypt.compare(password, found.passwordHash);
      if (!okPass) {
        noteLoginFail(throttle.key);
        res.status(401).json({ error: "Неверный логин или пароль" });
        return;
      }
      noteLoginOk(throttle.key);
      const result = await withDb((db) => {
        const user = db.users.find((u) => u.login === login);
        if (!user) return null;
        user.token = uuid();
        touchSeen(user);
        persistLiveDb();
        return { token: user.token, user: publicUser(user) };
      });
      if (!result) {
        res.status(401).json({ error: "Неверный логин или пароль" });
        return;
      }
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Ошибка входа" });
    }
  },
);

/** Заглушка Telegram: принимает initData / telegramId без полной валидации HMAC (для dev). */
app.post(
  "/api/telegram-auth",
  rateLimitMiddleware({ name: "tg-auth", maxN: 12, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const telegramId = String(
        req.body?.telegramId || req.body?.user?.id || "",
      )
        .trim()
        .replace(/[^0-9]/g, "")
        .slice(0, 32);
      const firstName = sanitizeDisplayName(
        req.body?.firstName || req.body?.user?.first_name || "Игрок",
      );
      if (!telegramId) {
        res.status(400).json({ error: "Нет telegramId" });
        return;
      }
      const passwordHash = await bcrypt.hash(uuid(), 10);
      const result = await withDb((db) => {
        let user = db.users.find((u) => u.telegramId === telegramId);
        if (!user) {
          user = {
            id: uuid(),
            login: `tg_${telegramId}`,
            passwordHash,
            token: uuid(),
            displayName: null,
            heroId: null,
            telegramId,
            owned: null,
            createdAt: nowIso(),
            lastLoginAt: nowIso(),
            dormant: false,
            tgHintName: firstName || "Игрок",
          };
          db.users.push(user);
        } else {
          user.token = uuid();
          touchSeen(user);
        }
        persistLiveDb();
        return { token: user.token, user: publicUser(user) };
      });
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Ошибка Telegram auth" });
    }
  },
);

app.get("/api/me", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await withDb((db) => {
      const u = db.users.find((x) => x.id === userId);
      if (!u) return null;
      touchSeen(u);
      flushPendingGrants(u);
      persistLiveDb();
      return publicUser(u);
    });
    if (!user) {
      res.status(401).json({ error: "Нужен вход" });
      return;
    }
    res.json({ user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Ошибка профиля" });
  }
});

app.post(
  "/api/feedback",
  auth,
  rateLimitMiddleware({
    name: "feedback",
    maxN: 5,
    windowMs: 24 * 60 * 60 * 1000,
    keyFn: (req) => `feedback:${req.user?.id || clientIp(req)}`,
  }),
  (req, res) => {
    try {
      const text = sanitizeChatText(req.body?.text, 800);
      if (text.length < 5) {
        res.status(400).json({ error: "Напиши хотя бы пару слов" });
        return;
      }
      const row = {
        at: nowIso(),
        userId: req.user.id,
        login: req.user.login,
        name: req.user.displayName || req.user.login,
        text,
        screen: sanitizeChatText(req.body?.screen, 40) || null,
      };
      fs.appendFileSync(FEEDBACK_FILE, `${JSON.stringify(row)}\n`, "utf8");
      console.log(`[orakul] feedback from ${row.login}: ${text.slice(0, 80)}`);
      res.json({ ok: true, message: "Спасибо! Сообщение ушло разработчику." });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Не удалось отправить" });
    }
  },
);

app.put(
  "/api/me",
  auth,
  rateLimitMiddleware({
    name: "save",
    maxN: 40,
    windowMs: 60_000,
    keyFn: (req) => `save:${req.user?.id || clientIp(req)}`,
  }),
  async (req, res) => {
    try {
      const body = req.body || {};
      const userId = req.user.id;
      const result = await withDb((db) => {
        const user = db.users.find((u) => u.id === userId);
        if (!user) return null;
        if (typeof body.displayName === "string") {
          const name = sanitizeDisplayName(body.displayName);
          if (name.length >= 2) user.displayName = name;
        }
        if (typeof body.heroId === "string") {
          const h = sanitizeHeroId(body.heroId);
          if (h) user.heroId = h;
        }
        if (body.owned && typeof body.owned === "object") {
          user.owned = sanitizeOwned(body.owned, user.owned);
          if (user.owned?.heroId) {
            const h = sanitizeHeroId(user.owned.heroId);
            if (h) user.heroId = h;
          }
        }
        if (body.clearPendingResetCampaign) {
          user.pendingResetCampaign = false;
        }
        if (body.clearPendingClearPvpBan) {
          user.pendingClearPvpBan = false;
        }
        if (body.pvpFlee && typeof body.pvpFlee === "object") {
          const day = String(body.pvpFlee.day || "").slice(0, 16);
          const fleeCount = Math.max(
            0,
            Math.min(100, Math.floor(Number(body.pvpFlee.fleeCount) || 0)),
          );
          const bannedUntil = Math.max(
            0,
            Math.floor(Number(body.pvpFlee.bannedUntil) || 0),
          );
          const prev = user.pvpFlee || {};
          // Не даём клиенту сам снять бан: только поднять счётчик/срок
          const nextCount = Math.max(
            Number(prev.fleeCount) || 0,
            fleeCount,
          );
          const nextBan = Math.max(
            Number(prev.bannedUntil) || 0,
            bannedUntil,
          );
          user.pvpFlee = {
            day: day || prev.day || new Date().toISOString().slice(0, 10),
            fleeCount: nextCount,
            bannedUntil: nextBan,
          };
        }
        // Поощрения админа поверх сейва клиента (чтобы локальный сейв не стёр бонус)
        flushPendingGrants(user);
        persistLiveDb();
        return publicUser(user);
      });
      if (!result) {
        res.status(404).json({ error: "Не найден" });
        return;
      }
      res.json({ user: result });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Ошибка сохранения" });
    }
  },
);

/**
 * Устаревший HTTP-заглушка. Живые комнаты — только WebSocket /ws/pvp
 * (create/join в MultiMenu). Оставлен для старых клиентов/QA.
 */
app.post(
  "/api/rooms",
  auth,
  rateLimitMiddleware({ name: "rooms", maxN: 30, windowMs: 60_000 }),
  (_req, res) => {
    res.status(410).json({
      error:
        "Создай комнату в игре: «Создать комнату (PvP)» — живой бой по WebSocket.",
      useWebSocket: "/ws/pvp",
    });
  },
);

mountPaymentRoutes(app, {
  withDb,
  persistLiveDb,
  flushPendingGrants,
  rateLimitMiddleware,
  auth,
});

mountAdminRoutes(app, {
  withDb,
  persistLiveDb,
  publicUser,
  getLiveDb,
  rateLimitMiddleware,
});

/** Глобальный ловец ошибок Express — не роняем процесс. */
app.use((err, _req, res, _next) => {
  console.error("[orakul] express error:", err?.message || err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Внутренняя ошибка" });
  }
});

export { app, PORT, findByToken, getLiveDb, hydrateUsersFromRemote };
