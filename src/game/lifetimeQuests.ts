import { getCard } from "./cards";
import type { OwnedState, School } from "./types";

const KEY = "orakul-lifetime-quests-v1";

export type LifetimeQuestId =
  | "lv_5"
  | "lv_10"
  | "lv_15"
  | "lv_20"
  | "lv_25"
  | "lv_30"
  | "school_3"
  | "school_5"
  | "school_8"
  | "school_12"
  | "cards_10"
  | "cards_20"
  | "cards_30"
  | "trail_3"
  | "trail_5"
  | "trail_10"
  | "trail_15"
  | "shop_1"
  | "shop_5"
  | "shop_15"
  | "shop_30"
  | "spell_10"
  | "spell_25"
  | "spell_50"
  | "spell_100"
  | "win_5"
  | "win_15"
  | "win_30"
  | "win_50"
  | "pvp_1"
  | "pvp_5"
  | "pvp_15";

export type LifetimeQuest = {
  id: LifetimeQuestId;
  title: string;
  hint: string;
  target: number;
  xp: number;
  gold: number;
  diamonds: number;
};

export const LIFETIME_QUESTS: LifetimeQuest[] = [
  {
    id: "lv_5",
    title: "Ученик оракула",
    hint: "Достигни 5 уровня",
    target: 5,
    xp: 200,
    gold: 80,
    diamonds: 1,
  },
  {
    id: "lv_10",
    title: "Адепт круга",
    hint: "Достигни 10 уровня",
    target: 10,
    xp: 400,
    gold: 150,
    diamonds: 2,
  },
  {
    id: "lv_15",
    title: "Мастер воли",
    hint: "Достигни 15 уровня",
    target: 15,
    xp: 600,
    gold: 220,
    diamonds: 3,
  },
  {
    id: "lv_20",
    title: "Старший оракул",
    hint: "Достигни 20 уровня",
    target: 20,
    xp: 900,
    gold: 320,
    diamonds: 4,
  },
  {
    id: "lv_25",
    title: "Владыка печати",
    hint: "Достигни 25 уровня",
    target: 25,
    xp: 1200,
    gold: 420,
    diamonds: 5,
  },
  {
    id: "lv_30",
    title: "Предел пути",
    hint: "Достигни 30 уровня",
    target: 30,
    xp: 1800,
    gold: 600,
    diamonds: 8,
  },
  {
    id: "school_3",
    title: "Три карты своей школы",
    hint: "Открой в оракуле 3 карты своей школы",
    target: 3,
    xp: 180,
    gold: 70,
    diamonds: 1,
  },
  {
    id: "school_5",
    title: "Пять карт своей школы",
    hint: "Открой в оракуле 5 карт своей школы",
    target: 5,
    xp: 320,
    gold: 120,
    diamonds: 2,
  },
  {
    id: "school_8",
    title: "Восемь карт своей школы",
    hint: "Открой в оракуле 8 карт своей школы",
    target: 8,
    xp: 500,
    gold: 180,
    diamonds: 3,
  },
  {
    id: "school_12",
    title: "Дюжина своей школы",
    hint: "Открой в оракуле 12 карт своей школы",
    target: 12,
    xp: 800,
    gold: 280,
    diamonds: 4,
  },
  {
    id: "cards_10",
    title: "Коллекционер I",
    hint: "Открой 10 любых карт в оракуле",
    target: 10,
    xp: 250,
    gold: 100,
    diamonds: 1,
  },
  {
    id: "cards_20",
    title: "Коллекционер II",
    hint: "Открой 20 любых карт в оракуле",
    target: 20,
    xp: 450,
    gold: 180,
    diamonds: 2,
  },
  {
    id: "cards_30",
    title: "Коллекционер III",
    hint: "Открой 30 любых карт в оракуле",
    target: 30,
    xp: 700,
    gold: 280,
    diamonds: 4,
  },
  {
    id: "trail_3",
    title: "Первые шаги Тропы",
    hint: "Дойди до 3-го узла Тропы за один день",
    target: 3,
    xp: 200,
    gold: 80,
    diamonds: 1,
  },
  {
    id: "trail_5",
    title: "Первая гряда",
    hint: "Дойди до 5-го узла Тропы за один день",
    target: 5,
    xp: 350,
    gold: 130,
    diamonds: 2,
  },
  {
    id: "trail_10",
    title: "Сердце тропы",
    hint: "Дойди до 10-го узла Тропы за один день",
    target: 10,
    xp: 700,
    gold: 250,
    diamonds: 4,
  },
  {
    id: "trail_15",
    title: "Венец оракула",
    hint: "Пройди всю Тропу (15 узлов) за один день",
    target: 15,
    xp: 1200,
    gold: 400,
    diamonds: 8,
  },
  {
    id: "shop_1",
    title: "Первая покупка",
    hint: "Купи осколок в магазине",
    target: 1,
    xp: 100,
    gold: 40,
    diamonds: 0,
  },
  {
    id: "shop_5",
    title: "Завсегдатай лавки",
    hint: "Купи осколки 5 раз",
    target: 5,
    xp: 280,
    gold: 100,
    diamonds: 1,
  },
  {
    id: "shop_15",
    title: "Меценат круга",
    hint: "Купи осколки 15 раз",
    target: 15,
    xp: 550,
    gold: 200,
    diamonds: 3,
  },
  {
    id: "shop_30",
    title: "Золотой клиент",
    hint: "Купи осколки 30 раз",
    target: 30,
    xp: 900,
    gold: 350,
    diamonds: 5,
  },
  {
    id: "spell_10",
    title: "Первые руны",
    hint: "Сыграй 10 заклинаний",
    target: 10,
    xp: 180,
    gold: 70,
    diamonds: 1,
  },
  {
    id: "spell_25",
    title: "Плетение чар",
    hint: "Сыграй 25 заклинаний",
    target: 25,
    xp: 350,
    gold: 130,
    diamonds: 2,
  },
  {
    id: "spell_50",
    title: "Архимаг поля",
    hint: "Сыграй 50 заклинаний",
    target: 50,
    xp: 600,
    gold: 220,
    diamonds: 3,
  },
  {
    id: "spell_100",
    title: "Сто печатей",
    hint: "Сыграй 100 заклинаний",
    target: 100,
    xp: 1100,
    gold: 400,
    diamonds: 6,
  },
  {
    id: "win_5",
    title: "Пять триумфов",
    hint: "Победи в 5 боях",
    target: 5,
    xp: 220,
    gold: 90,
    diamonds: 1,
  },
  {
    id: "win_15",
    title: "Пятнадцать триумфов",
    hint: "Победи в 15 боях",
    target: 15,
    xp: 450,
    gold: 170,
    diamonds: 2,
  },
  {
    id: "win_30",
    title: "Тридцать триумфов",
    hint: "Победи в 30 боях",
    target: 30,
    xp: 750,
    gold: 280,
    diamonds: 4,
  },
  {
    id: "win_50",
    title: "Пятьдесят триумфов",
    hint: "Победи в 50 боях",
    target: 50,
    xp: 1200,
    gold: 450,
    diamonds: 6,
  },
  {
    id: "pvp_1",
    title: "Первая дуэль",
    hint: "Победи в живой дуэли",
    target: 1,
    xp: 250,
    gold: 100,
    diamonds: 2,
  },
  {
    id: "pvp_5",
    title: "Пять дуэлей",
    hint: "Победи в 5 живых дуэлях",
    target: 5,
    xp: 500,
    gold: 200,
    diamonds: 3,
  },
  {
    id: "pvp_15",
    title: "Пятнадцать дуэлей",
    hint: "Победи в 15 живых дуэлях",
    target: 15,
    xp: 1000,
    gold: 350,
    diamonds: 6,
  },
];

export type LifetimeState = {
  progress: Partial<Record<LifetimeQuestId, number>>;
  claimed: LifetimeQuestId[];
};

function emptyState(): LifetimeState {
  return { progress: {}, claimed: [] };
}

export function loadLifetimeQuests(): LifetimeState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LifetimeState;
      return {
        progress: parsed.progress ?? {},
        claimed: Array.isArray(parsed.claimed) ? parsed.claimed : [],
      };
    }
  } catch {
    /* ignore */
  }
  return emptyState();
}

export function saveLifetimeQuests(state: LifetimeState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function lifetimeQuestById(
  id: LifetimeQuestId,
): LifetimeQuest | undefined {
  return LIFETIME_QUESTS.find((q) => q.id === id);
}

function bump(
  st: LifetimeState,
  id: LifetimeQuestId,
  amount: number,
  target: number,
): void {
  const cur = st.progress[id] ?? 0;
  st.progress[id] = Math.min(target, cur + amount);
}

function setAtLeast(
  st: LifetimeState,
  id: LifetimeQuestId,
  value: number,
  target: number,
): void {
  const cur = st.progress[id] ?? 0;
  st.progress[id] = Math.min(target, Math.max(cur, value));
}

function homeSchoolOf(owned: OwnedState): School | null {
  const hf = owned.homeFaction;
  if (
    hf === "life" ||
    hf === "death" ||
    hf === "nature" ||
    hf === "water" ||
    hf === "hell"
  ) {
    return hf;
  }
  return null;
}

export function countOracleCards(owned: OwnedState): number {
  return (owned.unlocked ?? []).filter((id) => {
    try {
      return !!getCard(id);
    } catch {
      return false;
    }
  }).length;
}

export function countHomeSchoolCards(owned: OwnedState): number {
  const school = homeSchoolOf(owned);
  if (!school) return 0;
  let n = 0;
  for (const id of owned.unlocked ?? []) {
    try {
      if (getCard(id).school === school) n += 1;
    } catch {
      /* skip */
    }
  }
  return n;
}

/** Подтянуть прогресс из сейва (уровень, коллекция). */
export function syncLifetimeFromOwned(owned: OwnedState): LifetimeState {
  const st = loadLifetimeQuests();
  const level = Math.max(0, Math.floor(owned.level ?? 1));
  const schoolN = countHomeSchoolCards(owned);
  const cardsN = countOracleCards(owned);

  for (const q of LIFETIME_QUESTS) {
    if (q.id.startsWith("lv_")) setAtLeast(st, q.id, level, q.target);
    else if (q.id.startsWith("school_"))
      setAtLeast(st, q.id, schoolN, q.target);
    else if (q.id.startsWith("cards_"))
      setAtLeast(st, q.id, cardsN, q.target);
  }
  saveLifetimeQuests(st);
  return st;
}

export function trackLifetimeBattle(
  won: boolean,
  mode: "bot" | "campaign" | "arena" | "pvp" | "dev",
): LifetimeState {
  const st = loadLifetimeQuests();
  if (won && mode !== "dev") {
    for (const id of ["win_5", "win_15", "win_30", "win_50"] as const) {
      const q = lifetimeQuestById(id)!;
      bump(st, id, 1, q.target);
    }
    if (mode === "pvp") {
      for (const id of ["pvp_1", "pvp_5", "pvp_15"] as const) {
        const q = lifetimeQuestById(id)!;
        bump(st, id, 1, q.target);
      }
    }
  }
  saveLifetimeQuests(st);
  return st;
}

export function trackLifetimeShopBuy(amount = 1): LifetimeState {
  const st = loadLifetimeQuests();
  const n = Math.max(1, Math.floor(amount));
  for (const id of ["shop_1", "shop_5", "shop_15", "shop_30"] as const) {
    const q = lifetimeQuestById(id)!;
    bump(st, id, n, q.target);
  }
  saveLifetimeQuests(st);
  return st;
}

export function trackLifetimeSpellCasts(amount: number): LifetimeState {
  const st = loadLifetimeQuests();
  const n = Math.max(0, Math.floor(amount));
  if (n <= 0) return st;
  for (const id of ["spell_10", "spell_25", "spell_50", "spell_100"] as const) {
    const q = lifetimeQuestById(id)!;
    bump(st, id, n, q.target);
  }
  saveLifetimeQuests(st);
  return st;
}

export function trackLifetimeTrailCleared(cleared: number): LifetimeState {
  const st = loadLifetimeQuests();
  const v = Math.max(0, Math.floor(cleared));
  for (const id of ["trail_3", "trail_5", "trail_10", "trail_15"] as const) {
    const q = lifetimeQuestById(id)!;
    setAtLeast(st, id, v, q.target);
  }
  saveLifetimeQuests(st);
  return st;
}

export type LifetimeClaimResult = {
  ok: boolean;
  state: LifetimeState;
  xp: number;
  gold: number;
  diamonds: number;
  reason?: string;
};

export function claimLifetimeQuest(
  owned: OwnedState,
  questId: LifetimeQuestId,
): { owned: OwnedState; claim: LifetimeClaimResult } {
  const state = loadLifetimeQuests();
  const quest = lifetimeQuestById(questId);
  if (!quest) {
    return {
      owned,
      claim: {
        ok: false,
        state,
        xp: 0,
        gold: 0,
        diamonds: 0,
        reason: "Нет задания",
      },
    };
  }
  if (state.claimed.includes(questId)) {
    return {
      owned,
      claim: {
        ok: false,
        state,
        xp: 0,
        gold: 0,
        diamonds: 0,
        reason: "Уже получено",
      },
    };
  }
  if ((state.progress[questId] ?? 0) < quest.target) {
    return {
      owned,
      claim: {
        ok: false,
        state,
        xp: 0,
        gold: 0,
        diamonds: 0,
        reason: "Ещё не выполнено",
      },
    };
  }
  state.claimed = [...state.claimed, questId];
  saveLifetimeQuests(state);
  return {
    owned: {
      ...owned,
      gold: (owned.gold ?? 0) + quest.gold,
      diamonds: (owned.diamonds ?? 0) + quest.diamonds,
    },
    claim: {
      ok: true,
      state,
      xp: quest.xp,
      gold: quest.gold,
      diamonds: quest.diamonds,
    },
  };
}

/** Активные (не забранные) + недавно выполненные — для панели. */
export function visibleLifetimeQuests(
  state?: LifetimeState,
): LifetimeQuest[] {
  const st = state ?? loadLifetimeQuests();
  const open = LIFETIME_QUESTS.filter((q) => !st.claimed.includes(q.id));
  // Показать ближайшие по прогрессу / порядку, не всю простыню сразу.
  const scored = open
    .map((q) => {
      const prog = st.progress[q.id] ?? 0;
      const ratio = prog / q.target;
      return { q, prog, ratio };
    })
    .sort((a, b) => {
      if (a.ratio !== b.ratio) return b.ratio - a.ratio;
      return a.q.target - b.q.target;
    });
  return scored.slice(0, 8).map((x) => x.q);
}
