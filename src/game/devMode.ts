import {
  CARDS,
  DECK_SIZE,
  MIN_DECK_SIZE,
  maxCopiesForCard,
} from "./cards";
import { botDeckForLevel } from "./botDeck";
import { BASE_HEROES, EPIC_HEROES, getHero } from "./heroes";
import { starterDeckForFaction } from "./starterDecks";
import type { Faction } from "./types";

const FLAG = "orakul_dev_tools";
const CUSTOM_YOU_KEY = "orakul_dev_custom_you";
const CUSTOM_ENEMY_KEY = "orakul_dev_custom_enemy";

/**
 * Режим разработчика (песочница, сброс арены).
 * Обычным игрокам не светится: только секрет (7 кликов по названию)
 * или VITE_DEV_TOOLS=1 в .env.local у тебя.
 * В прод-сборке без флага кнопки не видны.
 */
export function isDevToolsEnabled(): boolean {
  try {
    if (import.meta.env.VITE_DEV_TOOLS === "1") return true;
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

export function setDevToolsEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(FLAG, "1");
    else localStorage.removeItem(FLAG);
  } catch {
    /* private mode */
  }
}

export type DevDeckMode = "starter" | "school" | "bot_pool" | "custom";

/**
 * Колода только для тестового боя — не пишется в owned.
 * starter — 4 карты; school — до DECK_SIZE из школы+нейтрал ×лимит;
 * bot_pool — как у бота уровня; custom — любой набор из каталога.
 */
export function buildDevDeck(
  faction: Faction,
  mode: DevDeckMode,
  level = 10,
  customDeck?: string[],
): string[] {
  if (mode === "custom") return normalizeDevCustomDeck(customDeck);
  if (mode === "starter") return starterDeckForFaction(faction);
  if (mode === "bot_pool") return botDeckForLevel(level, faction);

  const pool = CARDS.filter(
    (c) =>
      (c.kind === "creature" || c.kind === "spell") &&
      (c.school === faction || c.school === "neutral"),
  ).sort((a, b) => (a.unitLevel ?? 1) - (b.unitLevel ?? 1));

  const out: string[] = [];
  const counts: Record<string, number> = {};
  for (const c of pool) {
    const max = maxCopiesForCard(c.id);
    while ((counts[c.id] ?? 0) < max && out.length < DECK_SIZE) {
      out.push(c.id);
      counts[c.id] = (counts[c.id] ?? 0) + 1;
    }
    if (out.length >= DECK_SIZE) break;
  }
  return out;
}

/** Песочница: любые id из каталога, до DECK_SIZE, дубликаты ок. */
export function normalizeDevCustomDeck(ids?: string[]): string[] {
  const known = new Set(CARDS.map((c) => c.id));
  const out: string[] = [];
  for (const id of ids ?? []) {
    if (!id || !known.has(id)) continue;
    out.push(id);
    if (out.length >= DECK_SIZE) break;
  }
  if (out.length >= MIN_DECK_SIZE) return out;
  // Не валим бой пустой колодой — подставим стартовую, если сборка кривая.
  return out.length > 0 ? out : starterDeckForFaction("death");
}

/** Список из storage без подстановки starter при короткой колоде. */
export function loadDevCustomDeckRaw(side: "you" | "enemy"): string[] {
  try {
    const raw = localStorage.getItem(
      side === "you" ? CUSTOM_YOU_KEY : CUSTOM_ENEMY_KEY,
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const known = new Set(CARDS.map((c) => c.id));
    const out: string[] = [];
    for (const id of parsed) {
      if (typeof id !== "string" || !known.has(id)) continue;
      out.push(id);
      if (out.length >= DECK_SIZE) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function saveDevCustomDeck(side: "you" | "enemy", deck: string[]): void {
  try {
    const known = new Set(CARDS.map((c) => c.id));
    const clean = deck.filter((id) => known.has(id)).slice(0, DECK_SIZE);
    localStorage.setItem(
      side === "you" ? CUSTOM_YOU_KEY : CUSTOM_ENEMY_KEY,
      JSON.stringify(clean),
    );
  } catch {
    /* private mode */
  }
}

export type DevBattleSetup = {
  yourHeroId: string;
  enemyHeroId: string;
  yourLevel: number;
  enemyLevel: number;
  yourDeckMode: DevDeckMode;
  enemyDeckMode: DevDeckMode;
  yourCustomDeck?: string[];
  enemyCustomDeck?: string[];
  /** Прокачка юнитов в тесте: cardId → 1…3 */
  yourCardUpgrades?: Record<string, number>;
  enemyCardUpgrades?: Record<string, number>;
};

const CUSTOM_UP_YOU = "orakul_dev_up_you";
const CUSTOM_UP_ENEMY = "orakul_dev_up_enemy";

export function loadDevCardUpgrades(
  side: "you" | "enemy",
): Record<string, number> {
  try {
    const raw = localStorage.getItem(
      side === "you" ? CUSTOM_UP_YOU : CUSTOM_UP_ENEMY,
    );
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, number> = {};
    for (const [id, lv] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Math.floor(Number(lv) || 1);
      out[id] = n >= 3 ? 3 : n <= 1 ? 1 : 2;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveDevCardUpgrades(
  side: "you" | "enemy",
  ups: Record<string, number>,
): void {
  try {
    localStorage.setItem(
      side === "you" ? CUSTOM_UP_YOU : CUSTOM_UP_ENEMY,
      JSON.stringify(ups),
    );
  } catch {
    /* private mode */
  }
}

export function allTestHeroes() {
  return [...BASE_HEROES, ...EPIC_HEROES];
}

export function resolveDevBattle(setup: DevBattleSetup) {
  const you = getHero(setup.yourHeroId);
  const foe = getHero(setup.enemyHeroId);
  return {
    yourHeroId: setup.yourHeroId,
    enemyHeroId: setup.enemyHeroId,
    yourLevel: setup.yourLevel,
    enemyLevel: setup.enemyLevel,
    yourDeck: buildDevDeck(
      you.faction,
      setup.yourDeckMode,
      setup.yourLevel,
      setup.yourCustomDeck,
    ),
    enemyDeck: buildDevDeck(
      foe.faction,
      setup.enemyDeckMode,
      setup.enemyLevel,
      setup.enemyCustomDeck,
    ),
    yourCardUpgrades: { ...(setup.yourCardUpgrades ?? {}) },
    enemyCardUpgrades: { ...(setup.enemyCardUpgrades ?? {}) },
  };
}
