import { getCard } from "./cards";
import type { BattleRules, BattleState, Faction, ManaCost } from "./types";

export type { BattleRules };

export type ArenaModId =
  | "glass_oracles"
  | "mana_drought"
  | "undead_surge"
  | "early_blood"
  | "open_lanes"
  | "heavy_spells"
  | "fragile_board";

export const ARENA_MOD_CATALOG: Record<
  ArenaModId,
  { title: string; text: string }
> = {
  glass_oracles: {
    title: "Стеклянные оракулы",
    text: "У обоих оракулов −30% максимальных HP.",
  },
  mana_drought: {
    title: "Засуха маны",
    text: "Только в старте боя: у обоих оракулов −1 маны своей школы. Цены карт не меняет. Дальше мана растёт как обычно.",
  },
  undead_surge: {
    title: "Прилив нежити",
    text: "Существа школы смерти призывются с +1/+1.",
  },
  early_blood: {
    title: "Раннее буйство",
    text: "Буйство крови с 12-го хода вместо 20-го.",
  },
  open_lanes: {
    title: "Тонкая рука",
    text: "В старте оба возвращают 2 карты из руки в колоду.",
  },
  heavy_spells: {
    title: "Тяжёлые заклинания",
    text: "Каждое заклинание дороже на +1 маны школы карты (нейтральные — школы твоего оракула). Исключение: «Доп. мана» и «Камни маны» без надбавки. Существа без изменений.",
  },
  fragile_board: {
    title: "Хрупкое поле",
    text: "Существа призывются с −1 HP (минимум 1).",
  },
};

export const ALL_ARENA_MOD_IDS = Object.keys(
  ARENA_MOD_CATALOG,
) as ArenaModId[];

/**
 * +1 маны школы карты к стоимости заклинания.
 * Нейтральные — школа кастующего оракула (не «жизнь» по умолчанию).
 */
export function heavySpellCost(
  cardId: string,
  base: ManaCost,
  casterFaction?: Faction,
): ManaCost {
  const school = getCard(cardId).school;
  const f: Faction =
    school === "neutral"
      ? (casterFaction ?? "life")
      : (school as Faction);
  return { ...base, [f]: (base[f] ?? 0) + 1 };
}

function trimStartHand(p: BattleState["you"], n: number): void {
  let left = n;
  while (left > 0 && p.hand.length > 0) {
    const id = p.hand.pop()!;
    p.deck.push(id);
    left -= 1;
  }
}

/** Применить список модификаторов арены к свежему бою. */
export function applyArenaRules(
  state: BattleState,
  mods: ArenaModId[],
): BattleState {
  const next = structuredClone(state) as BattleState;
  const rules: BattleRules = { ...(next.rules ?? {}) };
  const notes: string[] = [];

  for (const id of mods) {
    const meta = ARENA_MOD_CATALOG[id];
    notes.push(`${meta.title}: ${meta.text}`);
    switch (id) {
      case "glass_oracles":
        for (const side of [next.you, next.enemy] as const) {
          const cut = Math.max(1, Math.floor(side.maxHp * 0.3));
          side.maxHp = Math.max(1, side.maxHp - cut);
          side.hp = Math.min(side.hp, side.maxHp);
        }
        break;
      case "mana_drought":
        for (const side of [next.you, next.enemy] as const) {
          const f = side.faction;
          side.mana[f] = Math.max(0, (side.mana[f] ?? 0) - 1);
        }
        break;
      case "undead_surge":
        rules.undeadSurge = true;
        break;
      case "early_blood":
        rules.bloodFrenzyAfter = 12;
        break;
      case "open_lanes":
        trimStartHand(next.you, 2);
        trimStartHand(next.enemy, 2);
        break;
      case "heavy_spells":
        rules.heavySpells = true;
        break;
      case "fragile_board":
        rules.fragileBoard = true;
        break;
      default:
        break;
    }
  }

  rules.arenaMods = [...mods];
  next.rules = rules;
  if (notes.length) {
    next.log = [`⚔️ Арена: ${notes.join(" · ")}`, ...next.log].slice(0, 12);
  }
  return next;
}
