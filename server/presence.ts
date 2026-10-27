/** Кто сейчас в клиенте (пульс с телефона/ПК). Только в памяти — не пишет диск. */

export type PresenceScreen =
  | "menu"
  | "cabinet"
  | "shop"
  | "multi"
  | "battle"
  | "battle_pvp"
  | "other";

export type PresenceRow = {
  userId: string;
  login: string;
  name: string;
  screen: PresenceScreen;
  lastSeen: number;
};

const ONLINE_TTL_MS = 90_000;
const rows = new Map<string, PresenceRow>();

const SCREENS = new Set<string>([
  "menu",
  "cabinet",
  "shop",
  "multi",
  "battle",
  "battle_pvp",
  "other",
]);

export function normalizePresenceScreen(raw: unknown): PresenceScreen {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s.startsWith("battle_pvp") || s === "pvp") return "battle_pvp";
  if (s.startsWith("battle")) return "battle";
  if (s === "multi" || s === "multiplayer") return "multi";
  if (s === "cabinet" || s === "deck") return "cabinet";
  if (s === "shop" || s === "store") return "shop";
  if (s === "menu" || s === "hub" || s === "splash") return "menu";
  if (SCREENS.has(s)) return s as PresenceScreen;
  return "other";
}

export function touchPresence(input: {
  userId: string;
  login: string;
  displayName?: string | null;
  screen?: unknown;
}): PresenceRow {
  const name =
    String(input.displayName || "").trim() ||
    String(input.login || "").trim() ||
    "Игрок";
  const row: PresenceRow = {
    userId: input.userId,
    login: String(input.login || "").toLowerCase(),
    name: name.slice(0, 32),
    screen: normalizePresenceScreen(input.screen),
    lastSeen: Date.now(),
  };
  rows.set(row.userId, row);
  return row;
}

function prune(now = Date.now()) {
  for (const [id, row] of rows) {
    if (now - row.lastSeen > ONLINE_TTL_MS) rows.delete(id);
  }
}

export function getOnlinePresence(now = Date.now()): PresenceRow[] {
  prune(now);
  return [...rows.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

export function getPresenceStats(now = Date.now()): {
  online: number;
  inMenu: number;
  inBattle: number;
  inPvpClient: number;
  inCabinet: number;
  inMulti: number;
  inOther: number;
  who: Array<{ login: string; name: string; screen: PresenceScreen }>;
} {
  const list = getOnlinePresence(now);
  let inMenu = 0;
  let inBattle = 0;
  let inPvpClient = 0;
  let inCabinet = 0;
  let inMulti = 0;
  let inOther = 0;
  for (const r of list) {
    if (r.screen === "menu") inMenu += 1;
    else if (r.screen === "battle") inBattle += 1;
    else if (r.screen === "battle_pvp") inPvpClient += 1;
    else if (r.screen === "cabinet") inCabinet += 1;
    else if (r.screen === "multi") inMulti += 1;
    else inOther += 1;
  }
  return {
    online: list.length,
    inMenu,
    inBattle,
    inPvpClient,
    inCabinet,
    inMulti,
    inOther,
    who: list.slice(0, 40).map((r) => ({
      login: r.login,
      name: r.name,
      screen: r.screen,
    })),
  };
}

export const PRESENCE_TTL_MS = ONLINE_TTL_MS;
