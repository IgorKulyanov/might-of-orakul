const STORAGE_KEY = "orakul_battle_tutorial_v3";
const LEGACY_KEYS = [
  "orakul_battle_tutorial_v1",
  "orakul_battle_tutorial_v2",
];

/** Fallback, если localStorage не пишет. */
const seenMemory = { value: false };

export type BattleTutorialTip = {
  id: string;
  /** data-tut="…" на элементе боя */
  target: string;
  title: string;
  body: string;
};

/**
 * Первый бой на тропе школы — один раз на аккаунт, любая школа.
 * Дальше не повторяем.
 */
export const BATTLE_TUTORIAL_TIPS: BattleTutorialTip[] = [
  {
    id: "you-oracle",
    target: "you-oracle",
    title: "Твой оракул",
    body: "Внизу — ты. Если жизни оракула упадут до нуля — бой проигран. Береги его.",
  },
  {
    id: "enemy-oracle",
    target: "enemy-oracle",
    title: "Враг",
    body: "Сверху — оракул соперника. Цель боя: снять его жизни раньше, чем он снимет твои.",
  },
  {
    id: "you-mana",
    target: "you-mana",
    title: "Мана",
    body: "Цветные фишки — мана школ. Каждый твой ход своя школа подрастает. Карта тратит ману того цвета, что на ней.",
  },
  {
    id: "board",
    target: "your-board",
    title: "Поле",
    body: "Сюда ставишь существ — в пустую клетку. До пяти карт в ряд. Они бьют и прикрывают оракула.",
  },
  {
    id: "hand",
    target: "hand",
    title: "Рука",
    body: "Карты внизу — рука. Кликни карту, потом клетку (существо) или цель (заклинание).",
  },
  {
    id: "card-stats",
    target: "hand-card",
    title: "Числа на карте",
    body: "Слева сверху — цена в мане. У существа справа: атака / жизни. Значок ⚔ или 🏹 — тип удара.",
  },
  {
    id: "card-read",
    target: "card-flip",
    title: "Открыть карту",
    body: "Жми кнопку ↻ на карте — откроется большое окно со всеми свойствами и текстом способности. Так изучай незнакомые карты.",
  },
  {
    id: "melee",
    target: "your-board",
    title: "Ближний бой",
    body: "⚔ Ближники бьют напротив — в ту же колонку. Если перед ними стоит враг, бьют его; если ряд пуст — могут достать до оракула.",
  },
  {
    id: "ranged",
    target: "your-board",
    title: "Дальний бой",
    body: "🏹 Лучники бьют на любую клетку поля или прямо в оракула. Их не останавливает «стена» в своей колонке — цель выбираешь сам.",
  },
  {
    id: "attack",
    target: "your-board",
    title: "Как ударить",
    body: "Существо с зелёной рамкой готово: кликни его, потом красную цель. Один удар за ход с карты (если способность не говорит иначе).",
  },
  {
    id: "end-turn",
    target: "end-turn",
    title: "Конец хода",
    body: "Сходил — жми «Конец хода». Ход врагу, потом снова тебе: мана подрастёт и добор карты.",
  },
];

export function hasSeenBattleTutorial(): boolean {
  if (seenMemory.value) return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return seenMemory.value;
  }
}

export function markBattleTutorialSeen(): void {
  seenMemory.value = true;
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* private mode — память сессии уже отмечена */
  }
}

/** Для QA / сброса / админ «в тропы школ». */
export function resetBattleTutorial(): void {
  seenMemory.value = false;
  try {
    localStorage.removeItem(STORAGE_KEY);
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

/** Сброс и обучалки меню (магазин / колода / алмазы). */
export function resetAllTutorials(): void {
  resetBattleTutorial();
  try {
    localStorage.removeItem("orakul_hub_tutorial_v1");
  } catch {
    /* ignore */
  }
}
