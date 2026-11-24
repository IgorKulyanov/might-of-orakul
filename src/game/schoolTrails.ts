/**
 * Тропы вкуса школ — онбординг до выбора homeFaction.
 * Враг: стол + опционально рука/колода (выкладка после убийств).
 * Основной takeAiStep бота не меняем.
 * Награды школ изолированы: в мир уходит только одна мини-колода + оракул.
 */
import type { BattleState, Faction, OwnedState } from "./types";
import type { CardUpgradeLevel } from "./cardUpgrades";
import { getCard } from "./cards";
import { getHero } from "./heroes";
import {
  finalizeSeededBoardRoots,
  MAX_HAND_SIZE,
  seedBoardCreature,
} from "./engine";
import { NEUTRAL_STARTER_IDS } from "./starterDecks";

/** Выбор школы — после полной тропы (5 побед на одной школе). */
export const SCHOOL_TRAIL_WINS_TO_PICK = 5;
export const SCHOOL_TRAIL_STEPS = 5;

/**
 * Награды тропы (в мини-колоду школы): по 1 карте за бой на флагах 1–4.
 * К 5-му бою уже все 4 карты школы в колоде/руке.
 * 1 — доп. мана · 2 — первый юнит · 3 — магия · 4 — второй юнит.
 */
export type SchoolTrailReward = {
  afterCleared: number;
  cardId: string;
};

export const SCHOOL_TRAIL_REWARDS: Record<Faction, SchoolTrailReward[]> = {
  death: [
    { afterCleared: 1, cardId: "hero_mana" },
    { afterCleared: 2, cardId: "skeleton" },
    { afterCleared: 3, cardId: "poison" },
    { afterCleared: 4, cardId: "zombie" },
  ],
  nature: [
    { afterCleared: 1, cardId: "hero_mana" },
    { afterCleared: 2, cardId: "spider" },
    { afterCleared: 3, cardId: "slow_foe" },
    { afterCleared: 4, cardId: "elf" },
  ],
  water: [
    { afterCleared: 1, cardId: "hero_mana" },
    { afterCleared: 2, cardId: "aquilite" },
    { afterCleared: 3, cardId: "ice_trap" },
    { afterCleared: 4, cardId: "water_spirit" },
  ],
  life: [
    { afterCleared: 1, cardId: "hero_mana" },
    { afterCleared: 2, cardId: "crossbowman" },
    { afterCleared: 3, cardId: "life_root" },
    { afterCleared: 4, cardId: "tank" },
  ],
  hell: [
    { afterCleared: 1, cardId: "hero_mana" },
    { afterCleared: 2, cardId: "fire_lizard" },
    { afterCleared: 3, cardId: "strike" },
    { afterCleared: 4, cardId: "fire_gopnik" },
  ],
};

export const SCHOOL_TRAIL_FACTIONS: Faction[] = [
  "death",
  "nature",
  "water",
  "life",
  "hell",
];

/**
 * Флажки на карте мира (% от квадрата).
 * Вода ↓ · Природа ← · Жизнь ↖ · Смерть ↗ · Ад → · ★ центр = выбор школы.
 */
export const SCHOOL_TRAIL_FLAG_POS: Record<
  Faction,
  Array<{ x: number; y: number }>
> = {
  death: [
    { x: 67.5, y: 22.9 },
    { x: 54.4, y: 24.3 },
    { x: 63.6, y: 29.3 },
    { x: 78.4, y: 30.1 },
    { x: 56.6, y: 44.4 },
  ],
  nature: [
    { x: 37.1, y: 46 },
    { x: 24.9, y: 56 },
    { x: 12.3, y: 58.7 },
    { x: 27.6, y: 63.6 },
    { x: 42.9, y: 51.8 },
  ],
  water: [
    { x: 22, y: 73.9 },
    { x: 17.1, y: 84 },
    { x: 39.1, y: 86.6 },
    { x: 51.7, y: 72.1 },
    { x: 49.1, y: 58.1 },
  ],
  life: [
    { x: 13.3, y: 23.8 },
    { x: 28.7, y: 24.3 },
    { x: 45.1, y: 25.3 },
    { x: 37.1, y: 36.7 },
    { x: 46.2, y: 43.6 },
  ],
  hell: [
    { x: 87.2, y: 69.4 },
    { x: 79, y: 62.3 },
    { x: 77.4, y: 52.2 },
    { x: 67.6, y: 57.7 },
    { x: 57.6, y: 52.5 },
  ],
};

/** Финальный флажок «Сердце мира» — выбор оракула после любой полной тропы. */
export const SCHOOL_TRAIL_FINALE_POS = { x: 49.8, y: 51 };

export type FlagXY = { x: number; y: number };

export type SchoolTrailFlagLayout = {
  schools: Record<Faction, FlagXY[]>;
  finale: FlagXY;
};

/** v3 — ручная раскладка с карты. */
const FLAG_LAYOUT_KEY = "orakul-school-trail-flags-v3";

function cloneFlagPos(p: FlagXY): FlagXY {
  return { x: p.x, y: p.y };
}

/** Заводская раскладка из кода. */
export function defaultSchoolTrailFlagLayout(): SchoolTrailFlagLayout {
  const schools = {} as Record<Faction, FlagXY[]>;
  for (const f of SCHOOL_TRAIL_FACTIONS) {
    schools[f] = SCHOOL_TRAIL_FLAG_POS[f].map(cloneFlagPos);
  }
  return { schools, finale: cloneFlagPos(SCHOOL_TRAIL_FINALE_POS) };
}

function normalizeLayout(
  raw: Partial<SchoolTrailFlagLayout> | null | undefined,
): SchoolTrailFlagLayout {
  const base = defaultSchoolTrailFlagLayout();
  if (!raw || typeof raw !== "object") return base;
  for (const f of SCHOOL_TRAIL_FACTIONS) {
    const list = raw.schools?.[f];
    if (!Array.isArray(list) || list.length !== SCHOOL_TRAIL_STEPS) continue;
    base.schools[f] = list.map((p, i) => ({
      x: Math.max(0, Math.min(100, Number(p?.x) || base.schools[f][i]!.x)),
      y: Math.max(0, Math.min(100, Number(p?.y) || base.schools[f][i]!.y)),
    }));
  }
  if (raw.finale && typeof raw.finale === "object") {
    base.finale = {
      x: Math.max(0, Math.min(100, Number(raw.finale.x) || base.finale.x)),
      y: Math.max(0, Math.min(100, Number(raw.finale.y) || base.finale.y)),
    };
  }
  return base;
}

export function loadSchoolTrailFlagLayout(): SchoolTrailFlagLayout {
  try {
    const raw = localStorage.getItem(FLAG_LAYOUT_KEY);
    if (!raw) return defaultSchoolTrailFlagLayout();
    return normalizeLayout(JSON.parse(raw) as Partial<SchoolTrailFlagLayout>);
  } catch {
    return defaultSchoolTrailFlagLayout();
  }
}

export function saveSchoolTrailFlagLayout(layout: SchoolTrailFlagLayout): void {
  try {
    localStorage.setItem(
      FLAG_LAYOUT_KEY,
      JSON.stringify(normalizeLayout(layout)),
    );
  } catch {
    /* ignore */
  }
}

export function clearSchoolTrailFlagLayout(): void {
  try {
    localStorage.removeItem(FLAG_LAYOUT_KEY);
  } catch {
    /* ignore */
  }
}

/** Текст для вставки в schoolTrails.ts после ручной расстановки. */
export function formatSchoolTrailFlagLayoutTs(
  layout: SchoolTrailFlagLayout,
): string {
  const L = normalizeLayout(layout);
  const lines: string[] = [
    "export const SCHOOL_TRAIL_FLAG_POS: Record<",
    "  Faction,",
    "  Array<{ x: number; y: number }>",
    "> = {",
  ];
  for (const f of SCHOOL_TRAIL_FACTIONS) {
    lines.push(`  ${f}: [`);
    for (const p of L.schools[f]) {
      lines.push(
        `    { x: ${Math.round(p.x * 10) / 10}, y: ${Math.round(p.y * 10) / 10} },`,
      );
    }
    lines.push("  ],");
  }
  lines.push("};");
  lines.push("");
  lines.push(
    `export const SCHOOL_TRAIL_FINALE_POS = { x: ${Math.round(L.finale.x * 10) / 10}, y: ${Math.round(L.finale.y * 10) / 10} };`,
  );
  return lines.join("\n");
}

export type SchoolTrailStep = {
  /** Юниты на столе врага (слоты слева направо, null = пусто). */
  slots: (string | null)[];
  /** Стартовая рука врага — выкладывает, когда есть слот и мана. */
  hand?: string[];
  /** Колода врага (добор / запас на выкладку). */
  deck?: string[];
  /** Могила врага до боя (для могильщика). */
  graveyard?: string[];
  /** Подпись врага. */
  foeName: string;
  /** Чему учим. */
  lesson: string;
  /** После победы (витрина). */
  wowHint?: string;
  /** Уровень апгрейда юнитов врага (flex с ур.2). */
  upgradeLevel?: CardUpgradeLevel;
};

const U: CardUpgradeLevel = 2; // flex-абилки

/**
 * Каждый флаг — свой урок (не «стена + стреляй в оракула» пять раз).
 * 1 разминка → 2 давление → 3 витрина школы → 4 ответ на трюк → 5 пик.
 */
export const SCHOOL_TRAIL_SCRIPTS: Record<Faction, SchoolTrailStep[]> = {
  death: [
    {
      slots: ["zombie", null, null, null, null],
      foeName: "Гниль окраины",
      lesson: "Один жирный зомби. Выложи своих, копи ману — учись ходу.",
    },
    {
      slots: ["skeleton", "skeleton", null, null, null],
      hand: ["skeleton", "skeleton"],
      foeName: "Костяной дозор",
      lesson: "Двое на столе и ещё скелеты в руке. Снял — снова кости.",
    },
    {
      slots: [null, "necro_mage", null, null, null],
      foeName: "Некромант-искатель",
      lesson: "Витрина: клепает скелетов. Пока бьёшь лицо — доска зарастает.",
      wowHint: "Некромант зовёт костяных слуг. Такие карты бывают в лавке Смерти.",
      upgradeLevel: U,
    },
    {
      slots: [null, "gravedigger", null, null, null],
      graveyard: ["skeleton", "zombie"],
      foeName: "Могильщик",
      lesson: "Другой трюк: поднимает из могилы. Сними движок, иначе вечный пресс.",
      wowHint: "Могильщик поднимает мёртвых. Копи на него в лавке Смерти.",
      upgradeLevel: U,
    },
    {
      slots: [null, "vampire", null, null, null],
      hand: ["banshee"],
      foeName: "Страж могил",
      lesson: "Пик: вампир на столе, банши из руки. Сними укус, пока не вышла певица.",
      wowHint: "Смерть кормится могилой. Школа трупов ждёт тебя.",
    },
  ],
  nature: [
    {
      slots: ["spider", null, null, null, null],
      foeName: "Паук чащи",
      lesson: "Яд тикает каждый ход. Тянуть «в оракула» — самоубийство.",
    },
    {
      // Двое на столе + ещё двое в руке: убил — выкладывает снова.
      slots: ["spider", "spider", null, null, null],
      hand: ["spider", "spider"],
      foeName: "Паучья пара",
      lesson: "Два на столе и ещё два в руке. Снял — снова яд. Не гони только лицо.",
    },
    {
      slots: [null, "elf", null, null, null],
      hand: ["spider", "spider", "spider"],
      foeName: "Стрелок рощи",
      lesson: "Эльф бьёт через линию; пауки из руки заполняют стол.",
      wowHint: "Эльф — лучник Природы. Такие карты в лавке рощи.",
    },
    {
      // Одна матка + её каст (flex с ур.2). Без руки — только призыв умением.
      slots: [null, "hornet_queen", null, null, null],
      foeName: "Матка шершней",
      lesson: "Одна матка: бьёт или клепает шершня-воина за ману. Убей, пока рой не вырос.",
      wowHint: "Матка собирает рой. Такие карты — в лавке Природы.",
      upgradeLevel: U,
    },
    {
      slots: [null, "ent", null, null, null],
      hand: ["spider", "spider", "spider"],
      foeName: "Страж рощи",
      lesson: "Энт ур.1 (2/10): вышел паук — энт +HP паука; ударили паука — энт теряет столько же.",
      wowHint: "Природа давит числом. Выбери её — копи на рощу.",
    },
  ],
  water: [
    {
      slots: ["aquilite", null, null, null, null],
      foeName: "Акулит прибоя",
      lesson: "Дешёвый кусака. Быстрый трейд — разминка.",
    },
    {
      slots: ["aquilite", "aquilite", null, null, null],
      hand: ["aquilite", "aquilite"],
      foeName: "Пара прибоя",
      lesson: "Двое на столе и ещё двое в руке. Снял — снова кусают.",
    },
    {
      slots: [null, "triton", null, null, null],
      foeName: "Тритон пучины",
      lesson: "Витрина: клепает аквалитов. Игнор = толпа.",
      wowHint: "Тритон зовёт аквалитов из пучины. Цель для лавки Воды.",
      upgradeLevel: U,
    },
    {
      slots: [null, "mermaid", null, null, null],
      hand: ["aquilite", "aquilite", "aquilite"],
      foeName: "Сон волны",
      lesson: "Русалка усыпляет; акулиты из руки заполняют стол.",
      upgradeLevel: U,
    },
    {
      slots: ["water_golem", "water_golem", "water_golem", null, null],
      foeName: "Страж волн",
      lesson: "Пик: три водяных голема. Толстая линия — ломай по одному.",
      wowHint: "Вода давит массой. Школа пучины зовёт.",
    },
  ],
  life: [
    {
      slots: ["spearman", null, null, null, null],
      foeName: "Копьё аванпоста",
      lesson: "Один копейщик. Спокойная разминка — без стены и мага.",
    },
    {
      slots: ["tank", "tank", null, null, null],
      foeName: "Щит ордена",
      lesson: "Две стены на столе. В них впустую не бей — копи ману и обходи.",
    },
    {
      slots: ["tank", "mage", null, null, null],
      foeName: "Маг ордена",
      lesson: "Витрина: маг лечит стену. Бить только танк — вечный бой.",
      wowHint: "Маг лечит своих. Такие якоря — в лавке Жизни.",
      upgradeLevel: U,
    },
    {
      slots: ["paladin", "crossbowman", null, null, null],
      foeName: "Паладин",
      lesson: "Щит + стрелок. Первая атака не убивает — планируй два удара.",
      upgradeLevel: U,
    },
    {
      slots: [null, "angel", null, null, null],
      hand: ["spearman"],
      foeName: "Страж света",
      lesson: "Ангел на столе, копейщик в руке. Сними хил, пока не вышел копьё.",
      wowHint: "Жизнь не сваливается. Орден ждёт твоего голоса.",
      upgradeLevel: U,
    },
  ],
  hell: [
    {
      slots: ["fire_lizard", null, null, null, null],
      foeName: "Ящер пепла",
      lesson: "Один ящер. Быстрый трейд — разминка ада.",
    },
    {
      slots: ["fire_lizard", "fire_lizard", null, null, null],
      hand: ["fire_lizard"],
      foeName: "Пара пепла",
      lesson: "Два ящера на столе, ещё один в руке. Снял — снова жгут.",
    },
    {
      slots: [null, "succubus", null, null, null],
      hand: ["cerberus", "cerberus"],
      foeName: "Суккуб",
      lesson: "Суккуб ур.2; церберы из руки. Мужчины её не бьют.",
      wowHint: "Суккуб ломает правила боя. Цель лавки Ада.",
      upgradeLevel: U,
    },
    {
      slots: ["imp", "succubus", null, null, null],
      foeName: "Искусительница",
      lesson: "Суккуб держит, имп жрёт. Два разных ответа сразу.",
      upgradeLevel: U,
    },
    {
      slots: [null, "balthazar", null, null, null],
      hand: ["imp", "imp", "imp"],
      foeName: "Страж жара",
      lesson: "Бальтазар ур.2; импы из руки жрут лицо. Меняй приоритет.",
      wowHint: "Ад жжёт и меняет доску. Пламя зовёт.",
      upgradeLevel: U,
    },
  ],
};

/** После победы — обязательная пауза на карте (не следующий бой сразу). */
export type SchoolTrailBeat = {
  faction: Faction;
  newlyCleared: number;
  rewardCardId: string | null;
  foeName: string;
  wowHint?: string;
};

export function schoolTrailTitle(faction: Faction): string {
  const names: Record<Faction, string> = {
    death: "Тропа Смерти",
    nature: "Тропа Природы",
    water: "Тропа Воды",
    life: "Тропа Жизни",
    hell: "Тропа Ада",
  };
  return names[faction];
}

/** Винительный: «Добро пожаловать на Тропу Природы». */
export function schoolTrailTitleAccusative(faction: Faction): string {
  const names: Record<Faction, string> = {
    death: "Тропу Смерти",
    nature: "Тропу Природы",
    water: "Тропу Воды",
    life: "Тропу Жизни",
    hell: "Тропу Ада",
  };
  return names[faction];
}

/** Родительный падеж школы: «сила школы Воды». */
export function schoolTrailPowerName(faction: Faction): string {
  const names: Record<Faction, string> = {
    death: "Смерти",
    nature: "Природы",
    water: "Воды",
    life: "Жизни",
    hell: "Ада",
  };
  return names[faction];
}

/** Вступление перед 1-м флагом тропы. */
export const SCHOOL_TRAIL_INTRO_ART: Record<Faction, string> = {
  death: "/trails/intro/death.jpg",
  nature: "/trails/intro/nature.jpg",
  water: "/trails/intro/water.jpg",
  life: "/trails/intro/life.jpg",
  hell: "/trails/intro/hell.jpg",
};

export const SCHOOL_TRAIL_THREE_CARDS_ART = "/trails/intro/three-cards.jpg";

export function schoolTrailIntroArt(faction: Faction): string {
  return SCHOOL_TRAIL_INTRO_ART[faction];
}

const TRAIL_INTRO_SEEN_KEY = "orakul-trail-intro-seen-v1";

export function hasSeenTrailIntro(faction: Faction): boolean {
  try {
    const raw = localStorage.getItem(TRAIL_INTRO_SEEN_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<Record<Faction, boolean>>;
    return Boolean(parsed?.[faction]);
  } catch {
    return false;
  }
}

export function markTrailIntroSeen(faction: Faction): void {
  try {
    const raw = localStorage.getItem(TRAIL_INTRO_SEEN_KEY);
    const parsed =
      raw && typeof raw === "string"
        ? (JSON.parse(raw) as Partial<Record<Faction, boolean>>)
        : {};
    parsed[faction] = true;
    localStorage.setItem(TRAIL_INTRO_SEEN_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

export function clearTrailIntroSeen(): void {
  try {
    localStorage.removeItem(TRAIL_INTRO_SEEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Показывать вступление только при первом входе на 1-й флаг тропы. */
export function shouldShowTrailIntro(
  owned: OwnedState,
  faction: Faction,
  stepIndex: number,
): boolean {
  if (stepIndex !== 0) return false;
  if (schoolTrailCleared(owned, faction) > 0) return false;
  return !hasSeenTrailIntro(faction);
}

export function schoolTrailStep(
  faction: Faction,
  stepIndex: number,
): SchoolTrailStep | null {
  const list = SCHOOL_TRAIL_SCRIPTS[faction];
  if (!list || stepIndex < 0 || stepIndex >= list.length) return null;
  return list[stepIndex]!;
}

/** Сколько шагов пройдено на тропе (0…5). */
export function schoolTrailCleared(
  owned: OwnedState,
  faction: Faction,
): number {
  const n = owned.schoolTrailCleared?.[faction];
  return Math.max(0, Math.min(SCHOOL_TRAIL_STEPS, Math.floor(Number(n) || 0)));
}

export function schoolTrailWinsTotal(owned: OwnedState): number {
  return Math.max(0, Math.floor(Number(owned.schoolTrailWins) || 0));
}

export function schoolTrailDraft(
  owned: OwnedState,
  faction: Faction,
): string[] {
  const list = owned.schoolTrailDrafts?.[faction];
  return Array.isArray(list) ? list.map(String) : [];
}

export function schoolTrailRewardForClear(
  faction: Faction,
  cleared: number,
): SchoolTrailReward | null {
  return (
    SCHOOL_TRAIL_REWARDS[faction]?.find((r) => r.afterCleared === cleared) ??
    null
  );
}

/** Школа полностью пройдена (5/5) — её мини-колоду можно забрать в мир. */
export function schoolTrailComplete(
  owned: OwnedState,
  faction: Faction,
): boolean {
  return schoolTrailCleared(owned, faction) >= SCHOOL_TRAIL_STEPS;
}

/** Сброс прогресса троп (флажки / черновики) — без вайпа аккаунта и коллекции. */
export function resetSchoolTrailProgress(owned: OwnedState): OwnedState {
  return {
    ...owned,
    schoolTrailCleared: {},
    schoolTrailWins: 0,
    schoolTrailDrafts: {},
    schoolTrailGrandRewardClaimed: false,
  };
}

export function finishedSchoolTrails(owned: OwnedState): Faction[] {
  return SCHOOL_TRAIL_FACTIONS.filter((f) => schoolTrailComplete(owned, f));
}

/** Хотя бы одна тропа 5/5 — можно выбрать оракула этой школы. */
export function canPickSchool(owned: OwnedState): boolean {
  return finishedSchoolTrails(owned).length > 0;
}

export const SCHOOL_TRAIL_GRAND_GOLD = 500;
export const SCHOOL_TRAIL_GRAND_DIAMONDS = 25;

/** Все 5 школ пройдены — открыт 6-й флаг и гранд-награда. */
export function allSchoolTrailsComplete(owned: OwnedState): boolean {
  return finishedSchoolTrails(owned).length >= SCHOOL_TRAIL_FACTIONS.length;
}

/** Выдать 500 зол. + 25 алмазов один раз за полный путь. */
export function claimSchoolTrailGrandReward(owned: OwnedState): OwnedState {
  if (owned.schoolTrailGrandRewardClaimed) return owned;
  if (!allSchoolTrailsComplete(owned)) return owned;
  return {
    ...owned,
    gold: Math.max(0, Math.floor(Number(owned.gold) || 0)) + SCHOOL_TRAIL_GRAND_GOLD,
    diamonds:
      Math.max(0, Math.floor(Number(owned.diamonds) || 0)) +
      SCHOOL_TRAIL_GRAND_DIAMONDS,
    schoolTrailGrandRewardClaimed: true,
  };
}

/** Видео + музыка церемонии (звук уже в файле). */
export const SCHOOL_GRADUATION_VIDEO = "/trails/school-graduation.mp4?v=t4";
export const SCHOOL_GRADUATION_FRAME = "/trails/school-frame.png?v=vert2";
/** Запасной трек, если браузер режет звук у video. */
export const SCHOOL_GRADUATION_MUSIC = "/sfx/schools-complete.mp3?v=1";

export function applySchoolTrailWin(
  owned: OwnedState,
  faction: Faction,
): {
  owned: OwnedState;
  step: SchoolTrailStep;
  newlyCleared: number;
  rewardCardId: string | null;
} {
  const before = schoolTrailCleared(owned, faction);
  const step = schoolTrailStep(faction, before);
  if (!step) {
    return {
      owned,
      step: SCHOOL_TRAIL_SCRIPTS[faction][0]!,
      newlyCleared: before,
      rewardCardId: null,
    };
  }
  const newlyCleared = Math.min(SCHOOL_TRAIL_STEPS, before + 1);
  const cleared = {
    ...(owned.schoolTrailCleared ?? {}),
    [faction]: newlyCleared,
  };
  const wins = schoolTrailWinsTotal(owned) + 1;
  const reward = schoolTrailRewardForClear(faction, newlyCleared);
  const prevDraft = schoolTrailDraft(owned, faction);
  const nextDraft =
    reward && !prevDraft.includes(reward.cardId)
      ? [...prevDraft, reward.cardId]
      : prevDraft;
  return {
    owned: {
      ...owned,
      schoolTrailCleared: cleared,
      schoolTrailWins: wins,
      schoolTrailDrafts: {
        ...(owned.schoolTrailDrafts ?? {}),
        [faction]: nextDraft,
      },
    },
    step,
    newlyCleared,
    rewardCardId: reward?.cardId ?? null,
  };
}

export function rewardCardRole(_newlyCleared: number): string {
  return "";
}

export function rewardGiftLine(
  _faction: Faction,
  _newlyCleared: number,
  rewardCardId: string | null,
  _wowHint?: string,
): string {
  if (rewardCardId) {
    try {
      return getCard(rewardCardId).name;
    } catch {
      return "новую карту";
    }
  }
  return "";
}

/** Заголовок экрана победы тропы. */
export function trailVictoryTitle(
  newlyCleared: number,
  rewardCardId: string | null,
): string {
  if (rewardCardId) return "Поздравляем!";
  if (newlyCleared >= SCHOOL_TRAIL_STEPS) return "Тропа пройдена!";
  return `Флаг ${newlyCleared}/${SCHOOL_TRAIL_STEPS}`;
}

export function trailVictoryLead(
  _faction: Faction,
  newlyCleared: number,
  rewardCardId: string | null,
  _wowHint?: string,
): string {
  if (rewardCardId) {
    try {
      return `Вы получаете карту «${getCard(rewardCardId).name}»`;
    } catch {
      return "Вы получаете карту";
    }
  }
  if (newlyCleared >= SCHOOL_TRAIL_STEPS) {
    return "Школа пройдена. Можно выбрать оракула.";
  }
  return "";
}

function cardNamesLine(ids: (string | null | undefined)[]): string {
  const names: string[] = [];
  for (const id of ids) {
    if (!id) continue;
    try {
      names.push(getCard(id).name);
    } catch {
      names.push(id);
    }
  }
  return names.join(" · ");
}

/** Имена юнитов на столе (+ рука/могила) для превью флажка. */
export function schoolTrailFoeLine(step: SchoolTrailStep): string {
  const board = cardNamesLine(step.slots);
  const parts: string[] = [];
  parts.push(board || "пусто");
  const hand = cardNamesLine(step.hand ?? []);
  if (hand) parts.push(`рука: ${hand}`);
  const grave = cardNamesLine(step.graveyard ?? []);
  if (grave) parts.push(`могила: ${grave}`);
  const lv = step.upgradeLevel ?? 1;
  parts.push(`ур.${lv}`);
  return parts.join(" · ");
}

/** Колода боя тропы: 3 нейтрала + уже добытый черновик этой школы. */
export function schoolTrailBattleDeck(
  owned: OwnedState,
  faction: Faction,
): string[] {
  const base: string[] = [...NEUTRAL_STARTER_IDS];
  const draft = schoolTrailDraft(owned, faction);
  const out = [...base];
  for (const id of draft) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Герой-оболочка врага той же школы (арт/мана), без скиллов. */
export function schoolTrailEnemyHeroId(faction: Faction): string {
  return `hero_${faction}`;
}

/**
 * Подготовка боя тропы: стол, могила, пустая рука/колода врага.
 * Фракция игрока = школа тропы (чтобы «Доп. мана» качала именно её).
 * Карты черновика этой школы — сразу в руку (играть здесь, не «потом»).
 */
export function prepareSchoolTrailBattle(
  state: BattleState,
  faction: Faction,
  stepIndex: number,
  draftCards: string[] = [],
): BattleState {
  const step = schoolTrailStep(faction, stepIndex);
  if (!step) return state;
  const next = structuredClone(state) as BattleState;
  const up: CardUpgradeLevel = step.upgradeLevel ?? 1;

  next.enemy.name = step.foeName;
  // Рука тропы = ровно то, что в скрипте. Без добора и без рецикла могилы.
  const foeHand = (step.hand ?? []).map(String).filter(Boolean);
  const foeDeck = (step.deck ?? []).map(String).filter(Boolean);
  next.enemy.hand = [...foeHand];
  next.enemy.deck = [...foeDeck];
  // Как в основной игре: своя школа каждый ход, чужие через ход.
  next.enemy.oracleSkillLoadout = [];
  next.enemy.equalManaGrowth = false;
  // Иначе убитые снова тасуются в колоду/руку — бесконечный запас.
  next.enemy.preserveGraveyard = true;
  next.enemy.oracleActiveUsedThisTurn = false;
  next.enemy.oracleSkillUsed = {};
  next.enemy.graveyard = [...(step.graveyard ?? [])];
  next.enemy.slots = [null, null, null, null, null];

  const hero = getHero(schoolTrailEnemyHeroId(faction));
  next.enemy.heroId = hero.id;
  next.enemy.faction = faction;
  // Стартовая мана оракула тропы — обычный пул своей школы (createBattle), не режем.
  // Ранние флаги — коротко. С витрины HP выше: гонка «только в оракула» наказывается.
  const hpByStep = [16, 20, 24, 26, 30] as const;
  const cap = hpByStep[Math.max(0, Math.min(4, stepIndex))] ?? 22;
  next.enemy.maxHp = Math.min(next.enemy.maxHp, cap);
  next.enemy.hp = next.enemy.maxHp;
  // 2-й флаг давит доской; с витрины — control, чтобы маги колдовали.
  next.aiPersona =
    stepIndex <= 0 ? "midrange" : stepIndex === 1 ? "aggro" : "control";

  step.slots.forEach((cardId, i) => {
    if (!cardId || i < 0 || i > 4) return;
    next.enemy.slots[i] = seedBoardCreature(cardId, up, next.rules);
  });
  // Энт на сиде иначе остаётся с каталожными HP без формулы корней.
  finalizeSeededBoardRoots(next.enemy, next.log);

  // Прокачка и для карт из руки/колоды (не только стол).
  const ups: Record<string, number> = { ...(next.enemyCardUpgrades ?? {}) };
  for (const id of [
    ...step.slots,
    ...(step.hand ?? []),
    ...(step.deck ?? []),
  ]) {
    if (id) ups[id] = Math.max(ups[id] ?? 1, up);
  }
  next.enemyCardUpgrades = ups;

  // До выбора оракула своей школы нет: старт 1 во всех пяти, рост через ход.
  // faction тропы оставляем только чтобы «Доп. мана» / черновик школы качали её.
  next.you.faction = faction;
  next.you.mana = {
    water: 1,
    hell: 1,
    death: 1,
    life: 1,
    nature: 1,
  };
  next.you.equalManaGrowth = true;
  // Без school_mana — иначе «своя» тропа качала бы ману каждый ход.
  next.you.oracleSkillLoadout = ["__seeker_equal_mana__"];
  next.you.oracleSkillUsed = {};
  next.you.oracleActiveUsedThisTurn = false;

  // Черновик тропы — в руку (остальное в колоде).
  const extras = draftCards.map(String).filter(Boolean);
  if (extras.length) {
    const pool = [...next.you.hand, ...next.you.deck];
    const kept: string[] = [];
    const pulled: string[] = [];
    for (const id of pool) {
      if (extras.includes(id) && !pulled.includes(id)) pulled.push(id);
      else kept.push(id);
    }
    for (const id of extras) {
      if (!pulled.includes(id)) pulled.push(id);
    }
    next.you.hand = [];
    next.you.deck = kept;
    for (const id of pulled) {
      if (next.you.hand.length < MAX_HAND_SIZE) next.you.hand.push(id);
      else next.you.deck.unshift(id);
    }
    // Добить руку с колоды, если вытащили мало
    while (next.you.hand.length < Math.min(MAX_HAND_SIZE, 3) && next.you.deck.length) {
      next.you.hand.push(next.you.deck.shift()!);
    }
  }

  next.aiLevel = Math.max(next.aiLevel ?? 1, 8);
  next.log = [
    step.lesson,
    extras.length
      ? `В руке карты тропы «${schoolTrailTitle(faction)}» — пользуйся ими в этом бою.`
      : `${step.foeName} выходит на тропу…`,
    ...next.log,
  ].slice(0, 10);

  return next;
}

export function schoolTrailEnemyUpgrades(
  faction: Faction,
  stepIndex: number,
): Record<string, number> {
  const step = schoolTrailStep(faction, stepIndex);
  if (!step) return {};
  const up = step.upgradeLevel ?? 1;
  const out: Record<string, number> = {};
  for (const id of [
    ...step.slots,
    ...(step.hand ?? []),
    ...(step.deck ?? []),
  ]) {
    if (id) out[id] = up;
  }
  return out;
}
