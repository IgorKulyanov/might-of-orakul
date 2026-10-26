/** Побеги из PvP: предупреждения, потом бан; счётчик на календарный день. */

const KEY = "orakul-pvp-flee-v1";

export type PvpFleeState = {
  day: string;
  /** Сколько раз сбежал сегодня (после боя). */
  fleeCount: number;
  /** unix ms, до какого момента нельзя в PvP. */
  bannedUntil: number;
};

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fresh(): PvpFleeState {
  return { day: todayKey(), fleeCount: 0, bannedUntil: 0 };
}

export function loadPvpFlee(): PvpFleeState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as Partial<PvpFleeState>;
    if (!parsed || parsed.day !== todayKey()) return fresh();
    return {
      day: todayKey(),
      fleeCount: Math.max(0, Math.floor(Number(parsed.fleeCount) || 0)),
      bannedUntil: Math.max(0, Math.floor(Number(parsed.bannedUntil) || 0)),
    };
  } catch {
    return fresh();
  }
}

function save(s: PvpFleeState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function pvpBanRemainingMs(): number {
  const s = loadPvpFlee();
  return Math.max(0, s.bannedUntil - Date.now());
}

export function formatBanLeft(ms: number): string {
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `${sec} сек.`;
  const min = Math.ceil(sec / 60);
  return `${min} мин.`;
}

/** Можно ли зайти в комнату / создать PvP. */
export function canEnterPvp(): { ok: true } | { ok: false; message: string } {
  const left = pvpBanRemainingMs();
  if (left <= 0) return { ok: true };
  return {
    ok: false,
    message: `Бан за побеги из дуэлей: ещё ${formatBanLeft(left)}. Завтра счётчик обнулится.`,
  };
}

/**
 * 1–2 побег: только предупреждение.
 * 3-й: 5 мин, 4-й: 10 мин, далее: 30 мин.
 */
export function recordPvpFlee(): {
  count: number;
  banMs: number;
  message: string;
} {
  const s = loadPvpFlee();
  const count = s.fleeCount + 1;
  let banMs = 0;
  if (count === 3) banMs = 5 * 60_000;
  else if (count === 4) banMs = 10 * 60_000;
  else if (count >= 5) banMs = 30 * 60_000;

  const bannedUntil = banMs > 0 ? Date.now() + banMs : s.bannedUntil;
  save({ day: todayKey(), fleeCount: count, bannedUntil });

  let message =
    "Ты сбежал из PvP. Наград нет. Сопернику — победа. Так делать некрасиво.";
  if (count === 1) {
    message += " Предупреждение 1/2.";
  } else if (count === 2) {
    message += " Предупреждение 2/2 — следующий побег = бан 5 минут.";
  } else if (count === 3) {
    message += ` Бан на 5 минут. Счётчик дня: ${count}.`;
  } else if (count === 4) {
    message += ` Бан на 10 минут. Счётчик дня: ${count}.`;
  } else {
    message += ` Бан на 30 минут. Счётчик дня: ${count}. Завтра обнулится.`;
  }
  return { count, banMs, message };
}
