/** Игральные столы (фон боя). Файлы: public/tables/*.jpg */

export const BATTLE_TABLES = [
  "/tables/life.jpg",
  "/tables/nature.jpg",
  "/tables/water.jpg",
  "/tables/hell.jpg",
  "/tables/death.jpg",
  "/tables/tavern.jpg",
  "/tables/camp.jpg",
  "/tables/temple.jpg",
  "/tables/rock.jpg",
] as const;

const SCHOOL_TABLE: Record<string, string> = {
  life: "/tables/life.jpg",
  nature: "/tables/nature.jpg",
  water: "/tables/water.jpg",
  hell: "/tables/hell.jpg",
  death: "/tables/death.jpg",
};

/** Версия артов — бамп при замене файлов. */
export const BATTLE_TABLE_VER = 1;

export function battleTableUrl(path: string): string {
  return `${path}?v=${BATTLE_TABLE_VER}`;
}

/**
 * Стол на бой: чаще свой школы, иначе случайный из пула.
 * seed — стабильный выбор на весь бой (не прыгает при ререндере).
 */
export function pickBattleTable(opts?: {
  school?: string | null;
  seed?: number;
}): string {
  const school = opts?.school ?? null;
  const seed =
    opts?.seed ??
    (typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? crypto.getRandomValues(new Uint32Array(1))[0]!
      : Math.floor(Math.random() * 1e9));

  // ~45% — стол своей школы, если есть
  const schoolPath = school ? SCHOOL_TABLE[school] : undefined;
  if (schoolPath && seed % 100 < 45) {
    return battleTableUrl(schoolPath);
  }

  const i = seed % BATTLE_TABLES.length;
  return battleTableUrl(BATTLE_TABLES[i]!);
}
