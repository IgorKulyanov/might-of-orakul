import { MAX_PLAYER_LEVEL } from "./progression";
import type { OwnedState } from "./types";

const KEY = "orakul-campaign-v1";

export const CAMPAIGN_NODES = 15;

/**
 * Награды тропы — только на вехах 5 / 10 / 15.
 * Обычные бои тропы дают лишь XP (без золота/алмазов).
 */
export const CAMPAIGN_MILESTONES: Record<
  5 | 10 | 15,
  { gold: number; diamonds: number; title: string }
> = {
  5: { gold: 100, diamonds: 0, title: "Первая гряда" },
  10: { gold: 200, diamonds: 3, title: "Сердце тропы" },
  15: { gold: 0, diamonds: 10, title: "Венец оракула" },
};

/**
 * Позиции узлов на карте (% от ширины/высоты), извилистый путь снизу → вверх.
 */
/**
 * % на карте по земле (лес → холмы → вулкан).
 * Небо сверху ~0–40% — туда узлы не ставим.
 */
export const CAMPAIGN_NODE_POS: Array<{ x: number; y: number }> = [
  { x: 10, y: 78 }, // 1 лес у реки
  { x: 22, y: 72 }, // 2 тропа у водопада
  { x: 36, y: 76 }, // 3 опушка
  { x: 50, y: 70 }, // 4 холмы
  { x: 64, y: 74 }, // 5 веха — луг
  { x: 76, y: 68 }, // 6 к подножью
  { x: 68, y: 62 }, // 7 изгиб
  { x: 54, y: 66 }, // 8 центр холмов
  { x: 40, y: 60 }, // 9 к гряде
  { x: 58, y: 58 }, // 10 веха — перед вулканом
  { x: 72, y: 56 }, // 11 склон
  { x: 84, y: 52 }, // 12 у лавы
  { x: 78, y: 48 }, // 13 хребет вулкана
  { x: 66, y: 50 }, // 14 скалы
  { x: 74, y: 44 }, // 15 вершина на камне, не в небе
];

export type CampaignState = {
  /** Сколько узлов пройдено подряд с начала (0…15). */
  cleared: number;
  /** Какие вехи уже забраны. */
  claimed: number[];
  /** День (YYYY-MM-DD), в который был проигрыш — до завтра карта закрыта. */
  lostDay: string | null;
  /**
   * Календарный день текущего забега (локальная дата YYYY-MM-DD).
   * Смена дня → полный сброс прогресса и блокировки.
   */
  day: string;
};

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function freshCampaign(day = todayKey()): CampaignState {
  return { cleared: 0, claimed: [], lostDay: null, day };
}

/** Нормализация + ежедневный сброс, если календарный день сменился. */
export function normalizeCampaign(
  raw?: Partial<CampaignState> | null,
): CampaignState {
  const today = todayKey();
  if (!raw || raw.day !== today) {
    return freshCampaign(today);
  }
  return {
    cleared: Math.min(
      CAMPAIGN_NODES,
      Math.max(0, Math.floor(raw.cleared ?? 0)),
    ),
    claimed: Array.isArray(raw.claimed) ? raw.claimed.map(Number) : [],
    lostDay: raw.lostDay === today ? today : null,
    day: today,
  };
}

export function loadCampaign(): CampaignState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CampaignState>;
      const next = normalizeCampaign(parsed);
      // Если день сменился — сразу пишем свежий сейв.
      if (parsed.day !== next.day) saveCampaign(next);
      return next;
    }
  } catch {
    /* ignore */
  }
  const fresh = freshCampaign();
  saveCampaign(fresh);
  return fresh;
}

/**
 * Вызвать при открытии тропы / фокусе окна:
 * если наступили новые сутки — сбросить забег.
 */
export function refreshCampaignDay(state: CampaignState): CampaignState {
  const next = normalizeCampaign(state);
  if (
    next.day !== state.day ||
    next.cleared !== state.cleared ||
    next.lostDay !== state.lostDay
  ) {
    saveCampaign(next);
  }
  return next;
}

export function saveCampaign(state: CampaignState): void {
  localStorage.setItem(KEY, JSON.stringify({ ...state, day: state.day || todayKey() }));
}

/** Испытание недоступно до завтра после поражения. */
export function isCampaignLockedToday(state: CampaignState): boolean {
  const s = normalizeCampaign(state);
  return !!s.lostDay && s.lostDay === todayKey();
}

/** Следующий узел для боя (1…15) или null если всё пройдено. */
export function nextCampaignNode(state: CampaignState): number | null {
  if (state.cleared >= CAMPAIGN_NODES) return null;
  return state.cleared + 1;
}

export function canFightNode(state: CampaignState, node: number): boolean {
  if (isCampaignLockedToday(state)) return false;
  if (node < 1 || node > CAMPAIGN_NODES) return false;
  return node === state.cleared + 1;
}

/**
 * Уровень бота на узле: под уровень игрока, но кривая жестокая.
 * Узел 1 ≈ игрок−1; узел 15 ≈ игрок+22 (кап 50) — пройти все адски сложно.
 */
export function campaignFoeLevel(playerLevel: number, node: number): number {
  const lv = Math.max(1, Math.min(MAX_PLAYER_LEVEL, playerLevel));
  const n = Math.max(1, Math.min(CAMPAIGN_NODES, node));
  /** Смещение сложности по узлу 1…15 */
  const offset = [
    -1, 0, 1, 2, 3, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22,
  ][n - 1]!;
  /** Шипы на вехах */
  const spike = n === 5 ? 1 : n === 10 ? 2 : n === 15 ? 4 : 0;
  return Math.max(1, Math.min(MAX_PLAYER_LEVEL, lv + offset + spike));
}

/** Имена стражей тропы. */
export function campaignFoeName(node: number): string {
  const names = [
    "Разбойник тропы",
    "Охотник тумана",
    "Страж рощи",
    "Клинок болота",
    "Капитан заставы",
    "Рыцарь пепла",
    "Ведьма ущелья",
    "Палач моста",
    "Воевода холмов",
    "Герцог бури",
    "Архимаг разлома",
    "Тень цитадели",
    "Чемпион врат",
    "Хранитель шпиля",
    "Владыка вершины",
  ];
  return names[Math.max(0, Math.min(14, node - 1))]!;
}

export type CampaignBattleResult = {
  campaign: CampaignState;
  owned: OwnedState;
  milestoneGold: number;
  milestoneDiamonds: number;
  milestoneTitle: string | null;
};

/** Победа на узле: прогресс + веха (если есть). XP боя — отдельно; валюта только с вех. */
export function applyCampaignWin(
  campaign: CampaignState,
  owned: OwnedState,
  node: number,
): CampaignBattleResult {
  if (node !== campaign.cleared + 1) {
    return {
      campaign,
      owned,
      milestoneGold: 0,
      milestoneDiamonds: 0,
      milestoneTitle: null,
    };
  }
  const cleared = Math.min(CAMPAIGN_NODES, campaign.cleared + 1);
  const claimed = [...campaign.claimed];
  let milestoneGold = 0;
  let milestoneDiamonds = 0;
  let milestoneTitle: string | null = null;

  const mile = cleared as 5 | 10 | 15;
  if (
    (cleared === 5 || cleared === 10 || cleared === 15) &&
    !claimed.includes(cleared)
  ) {
    const reward = CAMPAIGN_MILESTONES[mile];
    milestoneGold = reward.gold;
    milestoneDiamonds = reward.diamonds;
    milestoneTitle = reward.title;
    claimed.push(cleared);
  }

  const nextCamp: CampaignState = {
    cleared,
    claimed,
    lostDay: null,
    day: todayKey(),
  };
  saveCampaign(nextCamp);

  const nextOwned: OwnedState = {
    ...owned,
    gold: (owned.gold ?? 0) + milestoneGold,
    diamonds: (owned.diamonds ?? 0) + milestoneDiamonds,
  };

  return {
    campaign: nextCamp,
    owned: nextOwned,
    milestoneGold,
    milestoneDiamonds,
    milestoneTitle,
  };
}

/** Поражение: карта закрыта до следующего календарного дня. */
export function applyCampaignLoss(campaign: CampaignState): CampaignState {
  const today = todayKey();
  const next: CampaignState = {
    ...normalizeCampaign(campaign),
    lostDay: today,
    day: today,
  };
  saveCampaign(next);
  return next;
}
