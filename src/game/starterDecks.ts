import type { Faction } from "./types";

/**
 * Старт новичка — ровно 4 карты, по 1 копии:
 * 2 существа I уровня своей школы + «Доп. мана» + 1 простой спелл.
 * Копии и остальное — только покупка. Колода крутится — учатся на малом.
 */

export const STARTER_DECK_SIZE = 4;

function build(parts: string[]): string[] {
  if (parts.length !== STARTER_DECK_SIZE) {
    throw new Error(
      `Стартовая колода должна быть ${STARTER_DECK_SIZE}, сейчас ${parts.length}`,
    );
  }
  return parts;
}

export const STARTER_DECK_BY_FACTION: Record<Faction, string[]> = {
  life: build(["crossbowman", "tank", "hero_mana", "life_root"]),
  death: build(["skeleton", "zombie", "hero_mana", "poison"]),
  water: build(["aquilite", "water_spirit", "hero_mana", "ice_trap"]),
  hell: build(["fire_lizard", "fire_gopnik", "hero_mana", "strike"]),
  nature: build(["spider", "elf", "hero_mana", "slow_foe"]),
};

/** Сколько копий каждой карты выдаём в коллекцию при старте (из колоды). */
export function starterCollectionFromDeck(deck: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of deck) {
    out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

export function starterDeckForFaction(faction: Faction): string[] {
  return [...STARTER_DECK_BY_FACTION[faction]];
}

export function starterCollectionForFaction(
  faction: Faction,
): Record<string, number> {
  return starterCollectionFromDeck(STARTER_DECK_BY_FACTION[faction]);
}

/** Id карт, которые когда-либо были бесплатным стартом (миграция). */
export function allStarterCardIds(): string[] {
  const set = new Set<string>();
  for (const deck of Object.values(STARTER_DECK_BY_FACTION)) {
    for (const id of deck) set.add(id);
  }
  // старые раздачи — чтобы миграция кейса не съела купленное зря
  for (const id of [
    "spearman",
    "crossbowman",
    "tank",
    "skeleton",
    "zombie",
    "water_spirit",
    "aquilite",
    "fire_lizard",
    "fire_gopnik",
    "elf",
    "spider",
    "hornet_warrior",
    "hero_mana",
    "life_root",
    "poison",
    "ice_trap",
    "strike",
    "slow_foe",
    "arch_orc",
    "vampire",
    "motardo",
    "extra_card",
    "break_spell",
    "undead_strike",
    "antidote",
    "clear_sky",
    "hell_cuffs",
    "undead_bonus",
    "berserk",
    "mage",
    "angel",
    "gravedigger",
    "werewolf",
    "triton",
    "water_golem",
    "mermaid",
    "imp",
    "cerberus",
    "leprechaun",
    "swamp",
    "shield",
  ]) {
    set.add(id);
  }
  return [...set];
}
