import {
  getCard,
  manaCostTotal,
  SCHOOL_LABEL,
} from "./cards";
import type { Faction, School } from "./types";

export type DeckCurveBucket = {
  cost: number;
  label: string;
  count: number;
};

export type DeckSchoolShare = {
  school: School;
  label: string;
  count: number;
  pct: number;
};

export type DeckAdvice = {
  level: "ok" | "warn" | "bad";
  text: string;
};

export type DeckAnalysis = {
  size: number;
  creatures: number;
  spells: number;
  avgCost: number;
  ownSchoolPct: number;
  curve: DeckCurveBucket[];
  schools: DeckSchoolShare[];
  advice: DeckAdvice[];
};

const CURVE_LABELS = ["0", "1", "2", "3", "4", "5+"] as const;

function costBucket(total: number): number {
  if (total <= 0) return 0;
  if (total >= 5) return 5;
  return total;
}

/** Разбор колоды: кривая маны, школы, советы. */
export function analyzeDeck(
  cardIds: string[],
  homeFaction: Faction | null | undefined,
): DeckAnalysis {
  const ids = cardIds.filter(Boolean);
  const curveCounts = [0, 0, 0, 0, 0, 0];
  const schoolCounts: Partial<Record<School, number>> = {};
  let creatures = 0;
  let spells = 0;
  let costSum = 0;

  for (const id of ids) {
    let card;
    try {
      card = getCard(id);
    } catch {
      continue;
    }
    if (card.kind === "creature") creatures += 1;
    else spells += 1;
    const cost = card.cost ?? manaCostTotal(card.manaCost ?? {});
    costSum += cost;
    curveCounts[costBucket(cost)] += 1;
    schoolCounts[card.school] = (schoolCounts[card.school] ?? 0) + 1;
  }

  const size = ids.length;
  const avgCost = size ? Math.round((costSum / size) * 10) / 10 : 0;
  const ownCount = homeFaction
    ? (schoolCounts[homeFaction] ?? 0) + (schoolCounts.neutral ?? 0)
    : size;
  const ownSchoolPct = size ? Math.round((ownCount / size) * 100) : 0;

  const curve: DeckCurveBucket[] = CURVE_LABELS.map((label, i) => ({
    cost: i,
    label,
    count: curveCounts[i] ?? 0,
  }));

  const schools: DeckSchoolShare[] = (
    Object.keys(schoolCounts) as School[]
  )
    .map((school) => {
      const count = schoolCounts[school] ?? 0;
      return {
        school,
        label: SCHOOL_LABEL[school],
        count,
        pct: size ? Math.round((count / size) * 100) : 0,
      };
    })
    .sort((a, b) => b.count - a.count);

  const advice: DeckAdvice[] = [];
  if (size < 8) {
    advice.push({
      level: "bad",
      text: `Мало карт (${size}). Добавь хотя бы 8–12 — иначе добор повторяет одно и то же.`,
    });
  } else if (size < 15) {
    advice.push({
      level: "warn",
      text: `В колоде ${size} карт — можно, но 15–25 даёт стабильнее добор.`,
    });
  }

  if (homeFaction && size > 0) {
    const pureOwn = schoolCounts[homeFaction] ?? 0;
    const purePct = Math.round((pureOwn / size) * 100);
    if (purePct < 35) {
      advice.push({
        level: "bad",
        text: `Мало карт школы «${SCHOOL_LABEL[homeFaction]}» (${purePct}%). Своя мана растёт каждый ход — без своих карт рука часто «неиграбельна».`,
      });
    } else if (purePct < 50) {
      advice.push({
        level: "warn",
        text: `Своей школы «${SCHOOL_LABEL[homeFaction]}» всего ${purePct}%. Лучше держать половину и больше.`,
      });
    } else {
      advice.push({
        level: "ok",
        text: `Своя школа в порядке (${purePct}% «${SCHOOL_LABEL[homeFaction]}»).`,
      });
    }
  }

  if (size > 0 && avgCost >= 3.2) {
    advice.push({
      level: "warn",
      text: `Средняя цена ${avgCost} — колода тяжёлая. Добавь дешёвые карты (0–2 маны), иначе первые ходы пустые.`,
    });
  } else if (size > 0 && avgCost <= 1.2 && size >= 8) {
    advice.push({
      level: "warn",
      text: `Средняя цена ${avgCost} — очень лёгкая колода. Поздно может не хватить силы.`,
    });
  }

  if (size >= 8 && creatures > 0 && spells / size > 0.55) {
    advice.push({
      level: "warn",
      text: `Много заклинаний (${spells} из ${size}). Без существ на поле сложно держать линию.`,
    });
  }

  if (!advice.some((a) => a.level !== "ok") && size >= 15) {
    advice.push({
      level: "ok",
      text: "Кривая и состав выглядят играбельно. Можно в бой.",
    });
  }

  return {
    size,
    creatures,
    spells,
    avgCost,
    ownSchoolPct,
    curve,
    schools,
    advice,
  };
}
