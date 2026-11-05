import { hashSeed } from "./arena";
import type { OwnedState } from "./types";

const KEY = "orakul-dailies-v2";
const QUESTS_PER_DAY = 3;

export type DailyQuestId =
  | "win_1"
  | "win_3"
  | "play_2"
  | "play_3"
  | "win_2"
  | "arena_play"
  | "arena_win"
  | "campaign_play"
  | "campaign_win"
  | "pvp_play"
  | "pvp_win"
  | "bot_win"
  | "any_win_2";

export type DailyBattleMode = "bot" | "campaign" | "arena" | "pvp" | "dev";

export type DailyQuest = {
  id: DailyQuestId;
  title: string;
  target: number;
  xp: number;
  gold: number;
  diamonds: number;
  /** Какие бои засчитывают прогресс. */
  modes?: DailyBattleMode[];
  /** Нужна победа. */
  needWin?: boolean;
};

/** Полный пул — на день выбираются 3 разных. */
export const DAILY_QUEST_POOL: DailyQuest[] = [
  {
    id: "win_1",
    title: "Первая кровь дня",
    target: 1,
    xp: 160,
    gold: 55,
    diamonds: 1,
    needWin: true,
  },
  {
    id: "win_2",
    title: "Двойной приговор",
    target: 2,
    xp: 280,
    gold: 90,
    diamonds: 1,
    needWin: true,
  },
  {
    id: "win_3",
    title: "Три печати победы",
    target: 3,
    xp: 400,
    gold: 140,
    diamonds: 2,
    needWin: true,
  },
  {
    id: "play_2",
    title: "Два вызова судьбе",
    target: 2,
    xp: 120,
    gold: 40,
    diamonds: 0,
  },
  {
    id: "play_3",
    title: "Три круга арены судьбы",
    target: 3,
    xp: 180,
    gold: 60,
    diamonds: 0,
  },
  {
    id: "bot_win",
    title: "Сломай тень бота",
    target: 1,
    xp: 170,
    gold: 60,
    diamonds: 1,
    modes: ["bot"],
    needWin: true,
  },
  {
    id: "any_win_2",
    title: "Два одиночных триумфа",
    target: 2,
    xp: 300,
    gold: 100,
    diamonds: 1,
    modes: ["bot", "campaign", "arena"],
    needWin: true,
  },
  {
    id: "arena_play",
    title: "Шагни на песок арены",
    target: 1,
    xp: 150,
    gold: 50,
    diamonds: 0,
    modes: ["arena"],
  },
  {
    id: "arena_win",
    title: "Забери круг арены",
    target: 1,
    xp: 220,
    gold: 80,
    diamonds: 2,
    modes: ["arena"],
    needWin: true,
  },
  {
    id: "campaign_play",
    title: "Пройди узел Тропы",
    target: 1,
    xp: 150,
    gold: 50,
    diamonds: 0,
    modes: ["campaign"],
  },
  {
    id: "campaign_win",
    title: "Победа на Тропе",
    target: 1,
    xp: 220,
    gold: 75,
    diamonds: 1,
    modes: ["campaign"],
    needWin: true,
  },
  {
    id: "pvp_play",
    title: "Вызови чужого оракула",
    target: 1,
    xp: 180,
    gold: 45,
    diamonds: 0,
    modes: ["pvp"],
  },
  {
    id: "pvp_win",
    title: "Сломи чужую волю",
    target: 1,
    xp: 260,
    gold: 90,
    diamonds: 2,
    modes: ["pvp"],
    needWin: true,
  },
];

/** @deprecated используй todayQuests() — оставлено для старых импортов. */
export const DAILY_QUESTS = DAILY_QUEST_POOL;

export type DailyState = {
  day: string;
  /** Три задания сегодня. */
  questIds: DailyQuestId[];
  progress: Partial<Record<DailyQuestId, number>>;
  claimed: DailyQuestId[];
};

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickDailyQuestIds(day = todayKey()): DailyQuestId[] {
  const rnd = mulberry32(hashSeed(`dailies-v2:${day}`));
  const pool = [...DAILY_QUEST_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = t;
  }
  return pool.slice(0, QUESTS_PER_DAY).map((q) => q.id);
}

export function questById(id: DailyQuestId): DailyQuest | undefined {
  return DAILY_QUEST_POOL.find((q) => q.id === id);
}

export function todayQuests(state?: DailyState): DailyQuest[] {
  const st = state ?? loadDailies();
  return st.questIds
    .map((id) => questById(id))
    .filter((q): q is DailyQuest => !!q);
}

function freshDailies(day = todayKey()): DailyState {
  return {
    day,
    questIds: pickDailyQuestIds(day),
    progress: {},
    claimed: [],
  };
}

export function loadDailies(): DailyState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DailyState;
      if (
        parsed?.day === todayKey() &&
        Array.isArray(parsed.questIds) &&
        parsed.questIds.length === QUESTS_PER_DAY
      ) {
        return {
          day: parsed.day,
          questIds: parsed.questIds,
          progress: parsed.progress ?? {},
          claimed: parsed.claimed ?? [],
        };
      }
    }
  } catch {
    /* ignore */
  }
  const fresh = freshDailies();
  saveDailies(fresh);
  return fresh;
}

export function saveDailies(state: DailyState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function bump(
  st: DailyState,
  id: DailyQuestId,
  amount: number,
  target: number,
): void {
  const cur = st.progress[id] ?? 0;
  st.progress[id] = Math.min(target, cur + amount);
}

/** Учёт боя для дейликов. */
export function trackBattleForDailies(
  won: boolean,
  mode: DailyBattleMode = "bot",
): DailyState {
  const st = loadDailies();
  for (const id of st.questIds) {
    const q = questById(id);
    if (!q) continue;
    if (q.modes && !q.modes.includes(mode)) continue;
    if (q.needWin && !won) continue;
    bump(st, id, 1, q.target);
  }
  saveDailies(st);
  return st;
}

export type ClaimResult = {
  ok: boolean;
  dailies: DailyState;
  xp: number;
  gold: number;
  diamonds: number;
  reason?: string;
};

export function claimDaily(
  owned: OwnedState,
  questId: DailyQuestId,
): { owned: OwnedState; claim: ClaimResult } {
  const dailies = loadDailies();
  const quest = questById(questId);
  if (!quest || !dailies.questIds.includes(questId)) {
    return {
      owned,
      claim: {
        ok: false,
        dailies,
        xp: 0,
        gold: 0,
        diamonds: 0,
        reason: "Нет задания",
      },
    };
  }
  if (dailies.claimed.includes(questId)) {
    return {
      owned,
      claim: {
        ok: false,
        dailies,
        xp: 0,
        gold: 0,
        diamonds: 0,
        reason: "Уже получено",
      },
    };
  }
  if ((dailies.progress[questId] ?? 0) < quest.target) {
    return {
      owned,
      claim: {
        ok: false,
        dailies,
        xp: 0,
        gold: 0,
        diamonds: 0,
        reason: "Ещё не выполнено",
      },
    };
  }
  dailies.claimed = [...dailies.claimed, questId];
  saveDailies(dailies);
  return {
    owned: {
      ...owned,
      gold: (owned.gold ?? 0) + quest.gold,
      diamonds: (owned.diamonds ?? 0) + (quest.diamonds ?? 0),
    },
    claim: {
      ok: true,
      dailies,
      xp: quest.xp,
      gold: quest.gold,
      diamonds: quest.diamonds ?? 0,
    },
  };
}
