export type DiamondPack = {
  id: string;
  title: string;
  diamonds: number;
  priceLabel: string;
  note: string;
};

export type GoldExchange = {
  id: string;
  title: string;
  diamonds: number;
  gold: number;
};

/** Демо-пакеты «за реальные деньги» (без настоящей оплаты). */
export const DIAMOND_PACKS: DiamondPack[] = [
  {
    id: "dia_60",
    title: "Пакет искателя",
    diamonds: 60,
    priceLabel: "₽99",
    note: "Старт для магазина",
  },
  {
    id: "dia_180",
    title: "Пакет воина",
    diamonds: 180,
    priceLabel: "₽249",
    note: "+20 алмазов бонусом в цене",
  },
  {
    id: "dia_500",
    title: "Пакет оракула",
    diamonds: 500,
    priceLabel: "₽599",
    note: "Лучшее соотношение",
  },
  {
    id: "dia_2000",
    title: "Пакет эпика",
    diamonds: 2000,
    priceLabel: "₽1990",
    note: "Хватает на эпического оракула сразу",
  },
];

/**
 * Обмен кристалл→золото нарочно невыгодный (кристаллы дороже карт).
 * Пакеты ниже — быстрые пресеты; свободный обмен идёт по GOLD_PER_DIAMOND.
 */
export const GOLD_EXCHANGES: GoldExchange[] = [
  { id: "g_700", title: "Мешок монет", diamonds: 80, gold: 700 },
  { id: "g_2000", title: "Сундук казны", diamonds: 200, gold: 2000 },
  { id: "g_4800", title: "Сокровищница", diamonds: 420, gold: 4800 },
];

/** Сколько 🪙 даёт 1💎 при свободном обмене. */
export const GOLD_PER_DIAMOND = 9;

/** Быстрые шаги счётчика обмена. */
export const EXCHANGE_QUICK_AMOUNTS = [5, 10, 25, 50] as const;

export function goldForDiamonds(diamonds: number): number {
  return Math.max(0, Math.floor(diamonds)) * GOLD_PER_DIAMOND;
}

export const DIAMOND_PACK_MAP = Object.fromEntries(
  DIAMOND_PACKS.map((p) => [p.id, p]),
);

export const GOLD_EXCHANGE_MAP = Object.fromEntries(
  GOLD_EXCHANGES.map((e) => [e.id, e]),
);
