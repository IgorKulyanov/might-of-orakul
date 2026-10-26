const STORAGE_KEY = "orakul_hub_tutorial_v1";

export type HubTutorialScreen =
  | "menu"
  | "collection"
  | "cabinet"
  | "dailies";

export type HubTutorialTip = {
  id: string;
  /** Экран, на который переключаемся перед подсветкой */
  screen: HubTutorialScreen;
  /** data-tut="…" */
  target: string;
  title: string;
  body: string;
  /** В магазине заранее открыть вкладку */
  collectionTab?: "cards" | "deck" | "currency";
  /** В кабинете открыть вкладку */
  cabinetTab?: "oracle" | "deck";
};

/** Обучение мета-игры: магазин, колода, алмазы, ежедневки. */
export const HUB_TUTORIAL_TIPS: HubTutorialTip[] = [
  {
    id: "wallet",
    screen: "menu",
    target: "hub-wallet",
    title: "Стартовый кошелёк",
    body: "Новичку даём 500🪙 и 25💎. Золото — основная валюта магазина. Алмазы дороже: ими тоже платят в магазине.",
  },
  {
    id: "shop-btn",
    screen: "menu",
    target: "hub-shop",
    title: "Магазин",
    body: "Здесь покупаешь новые карты. Без покупки в кейсе останутся только стартовые четыре карты.",
  },
  {
    id: "shop-buy",
    screen: "collection",
    target: "hub-shop-buy",
    collectionTab: "cards",
    title: "Покупка карты",
    body: "Жми кнопку с ценой (🪙 или 💎) — карта появится у тебя. Копии тоже платные, обычно до двух штук.",
  },
  {
    id: "shop-add",
    screen: "collection",
    target: "hub-shop-add",
    collectionTab: "cards",
    title: "В колоду",
    body: "Купленную карту добавь в колоду кнопкой «+ в колоду». В бой идут только карты из колоды, не весь кейс.",
  },
  {
    id: "shop-currency",
    screen: "collection",
    target: "hub-shop-packs",
    collectionTab: "currency",
    title: "Алмазы за деньги",
    body: "Вкладка «Валюта»: пакеты 💎 можно купить за реальные деньги. Алмазы также меняются на золото здесь же.",
  },
  {
    id: "cabinet-btn",
    screen: "menu",
    target: "hub-cabinet",
    title: "Личный кабинет",
    body: "Кабинет — твой оракул, кейс и колода. Сюда удобно перетаскивать карты между кейсом и колодой.",
  },
  {
    id: "deck-case",
    screen: "cabinet",
    target: "hub-deck-board",
    cabinetTab: "deck",
    title: "Кейс и колода",
    body: "Сверху — колода на бой. Ниже — кейс (запас). Добавляй и убирай копии, пока колода не станет удобной.",
  },
  {
    id: "dailies-btn",
    screen: "menu",
    target: "hub-dailies",
    title: "Ежедневные задания",
    body: "Каждый день — новые цели. За них дают золото, опыт и алмазы. Не забывай забирать награду.",
  },
  {
    id: "dailies-panel",
    screen: "dailies",
    target: "hub-dailies-panel",
    title: "Откуда алмазы",
    body: "💎: ежедневки, вехи тропы (10/15), арена и донат-пакеты в магазине. 🪙: магазин карт, обмен 💎→🪙, награды боёв.",
  },
];

export function hasSeenHubTutorial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markHubTutorialSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function resetHubTutorial(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
