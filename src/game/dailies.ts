import type { OwnedState } from "./types";

const KEY = "orakul-dailies-v1";

export type DailyQuestId = "win_1" | "win_3" | "play_2";

export type DailyQuest = {
  id: DailyQuestId;
  title: string;
  target: number;
  xp: number;
  gold: number;
};

export const DAILY_QUESTS: DailyQuest[] = [
  {
    id: "win_1",
    title: "Одержи 1 победу в одиночке",
    target: 1,
    xp: 160,
    gold: 55,
  },
  {
    id: "win_3",
    title: "Одержи 3 победы за день",
    target: 3,
    xp: 380,
    gold: 130,
  },
  {
    id: "play_2",
    title: "Сыграй 2 боя (победа или поражение)",
    target: 2,
    xp: 120,
    gold: 35,
  },
];

export type DailyState = {
  day: string; // YYYY-MM-DD local
  progress: Record<DailyQuestId, number>;
  claimed: DailyQuestId[];
};

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function loadDailies(): DailyState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DailyState;
      if (parsed?.day === todayKey()) return parsed;
    }
  } catch {
    /* ignore */
  }
  return freshDailies();
}

function freshDailies(): DailyState {
  return {
    day: todayKey(),
    progress: { win_1: 0, win_3: 0, play_2: 0 },
    claimed: [],
  };
}

export function saveDailies(state: DailyState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

/** Учёт боя для дейликов. */
export function trackBattleForDailies(won: boolean): DailyState {
  const st = loadDailies();
  st.progress.play_2 = Math.min(
    DAILY_QUESTS.find((q) => q.id === "play_2")!.target,
    (st.progress.play_2 ?? 0) + 1,
  );
  if (won) {
    st.progress.win_1 = Math.min(1, (st.progress.win_1 ?? 0) + 1);
    st.progress.win_3 = Math.min(3, (st.progress.win_3 ?? 0) + 1);
  }
  saveDailies(st);
  return st;
}

export type ClaimResult = {
  ok: boolean;
  dailies: DailyState;
  xp: number;
  gold: number;
  reason?: string;
};

export function claimDaily(
  owned: OwnedState,
  questId: DailyQuestId,
): { owned: OwnedState; claim: ClaimResult } {
  const quest = DAILY_QUESTS.find((q) => q.id === questId);
  const dailies = loadDailies();
  if (!quest) {
    return {
      owned,
      claim: { ok: false, dailies, xp: 0, gold: 0, reason: "Нет задания" },
    };
  }
  if (dailies.claimed.includes(questId)) {
    return {
      owned,
      claim: { ok: false, dailies, xp: 0, gold: 0, reason: "Уже получено" },
    };
  }
  if ((dailies.progress[questId] ?? 0) < quest.target) {
    return {
      owned,
      claim: { ok: false, dailies, xp: 0, gold: 0, reason: "Ещё не выполнено" },
    };
  }
  dailies.claimed = [...dailies.claimed, questId];
  saveDailies(dailies);
  return {
    owned: {
      ...owned,
      gold: (owned.gold ?? 0) + quest.gold,
    },
    claim: {
      ok: true,
      dailies,
      xp: quest.xp,
      gold: quest.gold,
    },
  };
}
