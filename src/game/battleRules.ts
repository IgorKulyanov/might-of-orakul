import { getCard } from "./cards";
import type { BattleRules, BattleState, Faction, ManaCost } from "./types";

export type { BattleRules };

export type ArenaModId =
  | "glass_oracles"
  | "mana_drought"
  | "undead_surge"
  | "undead_wane"
  | "death_tax"
  | "early_blood"
  | "sudden_blood"
  | "late_blood"
  | "open_lanes"
  | "thin_hand"
  | "heavy_spells"
  | "fragile_board"
  | "iron_board"
  | "fat_oracles"
  | "razor_oracles"
  | "double_drought"
  | "life_bloom"
  | "ember_edge"
  | "tide_skin"
  | "wild_fang"
  | "spell_famine"
  | "swift_hands"
  | "flesh_tax"
  | "mid_blood";

export const ARENA_MOD_CATALOG: Record<
  ArenaModId,
  { title: string; text: string }
> = {
  glass_oracles: {
    title: "Стеклянные оракулы",
    text: "У обоих оракулов −30% максимальных HP.",
  },
  razor_oracles: {
    title: "Бритвенные оракулы",
    text: "У обоих оракулов −45% максимальных HP. Бои короче и злее.",
  },
  fat_oracles: {
    title: "Толстая кровь",
    text: "У обоих оракулов +25% максимальных HP.",
  },
  mana_drought: {
    title: "Засуха маны",
    text: "В старте у обоих −1 маны своей школы. Дальше рост как обычно.",
  },
  double_drought: {
    title: "Сушь",
    text: "В старте у обоих −2 маны своей школы.",
  },
  undead_surge: {
    title: "Прилив нежити",
    text: "Существа смерти призывются с +1/+1.",
  },
  undead_wane: {
    title: "Увядание костей",
    text: "Существа смерти призывются с −1/−1 (атака не ниже 0, HP не ниже 1).",
  },
  death_tax: {
    title: "Пошлина могил",
    text: "Существа школы смерти дороже на +1 маны смерти.",
  },
  life_bloom: {
    title: "Цветение жизни",
    text: "Существа жизни призывются с +1 HP.",
  },
  ember_edge: {
    title: "Уголь клинка",
    text: "Существа ада призывются с +1 атаки.",
  },
  tide_skin: {
    title: "Соляная броня",
    text: "Существа воды призывются с +1 HP.",
  },
  wild_fang: {
    title: "Дикий клык",
    text: "Существа природы призывются с +1 атаки.",
  },
  early_blood: {
    title: "Раннее буйство",
    text: "Буйство крови с 12-го хода вместо 20-го.",
  },
  sudden_blood: {
    title: "Внезапная бойня",
    text: "Буйство крови с 8-го хода. Темп бешеная.",
  },
  mid_blood: {
    title: "Кровавый полдень",
    text: "Буйство крови с 15-го хода — ни рано, ни поздно.",
  },
  late_blood: {
    title: "Долгая осада",
    text: "Буйство крови только с 28-го хода.",
  },
  open_lanes: {
    title: "Тонкая рука",
    text: "В старте оба возвращают 2 карты из руки в колоду.",
  },
  thin_hand: {
    title: "Лёгкий сброс",
    text: "В старте оба возвращают 1 карту из руки в колоду.",
  },
  swift_hands: {
    title: "Быстрые пальцы",
    text: "В старте оба добирают по 1 карте из колоды.",
  },
  heavy_spells: {
    title: "Тяжёлые заклинания",
    text: "Заклинания дороже на +1 маны школы карты (нейтральные — школы оракула). «Доп. мана» и «Камни» без надбавки.",
  },
  spell_famine: {
    title: "Голод заклинаний",
    text: "Как «Тяжёлые заклинания», плюс существа тоже +1 маны своей школы (нейтрал — школа оракула).",
  },
  flesh_tax: {
    title: "Пошлина плоти",
    text: "Существа дороже на +1 маны своей школы (нейтрал — школа оракула). Заклинания без надбавки.",
  },
  fragile_board: {
    title: "Хрупкое поле",
    text: "Существа призывются с −1 HP (минимум 1).",
  },
  iron_board: {
    title: "Железный строй",
    text: "Существа призывются с +1 HP.",
  },
};

/** Пары, которые не должны попадать в один дневной забег. */
export const ARENA_MOD_CONFLICTS: ReadonlyArray<readonly [ArenaModId, ArenaModId]> = [
  ["glass_oracles", "razor_oracles"],
  ["glass_oracles", "fat_oracles"],
  ["razor_oracles", "fat_oracles"],
  ["mana_drought", "double_drought"],
  ["early_blood", "sudden_blood"],
  ["early_blood", "late_blood"],
  ["early_blood", "mid_blood"],
  ["sudden_blood", "late_blood"],
  ["sudden_blood", "mid_blood"],
  ["mid_blood", "late_blood"],
  ["open_lanes", "thin_hand"],
  ["open_lanes", "swift_hands"],
  ["thin_hand", "swift_hands"],
  ["heavy_spells", "spell_famine"],
  ["flesh_tax", "spell_famine"],
  ["fragile_board", "iron_board"],
  ["undead_wane", "undead_surge"],
  ["life_bloom", "ember_edge"],
  ["life_bloom", "tide_skin"],
  ["life_bloom", "wild_fang"],
  ["ember_edge", "tide_skin"],
  ["ember_edge", "wild_fang"],
  ["tide_skin", "wild_fang"],
];

/** Полный список id (включая редкие/устаревшие для старых сейвов). */
export const ALL_ARENA_MOD_IDS = Object.keys(
  ARENA_MOD_CATALOG,
) as ArenaModId[];

/**
 * Пул дневной ротации арены.
 * «Прилив нежити» сознательно выкинут — усиливал и так сильную смерть.
 */
export const ARENA_DAY_POOL: ArenaModId[] = [
  "glass_oracles",
  "razor_oracles",
  "fat_oracles",
  "mana_drought",
  "double_drought",
  "undead_wane",
  "death_tax",
  "life_bloom",
  "ember_edge",
  "tide_skin",
  "wild_fang",
  "early_blood",
  "sudden_blood",
  "mid_blood",
  "late_blood",
  "open_lanes",
  "thin_hand",
  "swift_hands",
  "heavy_spells",
  "spell_famine",
  "flesh_tax",
  "fragile_board",
  "iron_board",
];

function conflictsWith(picked: ArenaModId[], candidate: ArenaModId): boolean {
  for (const id of picked) {
    for (const [a, b] of ARENA_MOD_CONFLICTS) {
      if ((a === id && b === candidate) || (b === id && a === candidate)) {
        return true;
      }
    }
  }
  return false;
}

/** Выбрать N неконфликтующих модов из перемешанного пула. */
export function pickArenaDayMods(
  shuffledPool: ArenaModId[],
  count: number,
): ArenaModId[] {
  const out: ArenaModId[] = [];
  for (const id of shuffledPool) {
    if (out.length >= count) break;
    if (conflictsWith(out, id)) continue;
    out.push(id);
  }
  // Если конфликты вырезали слишком много — добираем без фильтра.
  if (out.length < count) {
    for (const id of shuffledPool) {
      if (out.length >= count) break;
      if (out.includes(id)) continue;
      out.push(id);
    }
  }
  return out.slice(0, count);
}

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

function drawStart(p: BattleState["you"], n: number): void {
  let left = n;
  while (left > 0 && p.deck.length > 0) {
    const id = p.deck.pop()!;
    p.hand.push(id);
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
    if (!meta) continue;
    notes.push(`${meta.title}: ${meta.text}`);
    switch (id) {
      case "glass_oracles":
        for (const side of [next.you, next.enemy] as const) {
          const cut = Math.max(1, Math.floor(side.maxHp * 0.3));
          side.maxHp = Math.max(1, side.maxHp - cut);
          side.hp = Math.min(side.hp, side.maxHp);
        }
        break;
      case "razor_oracles":
        for (const side of [next.you, next.enemy] as const) {
          const cut = Math.max(1, Math.floor(side.maxHp * 0.45));
          side.maxHp = Math.max(1, side.maxHp - cut);
          side.hp = Math.min(side.hp, side.maxHp);
        }
        break;
      case "fat_oracles":
        for (const side of [next.you, next.enemy] as const) {
          const add = Math.max(1, Math.floor(side.maxHp * 0.25));
          side.maxHp += add;
          side.hp += add;
        }
        break;
      case "mana_drought":
        for (const side of [next.you, next.enemy] as const) {
          const f = side.faction;
          side.mana[f] = Math.max(0, (side.mana[f] ?? 0) - 1);
        }
        break;
      case "double_drought":
        for (const side of [next.you, next.enemy] as const) {
          const f = side.faction;
          side.mana[f] = Math.max(0, (side.mana[f] ?? 0) - 2);
        }
        break;
      case "undead_surge":
        rules.undeadSurge = true;
        break;
      case "undead_wane":
        rules.undeadWane = true;
        break;
      case "death_tax":
        rules.deathTax = true;
        break;
      case "life_bloom":
        rules.lifeBloom = true;
        break;
      case "ember_edge":
        rules.emberEdge = true;
        break;
      case "tide_skin":
        rules.tideSkin = true;
        break;
      case "wild_fang":
        rules.wildFang = true;
        break;
      case "early_blood":
        rules.bloodFrenzyAfter = 12;
        break;
      case "sudden_blood":
        rules.bloodFrenzyAfter = 8;
        break;
      case "late_blood":
        rules.bloodFrenzyAfter = 28;
        break;
      case "mid_blood":
        rules.bloodFrenzyAfter = 15;
        break;
      case "open_lanes":
        trimStartHand(next.you, 2);
        trimStartHand(next.enemy, 2);
        break;
      case "thin_hand":
        trimStartHand(next.you, 1);
        trimStartHand(next.enemy, 1);
        break;
      case "swift_hands":
        drawStart(next.you, 1);
        drawStart(next.enemy, 1);
        break;
      case "heavy_spells":
        rules.heavySpells = true;
        break;
      case "spell_famine":
        rules.heavySpells = true;
        rules.creatureTax = true;
        break;
      case "flesh_tax":
        rules.creatureTax = true;
        break;
      case "fragile_board":
        rules.fragileBoard = true;
        break;
      case "iron_board":
        rules.ironBoard = true;
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
