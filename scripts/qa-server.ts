/**
 * API: безопасность входа + нагрузка ~1000 игроков разом.
 * Поднимает свой сервер на свободном порту с изолированной ORACUL_DATA_DIR.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_DIR = path.join(ROOT, "server");

type Fail = { area: string; detail: string };

const fails: Fail[] = [];
const ok: string[] = [];

function fail(area: string, detail: string) {
  fails.push({ area, detail });
}

function note(msg: string) {
  process.stderr.write(`… ${msg}\n`);
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = http.createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      if (!addr || typeof addr === "string") {
        s.close();
        reject(new Error("no port"));
        return;
      }
      const port = addr.port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

type JsonRes = { status: number; json: any; raw: string };

async function req(
  base: string,
  method: string,
  urlPath: string,
  body?: unknown,
  token?: string,
): Promise<JsonRes> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  let json: any = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, raw };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  }
  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

async function waitHealth(base: string, ms = 20_000): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await req(base, "GET", "/api/health");
      if (r.status === 200 && r.json?.ok) return true;
    } catch {
      /* retry */
    }
    await sleep(200);
  }
  return false;
}

function startServer(port: number, dataDir: string): ChildProcess {
  const child = spawn(process.execPath, ["index.js"], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      ORACUL_DATA_DIR: dataDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout?.on("data", (b) => {
    process.stderr.write(`[api] ${String(b)}`);
  });
  child.stderr?.on("data", (b) => {
    process.stderr.write(`[api] ${String(b)}`);
  });
  return child;
}

async function securitySuite(base: string) {
  note("безопасность API");
  let n = 0;

  const short = await req(base, "POST", "/api/register", {
    login: "ab",
    password: "12",
  });
  if (short.status !== 400) {
    fail("безопасность", `короткий логин/пароль → ${short.status}`);
  } else n += 1;

  const login = `qa_sec_${Date.now()}`;
  const reg = await req(base, "POST", "/api/register", {
    login,
    password: "secret99",
  });
  if (reg.status !== 200 || !reg.json?.token) {
    fail("безопасность", `регистрация: ${reg.status} ${reg.raw}`);
    return;
  }
  n += 1;
  const token = reg.json.token as string;

  const dup = await req(base, "POST", "/api/register", {
    login,
    password: "secret99",
  });
  if (dup.status !== 409) {
    fail("безопасность", `дубликат логина → ${dup.status}`);
  } else n += 1;

  const badPass = await req(base, "POST", "/api/login", {
    login,
    password: "wrong",
  });
  if (badPass.status !== 401) {
    fail("безопасность", `неверный пароль → ${badPass.status}`);
  } else n += 1;

  const noAuth = await req(base, "GET", "/api/me");
  if (noAuth.status !== 401) {
    fail("безопасность", `/me без токена → ${noAuth.status}`);
  } else n += 1;

  const badTok = await req(base, "GET", "/api/me", undefined, "not-a-token");
  if (badTok.status !== 401) {
    fail("безопасность", `/me с мусорным токеном → ${badTok.status}`);
  } else n += 1;

  const me = await req(base, "GET", "/api/me", undefined, token);
  if (me.status !== 200 || me.json?.user?.login !== login) {
    fail("безопасность", `/me с токеном сломан`);
  } else n += 1;

  const put = await req(
    base,
    "PUT",
    "/api/me",
    { displayName: "QA", heroId: "hero_death", owned: { gold: 1 } },
    token,
  );
  if (put.status !== 200 || put.json?.user?.displayName !== "QA") {
    fail("безопасность", `PUT /me: ${put.status}`);
  } else n += 1;

  const room = await req(
    base,
    "POST",
    "/api/rooms",
    { code: "QA1", level: 5 },
    token,
  );
  if (room.status !== 200 || !room.json?.roomId) {
    fail("безопасность", `комната: ${room.status}`);
  } else n += 1;

  const roomNoAuth = await req(base, "POST", "/api/rooms", { code: "X" });
  if (roomNoAuth.status !== 401) {
    fail("безопасность", `комната без токена → ${roomNoAuth.status}`);
  } else n += 1;

  // Токен не должен светиться в publicUser
  if (me.json?.user?.token || me.json?.user?.passwordHash) {
    fail("безопасность", "publicUser утекает token/passwordHash");
  } else n += 1;

  if (!fails.some((f) => f.area === "безопасность")) {
    ok.push(`безопасность: ${n} проверок (auth, дубли, /me, комнаты)`);
  } else {
    ok.push(`безопасность: ${n} ок, есть FAIL`);
  }
}

async function loadSuite(base: string, players: number) {
  note(`нагрузка ${players} игроков`);
  const stamp = Date.now().toString(36);
  const logins = Array.from(
    { length: players },
    (_, i) => `qa_load_${stamp}_${i}`,
  );
  const password = "loadtest1";

  const tReg0 = Date.now();
  const regs = await mapPool(logins, 80, async (login) => {
    const r = await req(base, "POST", "/api/register", { login, password });
    return r;
  });
  const regOk = regs.filter((r) => r.status === 200 && r.json?.token);
  const regMs = Date.now() - tReg0;
  if (regOk.length < players) {
    fail(
      "нагрузка",
      `регистрация: ${regOk.length}/${players} за ${regMs}мс`,
    );
  } else {
    ok.push(`нагрузка: регистрация ${players} за ${regMs}мс`);
  }

  const tokens = regOk.map((r) => r.json.token as string);

  const tLogin0 = Date.now();
  const loginsRes = await mapPool(logins, 80, async (login) => {
    return req(base, "POST", "/api/login", { login, password });
  });
  const loginOk = loginsRes.filter((r) => r.status === 200 && r.json?.token);
  const loginMs = Date.now() - tLogin0;
  if (loginOk.length < players) {
    fail("нагрузка", `логин: ${loginOk.length}/${players} за ${loginMs}мс`);
  } else {
    ok.push(`нагрузка: вход ${players} за ${loginMs}мс`);
  }

  const freshTokens = loginOk.map((r) => r.json.token as string);
  const useTokens = freshTokens.length === players ? freshTokens : tokens;

  const tMe0 = Date.now();
  const mes = await mapPool(useTokens, 100, async (token) => {
    return req(base, "GET", "/api/me", undefined, token);
  });
  const meOk = mes.filter((r) => r.status === 200 && r.json?.user?.login);
  const meMs = Date.now() - tMe0;
  if (meOk.length < players) {
    fail("нагрузка", `/me: ${meOk.length}/${players} за ${meMs}мс`);
  } else {
    ok.push(`нагрузка: /me ${players} за ${meMs}мс`);
  }

  const tRoom0 = Date.now();
  const rooms = await mapPool(useTokens, 100, async (token, i) => {
    return req(
      base,
      "POST",
      "/api/rooms",
      { code: `R${i % 997}`, level: 1 + (i % 40) },
      token,
    );
  });
  const roomOk = rooms.filter((r) => r.status === 200 && r.json?.roomId);
  const roomMs = Date.now() - tRoom0;
  if (roomOk.length < players) {
    fail(
      "нагрузка",
      `комнаты: ${roomOk.length}/${players} за ${roomMs}мс`,
    );
  } else {
    ok.push(`нагрузка: комнаты ${players} за ${roomMs}мс`);
  }

  // Параллельный PUT owned (как синк сейва) — не должен ронять сервер
  const tPut0 = Date.now();
  const puts = await mapPool(useTokens, 60, async (token, i) => {
    return req(
      base,
      "PUT",
      "/api/me",
      {
        displayName: `P${i}`,
        heroId: "hero_life",
        owned: {
          unlocked: [],
          decks: { starter: [] },
          activeDeckId: "starter",
          gold: i,
          diamonds: 0,
          level: 1,
          xp: 0,
          heroId: "hero_life",
          homeFaction: "life",
        },
      },
      token,
    );
  });
  const putOk = puts.filter((r) => r.status === 200);
  const putMs = Date.now() - tPut0;
  if (putOk.length < players) {
    fail("нагрузка", `PUT /me: ${putOk.length}/${players} за ${putMs}мс`);
  } else {
    ok.push(`нагрузка: синк сейва ${players} за ${putMs}мс`);
  }

  const health = await req(base, "GET", "/api/health");
  if (health.status !== 200 || !health.json?.ok) {
    fail("нагрузка", "health после шторма мёртв");
  } else {
    ok.push("нагрузка: health жив после 1000");
  }
}

async function main() {
  const playersArg = process.argv.find((a) => a.startsWith("--players="));
  const players = playersArg
    ? Math.max(10, Math.min(2000, Number(playersArg.split("=")[1]) || 1000))
    : 1000;

  if (!fs.existsSync(path.join(SERVER_DIR, "node_modules"))) {
    console.error("Сначала: npm install --prefix server");
    process.exit(1);
  }

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "orakul-qa-"));
  const port = await findFreePort();
  const base = `http://127.0.0.1:${port}`;
  note(`API порт ${port}, data ${dataDir}`);

  const child = startServer(port, dataDir);
  let killed = false;
  const kill = () => {
    if (killed) return;
    killed = true;
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  process.on("exit", kill);
  process.on("SIGINT", () => {
    kill();
    process.exit(130);
  });

  try {
    const up = await waitHealth(base);
    if (!up) {
      fail("сервер", "не поднялся /api/health");
    } else {
      ok.push("сервер: health OK");
      await securitySuite(base);
      await loadSuite(base, players);
    }
  } finally {
    kill();
  }

  const lines: string[] = [];
  lines.push("=== QA SERVER / 1000 PLAYERS ===");
  for (const line of ok) lines.push(`  OK  ${line}`);
  if (fails.length) {
    lines.push("");
    lines.push(`  СЛОМАНО (${fails.length}):`);
    for (const f of fails) lines.push(`  FAIL [${f.area}] ${f.detail}`);
  } else {
    lines.push("");
    lines.push("  Всё зелёное. API держит нагрузку.");
  }
  console.log(lines.join("\n"));
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
