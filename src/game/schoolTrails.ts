/**
 * Тропы вкуса школ — онбординг до выбора homeFaction.
 * Враг: фиксированный стол без колоды. Основной takeAiStep бота не меняем.
 * Награды школ изолированы: в мир уходит только одна мини-колода + оракул.
 */
import type { BattleState, Faction, OwnedState } from "./types";
import type { CardUpgradeLevel } from "./cardUpgrades";
import { getCard } from "./cards";
import { getHero } from "./heroes";
import { seedBoardCreature } from "./engine";

/** Выбор школы — после полной тропы (5 побед на одной школе). */
export const SCHOOL_TRAIL_WINS_TO_PICK = 5;
export const SCHOOL_TRAIL_STEPS = 5;

/** Награды тропы: бой 1 — карта, бой 3 — магия, бой 5 — юнит школы. */
export type SchoolTrailReward = {
  afterCleared: number;
  cardId: string;
};

export const SCHOOL_TRAIL_REWARDS: Record<Faction, SchoolTrailReward[]> = {
  death: [
    { afterCleared: 1, cardId: "skeleton" },
    { afterCleared: 3, cardId: "poison" },
    { afterCleared: 5, cardId: "zombie" },
  ],
  nature: [
    { afterCleared: 1, cardId: "spider" },
    { afterCleared: 3, cardId: "slow_foe" },
    { afterCleared: 5, cardId: "elf" },
  ],
  water: [
    { afterCleared: 1, cardId: "aquilite" },
    { afterCleared: 3, cardId: "ice_trap" },
    { afterCleared: 5, cardId: "water_spirit" },
  ],
  life: [
    { afterCleared: 1, cardId: "crossbowman" },
    { afterCleared: 3, cardId: "life_root" },
    { afterCleared: 5, cardId: "tank" },
  ],
  hell: [
    { afterCleared: 1, cardId: "fire_lizard" },
    { afterCleared: 3, cardId: "strike" },
    { afterCleared: 5, cardId: "fire_gopnik" },
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
  water: [
    { x: 42, y: 90 },
    { x: 52, y: 86 },
    { x: 58, y: 80 },
    { x: 46, y: 78 },
    { x: 50, y: 72 },
  ],
  nature: [
    { x: 16, y: 66 },
    { x: 22, y: 58 },
    { x: 28, y: 52 },
    { x: 18, y: 46 },
    { x: 24, y: 38 },
  ],
  life: [
    { x: 28, y: 32 },
    { x: 20, y: 26 },
    { x: 26, y: 20 },
    { x: 18, y: 16 },
    { x: 22, y: 11 },
  ],
  death: [
    { x: 70, y: 32 },
    { x: 78, y: 26 },
    { x: 84, y: 20 },
    { x: 74, y: 15 },
    { x: 80, y: 10 },
  ],
  hell: [
    { x: 74, y: 68 },
    { x: 82, y: 60 },
    { x: 76, y: 52 },
    { x: 84, y: 46 },
    { x: 78, y: 40 },
  ],
};

/** Финальный флажок «Сердце мира» — выбор оракула после любой полной тропы. */
export const SCHOOL_TRAIL_FINALE_POS = { x: 50, y: 48 };

export type SchoolTrailStep = {
  /** Юниты на столе врага (слоты слева направо, null = пусто). */
  slots: (string | null)[];
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

export const SCHOOL_TRAIL_SCRIPTS: Record<Faction, SchoolTrailStep[]> = {
  death: [
    {
      slots: ["zombie", "zombie", null, null, null],
      foeName: "Гниль окраины",
      lesson: "Ход, призыв, мана. Жирные зомби бьются по очереди.",
    },
    {
      slots: ["skeleton", "skeleton", null, null, null],
      foeName: "Костяной дозор",
      lesson: "Два скелета вместе опаснее — выбирай цель.",
    },
    {
      slots: [null, "necro_mage", null, null, null],
      foeName: "Некромант-искатель",
      lesson: "Некромант клепает скелетов с поля.",
      wowHint: "Некромант зовёт костяных слуг. Такие карты бывают в лавке Смерти.",
      upgradeLevel: U,
    },
    {
      slots: [null, "gravedigger", null, null, null],
      graveyard: ["skeleton", "zombie"],
      foeName: "Могильщик",
      lesson: "Могильщик выкапывает труп из могилы.",
      wowHint: "Могильщик поднимает мёртвых. Копи на него в лавке Смерти.",
      upgradeLevel: U,
    },
    {
      slots: ["zombie", "gravedigger", null, null, null],
      graveyard: ["skeleton"],
      foeName: "Страж могил",
      lesson: "Сначала саппорт или якорь — решай приоритет.",
      wowHint: "Смерть кормится могилой. Школа трупов ждёт тебя.",
      upgradeLevel: U,
    },
  ],
  nature: [
    {
      slots: ["spider", null, null, null, null],
      foeName: "Паук чащи",
      lesson: "Маленький, но яд кусает ход за ходом.",
    },
    {
      slots: ["spider", "spider", null, null, null],
      foeName: "Паучья пара",
      lesson: "Два яда — не тяни бой.",
    },
    {
      slots: [null, "hornet_queen", null, null, null],
      foeName: "Матка шершней",
      lesson: "Матка клепает воинов-шершней.",
      wowHint: "Матка сама собирает рой. Такие карты — в лавке Природы.",
      upgradeLevel: U,
    },
    {
      slots: ["hornet_warrior", "hornet_queen", null, null, null],
      foeName: "Рой опушки",
      lesson: "Опоздал на ход — рой вырос.",
      upgradeLevel: U,
    },
    {
      slots: ["hornet_warrior", "hornet_queen", "elf", null, null],
      foeName: "Страж рощи",
      lesson: "Рой + стрелок сзади. Стеной не закрыть всё.",
      wowHint: "Природа давит числом. Выбери её — и копи на матку.",
      upgradeLevel: U,
    },
  ],
  water: [
    {
      slots: ["aquilite", null, null, null, null],
      foeName: "Акулит прибоя",
      lesson: "Дешёвый кусака — быстрый трейд.",
    },
    {
      slots: ["aquilite", "aquilite", null, null, null],
      foeName: "Пара аквалитов",
      lesson: "Двое лезут — не дай обоим в лицо.",
    },
    {
      slots: [null, "triton", null, null, null],
      foeName: "Тритон пучины",
      lesson: "Тритон клепает аквалитов.",
      wowHint: "Тритон зовёт аквалитов из пучины. Цель для лавки Воды.",
      upgradeLevel: U,
    },
    {
      slots: ["water_spirit", "triton", null, null, null],
      foeName: "Прилив",
      lesson: "Клепальщик + стрелок сзади.",
      upgradeLevel: U,
    },
    {
      slots: [null, "triton", "mermaid", null, null],
      foeName: "Страж волн",
      lesson: "Призыв + сон — вода контролирует.",
      wowHint: "Вода клепает и выключает. Школа пучины зовёт.",
      upgradeLevel: U,
    },
  ],
  life: [
    {
      slots: ["tank", null, null, null, null],
      foeName: "Щит аванпоста",
      lesson: "Толстая стена — копи ману, не упирайся впустую.",
    },
    {
      slots: ["tank", "spearman", null, null, null],
      foeName: "Стена и копьё",
      lesson: "Танк держит, копейщик бьёт.",
    },
    {
      slots: ["tank", "mage", null, null, null],
      foeName: "Маг ордена",
      lesson: "Хил ломает честный трейд.",
      wowHint: "Маг лечит своих. Такие якоря — в лавке Жизни.",
      upgradeLevel: U,
    },
    {
      slots: ["tank", "paladin", null, null, null],
      foeName: "Паладин",
      lesson: "Щит — первая атака не убивает.",
      upgradeLevel: U,
    },
    {
      slots: ["tank", "angel", "crossbowman", null, null],
      foeName: "Страж света",
      lesson: "Стена, хил, стрелок — школа удержания.",
      wowHint: "Жизнь не сваливается. Орден ждёт твоего голоса.",
      upgradeLevel: U,
    },
  ],
  hell: [
    {
      slots: ["fire_lizard", null, null, null, null],
      foeName: "Ящер пепла",
      lesson: "Ад лезет сразу — быстрый трейд.",
    },
    {
      slots: ["fire_gopnik", null, null, null, null],
      foeName: "Гопник огня",
      lesson: "Стрелок жжёт — стенкой лицо не закрыть навсегда.",
    },
    {
      slots: [null, "succubus", null, null, null],
      foeName: "Суккуб",
      lesson: "Мужчины не бьют суккуба.",
      wowHint: "Суккуб ломает правила боя. Цель лавки Ада.",
      upgradeLevel: U,
    },
    {
      slots: ["imp", "succubus", null, null, null],
      foeName: "Искусительница",
      lesson: "Суккуб держит линию, имп жрёт оракула.",
      upgradeLevel: U,
    },
    {
      slots: ["fire_gopnik", "succubus", null, null, null],
      foeName: "Страж жара",
      lesson: "Запреты + огонь — подлая школа.",
      wowHint: "Ад жжёт и запрещает. Пламя зовёт.",
      upgradeLevel: U,
    },
  ],
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

export function finishedSchoolTrails(owned: OwnedState): Faction[] {
  return SCHOOL_TRAIL_FACTIONS.filter((f) => schoolTrailComplete(owned, f));
}

export function canPickSchool(owned: OwnedState): boolean {
  return finishedSchoolTrails(owned).length > 0;
}

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

export function rewardGiftLine(
  faction: Faction,
  newlyCleared: number,
  rewardCardId: string | null,
  wowHint?: string,
): string {
  if (rewardCardId) {
    try {
      const name = getCard(rewardCardId).name;
      return `Награда тропы: «${name}» (только для этой школы, пока не выберешь оракула)`;
    } catch {
      return `Награда тропы получена (${newlyCleared}/5)`;
    }
  }
  return (
    wowHint ??
    `Шаг ${newlyCleared}/5 на тропе «${schoolTrailTitle(faction)}»`
  );
}

/** Герой-оболочка врага той же школы (арт/мана), без скиллов. */
export function schoolTrailEnemyHeroId(faction: Faction): string {
  return `hero_${faction}`;
}

/**
 * Подготовка боя тропы: стол, могила, пустая рука/колода врага.
 * Без «жирной» стартовой маны и без скилла маны — только по 1 life/death/nature
 * (стоимость трёх нейтралов), без карты «доп. мана» в колоде.
 */
export function prepareSchoolTrailBattle(
  state: BattleState,
  faction: Faction,
  stepIndex: number,
): BattleState {
  const step = schoolTrailStep(faction, stepIndex);
  if (!step) return state;
  const next = structuredClone(state) as BattleState;
  const up: CardUpgradeLevel = step.upgradeLevel ?? 1;

  next.enemy.name = step.foeName;
  next.enemy.deck = [];
  next.enemy.hand = [];
  next.enemy.oracleSkillLoadout = [];
  next.enemy.oracleActiveUsedThisTurn = false;
  next.enemy.oracleSkillUsed = {};
  next.enemy.graveyard = [...(step.graveyard ?? [])];
  next.enemy.slots = [null, null, null, null, null];

  const hero = getHero(schoolTrailEnemyHeroId(faction));
  next.enemy.heroId = hero.id;
  next.enemy.faction = faction;
  // Чуть меньше HP — обучение не в стену оракула
  next.enemy.maxHp = Math.min(next.enemy.maxHp, 22);
  next.enemy.hp = next.enemy.maxHp;

  step.slots.forEach((cardId, i) => {
    if (!cardId || i < 0 || i > 4) return;
    next.enemy.slots[i] = seedBoardCreature(cardId, up, next.rules);
  });

  // Мана под трёх нейтралов (life/death/nature), без плюсов «на всё».
  for (const f of ["life", "death", "nature"] as Faction[]) {
    next.you.mana[f] = Math.max(next.you.mana[f] ?? 0, 1);
  }
  next.you.oracleSkillLoadout = [];
  next.you.oracleSkillUsed = {};
  next.you.oracleActiveUsedThisTurn = false;

  next.aiLevel = Math.max(next.aiLevel ?? 1, 8);
  next.log = [
    step.lesson,
    `${step.foeName} выходит на тропу…`,
    ...next.log,
  ].slice(0, 10);

  // Прокачка flex на враге
  const ups: Record<string, number> = { ...(next.enemyCardUpgrades ?? {}) };
  for (const id of step.slots) {
    if (id) ups[id] = Math.max(ups[id] ?? 1, up);
  }
  next.enemyCardUpgrades = ups;

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
  for (const id of step.slots) {
    if (id) out[id] = up;
  }
  return out;
}
