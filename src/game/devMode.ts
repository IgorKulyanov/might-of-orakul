import {
  CARDS,
  DECK_SIZE,
  maxCopiesForCard,
} from "./cards";
import { botDeckForLevel } from "./botDeck";
import { BASE_HEROES, EPIC_HEROES, getHero } from "./heroes";
import { starterDeckForFaction } from "./starterDecks";
import type { Faction } from "./types";

const FLAG = "orakul_dev_tools";

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

export type DevDeckMode = "starter" | "school" | "bot_pool";

/**
 * Колода только для тестового боя — не пишется в owned.
 * starter — 4 карты; school — до 25 из школы+нейтрал ×лимит; bot_pool — как у бота уровня.
 */
export function buildDevDeck(
  faction: Faction,
  mode: DevDeckMode,
  level = 10,
): string[] {
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

export type DevBattleSetup = {
  yourHeroId: string;
  enemyHeroId: string;
  yourLevel: number;
  enemyLevel: number;
  yourDeckMode: DevDeckMode;
  enemyDeckMode: DevDeckMode;
};

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
    yourDeck: buildDevDeck(you.faction, setup.yourDeckMode, setup.yourLevel),
    enemyDeck: buildDevDeck(foe.faction, setup.enemyDeckMode, setup.enemyLevel),
  };
}
