/**
 * Кольцевой журнал действий клиента.
 * Не меняет игровую логику — только запись.
 *
 * В консоли: __orakulDumpLog()  или  __orakulLog
 */

export type LogSector =
  | "nav"
  | "auth"
  | "shop"
  | "cabinet"
  | "hero"
  | "battle"
  | "engine"
  | "pvp"
  | "ui"
  | "error"
  | "meta";

export type LogEntry = {
  t: number;
  iso: string;
  sector: LogSector;
  event: string;
  data?: unknown;
};

const MAX = 400;
const STORAGE_KEY = "orakul_action_log";
const buf: LogEntry[] = [];
let seq = 0;

function loadOnce(): void {
  if (buf.length || typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as LogEntry[];
    if (Array.isArray(parsed)) {
      buf.push(...parsed.slice(-MAX));
    }
  } catch {
    /* ignore */
  }
}

function persist(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buf.slice(-MAX)));
  } catch {
    /* quota */
  }
}

/** Записать событие (безопасно вызывать где угодно). */
export function alog(
  sector: LogSector,
  event: string,
  data?: unknown,
): void {
  loadOnce();
  const now = Date.now();
  const entry: LogEntry = {
    t: now,
    iso: new Date(now).toISOString(),
    sector,
    event,
    data: data === undefined ? undefined : safeClone(data),
  };
  buf.push(entry);
  seq += 1;
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
  if (seq % 8 === 0) persist();
  if (typeof console !== "undefined" && console.debug) {
    console.debug(`[orakul:${sector}]`, event, data ?? "");
  }
}

function safeClone(data: unknown): unknown {
  try {
    if (data == null) return data;
    if (typeof data !== "object") return data;
    return JSON.parse(JSON.stringify(data));
  } catch {
    return String(data);
  }
}

export function getActionLog(limit = 80): LogEntry[] {
  loadOnce();
  return buf.slice(-Math.max(1, limit));
}

export function dumpActionLog(limit = 120): string {
  const lines = getActionLog(limit).map((e) => {
    const payload =
      e.data === undefined ? "" : ` ${JSON.stringify(e.data)}`;
    return `${e.iso} [${e.sector}] ${e.event}${payload}`;
  });
  const text = lines.join("\n");
  if (typeof console !== "undefined") {
    console.log(text || "(лог пуст)");
  }
  persist();
  return text;
}

export function clearActionLog(): void {
  buf.length = 0;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Повесить хелперы на window (один раз). */
export function installActionLogGlobals(): void {
  if (typeof window === "undefined") return;
  loadOnce();
  const w = window as Window & {
    __orakulLog?: LogEntry[];
    __orakulDumpLog?: (n?: number) => string;
    __orakulClearLog?: () => void;
  };
  Object.defineProperty(w, "__orakulLog", {
    get: () => getActionLog(MAX),
    configurable: true,
  });
  w.__orakulDumpLog = dumpActionLog;
  w.__orakulClearLog = clearActionLog;
  alog("meta", "actionLog.ready");
}

/** Глобальные ошибки → в тот же журнал. */
export function installGlobalErrorHooks(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (ev) => {
    alog("error", "window.error", {
      message: ev.message,
      file: ev.filename,
      line: ev.lineno,
    });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    alog("error", "unhandledrejection", {
      reason: String(ev.reason),
    });
  });
}
