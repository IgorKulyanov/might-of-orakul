const STORAGE_KEY = "orakul_battle_tutorial_v2";

export type BattleTutorialTip = {
  id: string;
  /** data-tut="…" на элементе боя */
  target: string;
  title: string;
  body: string;
};

/** Первый бой: по одному шагу, со стрелкой на нужное место. */
export const BATTLE_TUTORIAL_TIPS: BattleTutorialTip[] = [
  {
    id: "you-oracle",
    target: "you-oracle",
    title: "Твой оракул",
    body: "Это ты. Картинка героя внизу — твой оракул. Если его жизни закончатся — ты проиграл.",
  },
  {
    id: "you-hp",
    target: "you-hp",
    title: "Жизни",
    body: "Вот твои HP. Враг бьёт сюда, когда линия свободна или лучником. Следи за числом.",
  },
  {
    id: "you-mana",
    target: "you-mana",
    title: "Мана",
    body: "Цветные фишки — мана школ. Своя школа растёт каждый твой ход. Карта тратит ману того цвета, что на ней написан.",
  },
  {
    id: "enemy-oracle",
    target: "enemy-oracle",
    title: "Враг",
    body: "Сверху — оракул соперника. Цель дуэли: снять его HP до нуля.",
  },
  {
    id: "board",
    target: "your-board",
    title: "Поле",
    body: "Сюда ставишь существ — в пустую клетку со знаком +. До пяти карт в ряд.",
  },
  {
    id: "hand",
    target: "hand",
    title: "Рука",
    body: "Карты внизу — твоя рука. Кликни карту, потом клетку (существо) или цель (заклинание).",
  },
  {
    id: "card-cost",
    target: "hand-card",
    title: "Цена карты",
    body: "Слева сверху на карте — сколько маны нужно. Числа у существа — атака / жизни.",
  },
  {
    id: "attack",
    target: "your-board",
    title: "Удар",
    body: "Существо с зелёной рамкой готово бить: кликни его, потом красную цель. Лучник бьёт любую клетку или героя.",
  },
  {
    id: "end-turn",
    target: "end-turn",
    title: "Конец хода",
    body: "Сходил — жми «Конец хода». Ход перейдёт врагу, потом снова тебе: мана подрастёт и добор карты.",
  },
];

export function hasSeenBattleTutorial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markBattleTutorialSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* private mode */
  }
}

/** Для QA / сброса. */
export function resetBattleTutorial(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("orakul_battle_tutorial_v1");
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
