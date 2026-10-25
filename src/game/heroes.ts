import {
  oracleGiftCardText,
  orakulBattleHp,
  waterGiftStartMana,
} from "./oracleGifts";
import { orakulHpForLevel, startManaBonus } from "./progression";
import type { Faction, HeroDef } from "./types";

export const FACTIONS: Faction[] = [
  "water",
  "hell",
  "death",
  "life",
  "nature",
];

export const EPIC_HERO_GOLD = 20000;
export const EPIC_HERO_DIAMONDS = 2000;

const MANA_LINE =
  "Каждый ход +1 своей фракции.\nОстальные фракции +1 раз в 2 хода.";

/** Дары — только у эпиков (монетизация облика). Показ на регистрации как «позже». */
export const EPIC_GIFT_BLURB: Record<Faction, string> = {
  life: "Дар света: за победу +1🪙 за уровень.",
  hell: "Дар ада: за победу +2 XP за уровень.",
  death: "Дар косы: если за ход гибнет твой юнит смерти — +1 мана смерти.",
  water: "Дар пучины: +1 мана воды на старте, ещё +1 / 15 ур.",
  nature: "Дар рощи: +1 HP оракула за каждые 5 уровней.",
};

/** Коротко: что даст эпик этой фракции (+ старт-мана). */
export function epicPowerPreview(faction: Faction): string {
  return `${EPIC_GIFT_BLURB[faction]} Ещё +1 мана своей школы на старте боя.`;
}

/** Краткая легенда — без обещания даров у обычных. */
export const ORACLE_LORE: Record<Faction, string> = {
  life:
    "Светоносец — страж белой цитадели. Его крылья несут закон жизни: свет режет тьму, а поле боя держит строй под золотым знаменем.",
  hell:
    "Владыка ада куёт воинство в печах преисподней. Его взгляд жжёт броню, а каждый удар пахнет серой и раскалённым железом.",
  death:
    "Некроархонт правит костью и прахом. Его войско не знает усталости — павшие встают снова, пока коса не насытится.",
  water:
    "Повелитель глубин зовёт шторм и прилив. Под его рукой волны ломают строй, а глубина глотает тех, кто вышел на мель.",
  nature:
    "Хранитель рощи срастается с лесом. Корни держат землю, листва прячет стрелков — рощу не срубить одним ударом.",
};

/** Легенда эпика — сила + намёк на уникальный дар. */
export const ORACLE_EPIC_LORE: Record<Faction, string> = {
  life:
    "Эпический лик света: победа звенит монетой в казне — дар света оплачивает войну.",
  hell:
    "Эпический лик пекла: победа жрёт души и даёт опыт — дар ада кормит рост.",
  death:
    "Эпический лик косы: павшие своей школы питают ману — дар косы не оставляет смерть пустой.",
  water:
    "Эпический лик пучины: шторм даёт воду на старте — свои карты выходят раньше.",
  nature:
    "Эпический лик рощи: корни крепнут с уровнем — больше HP оракула в бою.",
};

export function oracleLore(hero: HeroDef): string {
  if (hero.tier === "epic") {
    return `${hero.name}. ${ORACLE_EPIC_LORE[hero.faction]}`;
  }
  return ORACLE_LORE[hero.faction];
}

function baseHeroText(): string {
  return MANA_LINE;
}

function epicHeroText(faction: Faction): string {
  return `${MANA_LINE}\n${EPIC_GIFT_BLURB[faction]}\nЭпик: ещё +1 мана своей школы на старте.`;
}

/** Базовые оракулы: maxHp в таблице — ориентир «капа»; в бою HP от уровня. */
export const BASE_HEROES: HeroDef[] = [
  {
    id: "hero_water",
    name: "Повелитель глубин",
    faction: "water",
    maxHp: 50,
    tier: "base",
    text: baseHeroText(),
  },
  {
    id: "hero_hell",
    name: "Владыка ада",
    faction: "hell",
    maxHp: 50,
    tier: "base",
    text: baseHeroText(),
  },
  {
    id: "hero_death",
    name: "Некроархонт",
    faction: "death",
    maxHp: 50,
    tier: "base",
    text: baseHeroText(),
  },
  {
    id: "hero_life",
    name: "Светоносец",
    faction: "life",
    maxHp: 50,
    tier: "base",
    text: baseHeroText(),
  },
  {
    id: "hero_nature",
    name: "Хранитель рощи",
    faction: "nature",
    maxHp: 50,
    tier: "base",
    text: baseHeroText(),
  },
];

/** Эпические облики тех же фракций — платные. Дары только здесь. */
export const EPIC_HEROES: HeroDef[] = [
  {
    id: "hero_water_epic",
    name: "Талассар Пучины",
    faction: "water",
    maxHp: 50,
    tier: "epic",
    priceGold: EPIC_HERO_GOLD,
    priceDiamonds: EPIC_HERO_DIAMONDS,
    text: `Эпический оракул пучины.\n${epicHeroText("water")}`,
  },
  {
    id: "hero_hell_epic",
    name: "Инфернарх",
    faction: "hell",
    maxHp: 50,
    tier: "epic",
    priceGold: EPIC_HERO_GOLD,
    priceDiamonds: EPIC_HERO_DIAMONDS,
    text: `Эпический оракул пекла.\n${epicHeroText("hell")}`,
  },
  {
    id: "hero_death_epic",
    name: "Эонный Жнец",
    faction: "death",
    maxHp: 50,
    tier: "epic",
    priceGold: EPIC_HERO_GOLD,
    priceDiamonds: EPIC_HERO_DIAMONDS,
    text: `Эпический оракул косы.\n${epicHeroText("death")}`,
  },
  {
    id: "hero_life_epic",
    name: "Архион Светоносный",
    faction: "life",
    maxHp: 50,
    tier: "epic",
    priceGold: EPIC_HERO_GOLD,
    priceDiamonds: EPIC_HERO_DIAMONDS,
    text: `Эпический оракул света.\n${epicHeroText("life")}`,
  },
  {
    id: "hero_nature_epic",
    name: "Иггдрас Перволес",
    faction: "nature",
    maxHp: 50,
    tier: "epic",
    priceGold: EPIC_HERO_GOLD,
    priceDiamonds: EPIC_HERO_DIAMONDS,
    text: `Эпический оракул рощи.\n${epicHeroText("nature")}`,
  },
];

export const HEROES: HeroDef[] = [...BASE_HEROES, ...EPIC_HEROES];

export const HERO_MAP = Object.fromEntries(HEROES.map((h) => [h.id, h]));

export function getHero(id: string): HeroDef {
  const h = HERO_MAP[id];
  if (!h) throw new Error(`Unknown hero: ${id}`);
  return h;
}

export function isEpicHero(id: string): boolean {
  return getHero(id).tier === "epic";
}

/** Оракул с HP и подсказкой по уровню аккаунта. */
export function getHeroForLevel(id: string, level: number): HeroDef {
  const base = getHero(id);
  const epic = base.tier === "epic";
  const hp = orakulBattleHp(base.faction, level, base.tier);
  const manaBonus =
    startManaBonus(level) +
    (epic ? 1 : 0) +
    (epic && base.faction === "water" ? waterGiftStartMana(level) : 0);
  const notes = [`HP оракула: ${hp} (ур. ${level}).`];
  if (epic) notes.push(oracleGiftCardText(base.faction, level));
  if (manaBonus > 0) {
    notes.push(`Старт: +${manaBonus} маны своей фракции.`);
  }
  return {
    ...base,
    maxHp: hp,
    text: `${MANA_LINE}\n${notes.join("\n")}`,
  };
}

export { startManaBonus, orakulHpForLevel, orakulBattleHp };

export function emptyMana(): Record<Faction, number> {
  return { water: 0, hell: 0, death: 0, life: 0, nature: 0 };
}

const ORAKUL_ART: Record<Faction, string> = {
  water: "оракул_вода.jpg",
  hell: "оракул_ад.jpg",
  death: "оракул_смерть.jpg",
  life: "оракул_жизнь.jpg",
  nature: "оракул_природа.jpg",
};

const ORAKUL_EPIC_ART: Record<Faction, string> = {
  water: "оракул_вода_эпик.jpg",
  hell: "оракул_ад_эпик.jpg",
  death: "оракул_смерть_эпик.jpg",
  life: "оракул_жизнь_эпик.jpg",
  nature: "оракул_природа_эпик.jpg",
};

/** Портрет оракула из public/cards/оракулы */
export function orakulArtUrl(hero: HeroDef | Faction): string {
  const faction = typeof hero === "string" ? hero : hero.faction;
  const epic = typeof hero !== "string" && hero.tier === "epic";
  const file = epic ? ORAKUL_EPIC_ART[faction] : ORAKUL_ART[faction];
  const url = `/cards/${["оракулы", file].map(encodeURIComponent).join("/")}`;
  return epic ? `${url}?v=13` : url;
}
