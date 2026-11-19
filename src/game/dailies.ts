import { hashSeed } from "./arena";
import type { OwnedState } from "./types";

const KEY = "orakul-dailies-v3";
const QUESTS_PER_DAY = 4;

export type DailyQuestId =
  | "win_1"
  | "win_2"
  | "win_3"
  | "win_4"
  | "win_5"
  | "win_10"
  | "play_2"
  | "play_3"
  | "play_5"
  | "bot_win"
  | "bot_win_2"
  | "any_win_2"
  | "any_win_4"
  | "arena_play"
  | "arena_win"
  | "arena_win_2"
  | "campaign_win"
  | "campaign_win_2"
  | "campaign_reach_3"
  | "campaign_reach_5"
  | "campaign_reach_8"
  | "pvp_play"
  | "pvp_win"
  | "pvp_win_2"
  | "shop_buy_1"
  | "shop_buy_2"
  | "shop_buy_3"
  | "spell_3"
  | "spell_5"
  | "spell_8";

export type DailyBattleMode = "bot" | "campaign" | "arena" | "pvp" | "dev";

export type DailyTrack =
  | "battle"
  | "shop_buy"
  | "spell_cast"
  | "campaign_cleared";

export type DailyCategory =
  | "wins"
  | "play"
  | "mode"
  | "shop"
  | "spell"
  | "trail";

export type DailyQuest = {
  id: DailyQuestId;
  title: string;
  target: number;
  xp: number;
  gold: number;
  diamonds: number;
  track: DailyTrack;
  category: DailyCategory;
  /** Какие бои засчитывают прогресс (только track=battle). */
  modes?: DailyBattleMode[];
  /** Нужна победа (battle). */
  needWin?: boolean;
};

/** Полный пул — на день выбираются 4 из разных категорий. */
export const DAILY_QUEST_POOL: DailyQuest[] = [
  {
    id: "win_1",
    title: "Первая кровь дня",
    target: 1,
    xp: 160,
    gold: 55,
    diamonds: 1,
    track: "battle",
    category: "wins",
    needWin: true,
  },
  {
    id: "win_2",
    title: "Двойной приговор",
    target: 2,
    xp: 280,
    gold: 90,
    diamonds: 1,
    track: "battle",
    category: "wins",
    needWin: true,
  },
  {
    id: "win_3",
    title: "Три печати победы",
    target: 3,
    xp: 400,
    gold: 140,
    diamonds: 2,
    track: "battle",
    category: "wins",
    needWin: true,
  },
  {
    id: "win_4",
    title: "Четыре трофея",
    target: 4,
    xp: 520,
    gold: 180,
    diamonds: 2,
    track: "battle",
    category: "wins",
    needWin: true,
  },
  {
    id: "win_5",
    title: "Пять ударов судьбы",
    target: 5,
    xp: 650,
    gold: 220,
    diamonds: 3,
    track: "battle",
    category: "wins",
    needWin: true,
  },
  {
    id: "win_10",
    title: "Десять побед за сутки",
    target: 10,
    xp: 1100,
    gold: 400,
    diamonds: 5,
    track: "battle",
    category: "wins",
    needWin: true,
  },
  {
    id: "play_2",
    title: "Два вызова судьбе",
    target: 2,
    xp: 120,
    gold: 40,
    diamonds: 0,
    track: "battle",
    category: "play",
  },
  {
    id: "play_3",
    title: "Три круга арены судьбы",
    target: 3,
    xp: 180,
    gold: 60,
    diamonds: 0,
    track: "battle",
    category: "play",
  },
  {
    id: "play_5",
    title: "Пять боёв без отдыха",
    target: 5,
    xp: 280,
    gold: 100,
    diamonds: 1,
    track: "battle",
    category: "play",
  },
  {
    id: "bot_win",
    title: "Сломай тень бота",
    target: 1,
    xp: 170,
    gold: 60,
    diamonds: 1,
    track: "battle",
    category: "mode",
    modes: ["bot"],
    needWin: true,
  },
  {
    id: "bot_win_2",
    title: "Две победы над ботом",
    target: 2,
    xp: 300,
    gold: 110,
    diamonds: 1,
    track: "battle",
    category: "mode",
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
    track: "battle",
    category: "wins",
    modes: ["bot", "campaign", "arena"],
    needWin: true,
  },
  {
    id: "any_win_4",
    title: "Четыре одиночных триумфа",
    target: 4,
    xp: 500,
    gold: 170,
    diamonds: 2,
    track: "battle",
    category: "wins",
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
    track: "battle",
    category: "mode",
    modes: ["arena"],
  },
  {
    id: "arena_win",
    title: "Забери круг арены",
    target: 1,
    xp: 220,
    gold: 80,
    diamonds: 2,
    track: "battle",
    category: "mode",
    modes: ["arena"],
    needWin: true,
  },
  {
    id: "arena_win_2",
    title: "Два круга арены",
    target: 2,
    xp: 380,
    gold: 140,
    diamonds: 2,
    track: "battle",
    category: "mode",
    modes: ["arena"],
    needWin: true,
  },
  {
    id: "campaign_win",
    title: "Победа на Тропе",
    target: 1,
    xp: 220,
    gold: 75,
    diamonds: 1,
    track: "battle",
    category: "trail",
    modes: ["campaign"],
    needWin: true,
  },
  {
    id: "campaign_win_2",
    title: "Два узла Тропы",
    target: 2,
    xp: 360,
    gold: 120,
    diamonds: 2,
    track: "battle",
    category: "trail",
    modes: ["campaign"],
    needWin: true,
  },
  {
    id: "campaign_reach_3",
    title: "Доберись до 3-го узла Тропы",
    target: 3,
    xp: 320,
    gold: 110,
    diamonds: 1,
    track: "campaign_cleared",
    category: "trail",
  },
  {
    id: "campaign_reach_5",
    title: "Доберись до 5-го узла Тропы",
    target: 5,
    xp: 480,
    gold: 160,
    diamonds: 2,
    track: "campaign_cleared",
    category: "trail",
  },
  {
    id: "campaign_reach_8",
    title: "Доберись до 8-го узла Тропы",
    target: 8,
    xp: 700,
    gold: 240,
    diamonds: 3,
    track: "campaign_cleared",
    category: "trail",
  },
  {
    id: "pvp_play",
    title: "Вызови чужого оракула",
    target: 1,
    xp: 180,
    gold: 45,
    diamonds: 0,
    track: "battle",
    category: "mode",
    modes: ["pvp"],
  },
  {
    id: "pvp_win",
    title: "Сломи чужую волю",
    target: 1,
    xp: 260,
    gold: 90,
    diamonds: 2,
    track: "battle",
    category: "mode",
    modes: ["pvp"],
    needWin: true,
  },
  {
    id: "pvp_win_2",
    title: "Две дуэли — две победы",
    target: 2,
    xp: 450,
    gold: 160,
    diamonds: 3,
    track: "battle",
    category: "mode",
    modes: ["pvp"],
    needWin: true,
  },
  {
    id: "shop_buy_1",
    title: "Купи осколок в магазине",
    target: 1,
    xp: 140,
    gold: 40,
    diamonds: 0,
    track: "shop_buy",
    category: "shop",
  },
  {
    id: "shop_buy_2",
    title: "Две покупки в магазине",
    target: 2,
    xp: 220,
    gold: 70,
    diamonds: 1,
    track: "shop_buy",
    category: "shop",
  },
  {
    id: "shop_buy_3",
    title: "Три покупки в магазине",
    target: 3,
    xp: 320,
    gold: 100,
    diamonds: 1,
    track: "shop_buy",
    category: "shop",
  },
  {
    id: "spell_3",
    title: "Три заклинания за день",
    target: 3,
    xp: 160,
    gold: 55,
    diamonds: 0,
    track: "spell_cast",
    category: "spell",
  },
  {
    id: "spell_5",
    title: "Пять заклинаний за день",
    target: 5,
    xp: 240,
    gold: 85,
    diamonds: 1,
    track: "spell_cast",
    category: "spell",
  },
  {
    id: "spell_8",
    title: "Восемь заклинаний за день",
    target: 8,
    xp: 360,
    gold: 120,
    diamonds: 2,
    track: "spell_cast",
    category: "spell",
  },
];

/** @deprecated используй todayQuests() — оставлено для старых импортов. */
export const DAILY_QUESTS = DAILY_QUEST_POOL;

export type DailyState = {
  day: string;
  /** Задания сегодня. */
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

/** Берём по одной из разных категорий, пока не наберём QUESTS_PER_DAY. */
export function pickDailyQuestIds(day = todayKey()): DailyQuestId[] {
  const rnd = mulberry32(hashSeed(`dailies-v3:${day}`));
  const byCat = new Map<DailyCategory, DailyQuest[]>();
  for (const q of DAILY_QUEST_POOL) {
    const list = byCat.get(q.category) ?? [];
    list.push(q);
    byCat.set(q.category, list);
  }
  for (const list of byCat.values()) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = list[i]!;
      list[i] = list[j]!;
      list[j] = t;
    }
  }
  const cats = [...byCat.keys()];
  for (let i = cats.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = cats[i]!;
    cats[i] = cats[j]!;
    cats[j] = t;
  }
  const picked: DailyQuestId[] = [];
  const used = new Set<DailyQuestId>();
  for (const cat of cats) {
    if (picked.length >= QUESTS_PER_DAY) break;
    const q = byCat.get(cat)?.[0];
    if (!q || used.has(q.id)) continue;
    picked.push(q.id);
    used.add(q.id);
  }
  // Добор, если категорий меньше четырёх.
  const rest = [...DAILY_QUEST_POOL].filter((q) => !used.has(q.id));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = rest[i]!;
    rest[i] = rest[j]!;
    rest[j] = t;
  }
  for (const q of rest) {
    if (picked.length >= QUESTS_PER_DAY) break;
    picked.push(q.id);
  }
  return picked;
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

function setAtLeast(
  st: DailyState,
  id: DailyQuestId,
  value: number,
  target: number,
): void {
  const cur = st.progress[id] ?? 0;
  st.progress[id] = Math.min(target, Math.max(cur, value));
}

/** Учёт боя для дейликов. */
export function trackBattleForDailies(
  won: boolean,
  mode: DailyBattleMode = "bot",
): DailyState {
  const st = loadDailies();
  for (const id of st.questIds) {
    const q = questById(id);
    if (!q || q.track !== "battle") continue;
    if (q.modes && !q.modes.includes(mode)) continue;
    if (q.needWin && !won) continue;
    bump(st, id, 1, q.target);
  }
  saveDailies(st);
  return st;
}

/** Покупка осколка/карты в магазине. */
export function trackShopBuyForDailies(amount = 1): DailyState {
  const st = loadDailies();
  const n = Math.max(1, Math.floor(amount));
  for (const id of st.questIds) {
    const q = questById(id);
    if (!q || q.track !== "shop_buy") continue;
    bump(st, id, n, q.target);
  }
  saveDailies(st);
  return st;
}

/** Сыгранные заклинания (сумма за бой). */
export function trackSpellCastsForDailies(amount: number): DailyState {
  const st = loadDailies();
  const n = Math.max(0, Math.floor(amount));
  if (n <= 0) return st;
  for (const id of st.questIds) {
    const q = questById(id);
    if (!q || q.track !== "spell_cast") continue;
    bump(st, id, n, q.target);
  }
  saveDailies(st);
  return st;
}

/** Прогресс Тропы сегодня (cleared). */
export function trackCampaignClearedForDailies(cleared: number): DailyState {
  const st = loadDailies();
  const v = Math.max(0, Math.floor(cleared));
  for (const id of st.questIds) {
    const q = questById(id);
    if (!q || q.track !== "campaign_cleared") continue;
    setAtLeast(st, id, v, q.target);
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
