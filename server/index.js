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
  mailConfigured,
  mailDevMode,
  makeVerifyCode,
  sanitizeEmail,
  sendVerifyEmail,
} from "./mail.js";
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

const VERIFY_TTL_MS = 15 * 60 * 1000;

function userEmailVerified(u) {
  // Старые аккаунты без почты — дед: не ломаем вход
  if (!u.email) return true;
  return Boolean(u.emailVerified);
}

function maskEmail(email) {
  const e = String(email || "");
  const at = e.indexOf("@");
  if (at < 2) return e ? "***" : null;
  return `${e.slice(0, 2)}***${e.slice(at)}`;
}

/** Вход: почта (новые) или старый логин. */
function findUserByLoginOrEmail(db, raw) {
  const email = sanitizeEmail(raw);
  if (email) {
    const byEmail = db.users.find((u) => sanitizeEmail(u.email) === email);
    if (byEmail) return byEmail;
  }
  const login = sanitizeLogin(raw);
  if (login.length >= 3) {
    return db.users.find((u) => u.login === login) || null;
  }
  return null;
}

/** Внутренний login из почты (для совместимости со старым кодом). */
function allocateLoginFromEmail(db, email) {
  const local = sanitizeLogin(String(email).split("@")[0] || "player") || "player";
  let candidate = local.slice(0, 24);
  if (!db.users.some((u) => u.login === candidate)) return candidate;
  for (let i = 2; i < 10000; i++) {
    const suffix = String(i);
    candidate = `${local.slice(0, Math.max(1, 24 - suffix.length))}${suffix}`;
    if (!db.users.some((u) => u.login === candidate)) return candidate;
  }
  return `p${Date.now().toString(36)}`.slice(0, 24);
}

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
  const verified = userEmailVerified(u);
  return {
    id: u.id,
    login: u.login,
    displayName: u.displayName ?? null,
    heroId: u.heroId ?? null,
    telegramId: u.telegramId ?? null,
    owned: u.owned ?? null,
    email: maskEmail(u.email),
    emailVerified: verified,
    needsEmailVerify: Boolean(u.email) && !verified,
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

/**
 * Пустышки: регистрация без ника и оракула.
 * Свежие (<1ч) не трогаем — человек может выбирать школу.
 * Старше maxAgeMs — удаляем, чтобы не засорять базу.
 */
export function pruneEmptyShellAccounts(maxAgeMs = 24 * 60 * 60 * 1000) {
  const db = getLiveDb();
  const now = Date.now();
  const keep = [];
  let removed = 0;
  for (const u of db.users) {
    const empty =
      !sanitizeDisplayName(u.displayName) &&
      !u.heroId &&
      !u.owned?.homeFaction;
    if (!empty) {
      keep.push(u);
      continue;
    }
    const created = Date.parse(u.createdAt || "") || 0;
    const age = created ? now - created : maxAgeMs + 1;
    if (age < 60 * 60 * 1000) {
      keep.push(u);
      continue;
    }
    if (age >= maxAgeMs) {
      removed += 1;
      continue;
    }
    keep.push(u);
  }
  if (removed > 0) {
    db.users = keep;
    try {
      persistLiveDb();
      console.log(
        `[orakul] пустышки: удалено ${removed} акк. без ника/оракула (>${Math.round(maxAgeMs / 3600000)}ч)`,
      );
    } catch (e) {
      console.warn("[orakul] prune empty persist fail:", e.message);
    }
  }
  return removed;
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
    mail: mailConfigured(),
    mailDev: mailDevMode(),
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
      const password = String(req.body?.password || "").slice(0, 72);
      const email = sanitizeEmail(req.body?.email);
      if (password.length < 4) {
        res.status(400).json({ error: "Пароль от 4 символов" });
        return;
      }
      if (!email) {
        res.status(400).json({
          error: "Укажи рабочую почту — на неё придёт код, ею же входишь",
          code: "EMAIL_REQUIRED",
        });
        return;
      }
      if (!mailConfigured()) {
        res.status(503).json({
          error:
            "Регистрация по почте временно недоступна: на сервере не настроен MAIL_FROM + Resend/SMTP",
          code: "MAIL_NOT_CONFIGURED",
        });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const code = makeVerifyCode();
      const result = await withDb((db) => {
        if (
          db.users.some((u) => sanitizeEmail(u.email) === email)
        ) {
          return { conflict: "email" };
        }
        const login = allocateLoginFromEmail(db, email);
        const user = {
          id: uuid(),
          login,
          passwordHash,
          token: uuid(),
          email,
          emailVerified: false,
          emailVerifyCode: code,
          emailVerifyExpires: Date.now() + VERIFY_TTL_MS,
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
      if (result.conflict === "email") {
        res.status(409).json({
          error: "Эта почта уже занята — войди или укажи другую",
          code: "EMAIL_TAKEN",
        });
        return;
      }

      const sent = await sendVerifyEmail(email, code);
      if (!sent.ok) {
        console.warn("[mail] register send fail:", sent.error);
      }
      res.json({
        ...result,
        needsEmailVerify: true,
        ...(sent.devCode ? { devCode: sent.devCode } : {}),
        ...(sent.ok
          ? {}
          : { mailWarning: sent.error || "Письмо не ушло — нажми «Выслать код»" }),
      });
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
      // Почта (новые) или старый логин — одно поле
      const identity = String(req.body?.email || req.body?.login || "").trim();
      const password = String(req.body?.password || "").slice(0, 72);
      const ip = clientIp(req);
      const throttleKey = sanitizeEmail(identity) || sanitizeLogin(identity) || "x";
      const throttle = checkLoginThrottle(ip, throttleKey);
      if (!throttle.ok) {
        res.status(429).json({ error: throttle.error });
        return;
      }
      const found = findUserByLoginOrEmail(getLiveDb(), identity);
      if (!found) {
        res.status(401).json({
          error:
            "Аккаунт не найден. Войди почтой (новые аккаунты) или старым логином. Если база сбрасывалась — «Восстановить».",
          code: "ACCOUNT_MISSING",
        });
        return;
      }
      const okPass = await bcrypt.compare(password, found.passwordHash);
      if (!okPass) {
        noteLoginFail(throttle.key);
        res.status(401).json({ error: "Неверный пароль" });
        return;
      }
      noteLoginOk(throttle.key);

      if (found.email && !userEmailVerified(found)) {
        res.status(403).json({
          error: "Подтверди почту кодом из письма",
          code: "EMAIL_NOT_VERIFIED",
          email: maskEmail(found.email),
          login: found.login,
        });
        return;
      }

      const result = await withDb((db) => {
        const user = findUserByLoginOrEmail(db, identity);
        if (!user) return null;
        // Не ротируем token — чат/вкладки не вылетают
        if (!user.token) user.token = uuid();
        touchSeen(user);
        persistLiveDb();
        return { token: user.token, user: publicUser(user) };
      });
      if (!result) {
        res.status(401).json({ error: "Неверный пароль" });
        return;
      }
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Ошибка входа" });
    }
  },
);

app.post(
  "/api/verify-email",
  rateLimitMiddleware({ name: "verify-email", maxN: 20, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const identity = String(req.body?.email || req.body?.login || "").trim();
      const code = String(req.body?.code || "")
        .replace(/\D/g, "")
        .slice(0, 8);
      if (!identity || code.length < 4) {
        res.status(400).json({ error: "Нужны почта и код из письма" });
        return;
      }
      const result = await withDb((db) => {
        const user = findUserByLoginOrEmail(db, identity);
        if (!user) return { missing: true };
        if (userEmailVerified(user)) {
          if (!user.token) user.token = uuid();
          persistLiveDb();
          return { token: user.token, user: publicUser(user) };
        }
        if (
          !user.emailVerifyCode ||
          String(user.emailVerifyCode) !== code ||
          Number(user.emailVerifyExpires || 0) < Date.now()
        ) {
          return { badCode: true };
        }
        user.emailVerified = true;
        user.emailVerifyCode = null;
        user.emailVerifyExpires = 0;
        if (!user.token) user.token = uuid();
        touchSeen(user);
        persistLiveDb();
        return { token: user.token, user: publicUser(user) };
      });
      if (result.missing) {
        res.status(404).json({ error: "Аккаунт не найден" });
        return;
      }
      if (result.badCode) {
        res.status(400).json({
          error: "Неверный или просроченный код",
          code: "BAD_CODE",
        });
        return;
      }
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Ошибка подтверждения" });
    }
  },
);

app.post(
  "/api/resend-email-code",
  rateLimitMiddleware({ name: "resend-email", maxN: 6, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const identity = String(req.body?.email || req.body?.login || "").trim();
      if (!identity) {
        res.status(400).json({ error: "Укажи почту" });
        return;
      }
      if (!mailConfigured()) {
        res.status(503).json({
          error: "Почта на сервере не настроена",
          code: "MAIL_NOT_CONFIGURED",
        });
        return;
      }
      const found = findUserByLoginOrEmail(getLiveDb(), identity);
      if (!found || !found.email) {
        res.status(404).json({ error: "Аккаунт или почта не найдены" });
        return;
      }
      if (userEmailVerified(found)) {
        res.json({ ok: true, alreadyVerified: true });
        return;
      }
      const code = makeVerifyCode();
      const uid = found.id;
      await withDb((db) => {
        const user = db.users.find((u) => u.id === uid);
        if (!user) return;
        user.emailVerifyCode = code;
        user.emailVerifyExpires = Date.now() + VERIFY_TTL_MS;
        persistLiveDb();
      });
      const sent = await sendVerifyEmail(found.email, code);
      if (!sent.ok) {
        res.status(502).json({ error: sent.error || "Не удалось отправить" });
        return;
      }
      res.json({
        ok: true,
        email: maskEmail(found.email),
        ...(sent.devCode ? { devCode: sent.devCode } : {}),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Ошибка отправки кода" });
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
          if (name.length >= 2) {
            const nameKey = name.toLowerCase();
            const taken = db.users.some(
              (u) =>
                u.id !== userId &&
                sanitizeDisplayName(u.displayName).toLowerCase() === nameKey,
            );
            if (taken) {
              return { nameTaken: true };
            }
            user.displayName = name;
          }
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
      if (result.nameTaken) {
        res.status(409).json({
          error: "Такое имя оракула уже занято — выбери другое",
          code: "NAME_TAKEN",
        });
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
