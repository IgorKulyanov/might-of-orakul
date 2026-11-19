/**
 * AI vs AI: стартовые колоды школ (ур.1), мат. оценка перевеса.
 * Запуск: npx tsx scripts/sim_starter_balance.ts
 */
import { STARTER_DECK_BY_FACTION } from "../src/game/starterDecks";
import { createBattle, endEnemyTurn, takeAiStep } from "../src/game/engine";
import { flipBattle } from "../src/game/pvpFlip";
import { getCard } from "../src/game/cards";
import { getHero } from "../src/game/heroes";
import type { BattleState, Faction } from "../src/game/types";

const FACTIONS: Faction[] = ["life", "death", "water", "hell", "nature"];
const HERO: Record<Faction, string> = {
  life: "hero_life",
  death: "hero_death",
  water: "hero_water",
  hell: "hero_hell",
  nature: "hero_nature",
};

const GAMES = Number(process.env.SIM_GAMES || 50);
const MAX_STEPS = 400;

function playAiSide(state: BattleState): BattleState {
  if (state.winner) return state;
  if (state.active === "enemy") {
    const step = takeAiStep(state);
    if (!step) return endEnemyTurn(state);
    return step.state;
  }
  // Ход «you» — крутим AI через flip
  let f = flipBattle(state);
  const step = takeAiStep(f);
  if (!step) f = endEnemyTurn(f);
  else f = step.state;
  return flipBattle(f);
}

function runGame(
  a: Faction,
  b: Faction,
  seedTurn: "you" | "enemy",
): "a" | "b" | "draw" {
  const deckA = STARTER_DECK_BY_FACTION[a];
  const deckB = STARTER_DECK_BY_FACTION[b];
  let s = createBattle(
    deckA,
    deckB,
    HERO[a],
    HERO[b],
    a,
    1,
    1,
    seedTurn,
    { youSkills: [], enemySkills: [] },
  );
  s.aiLevel = 5;
  let steps = 0;
  while (!s.winner && steps < MAX_STEPS) {
    s = playAiSide(s);
    steps += 1;
  }
  if (!s.winner) return "draw";
  return s.winner === "you" ? "a" : "b";
}

type Row = {
  a: Faction;
  b: Faction;
  aw: number;
  bw: number;
  draw: number;
  n: number;
};

function staticPower(faction: Faction) {
  const deck = STARTER_DECK_BY_FACTION[faction];
  let creatAtk = 0;
  let creatHp = 0;
  let creatMana = 0;
  let creatN = 0;
  let spellNote: string[] = [];
  let rush = 0;
  let ranged = 0;
  for (const id of deck) {
    const c = getCard(id);
    if (c.kind === "creature") {
      creatN += 1;
      creatAtk += c.attack ?? 0;
      creatHp += c.health ?? 0;
      const m = Object.values(c.manaCost ?? {}).reduce((s, n) => s + (n ?? 0), 0);
      creatMana += m;
      if (c.attackPattern === "ranged") ranged += 1;
      if (c.ability === "rush" || (c.abilities ?? []).includes("rush")) rush += 1;
    } else if (c.kind === "spell") {
      const m = Object.values(c.manaCost ?? {}).reduce((s, n) => s + (n ?? 0), 0);
      const eff = (c.spellEffects ?? [])
        .map((e) => `${e.type}${"amount" in e ? `:${(e as { amount?: number }).amount}` : ""}`)
        .join("+");
      spellNote.push(`${c.name}(${m}м:${eff || "—"})`);
    }
  }
  const hero = getHero(HERO[faction]);
  return {
    faction,
    heroHp: hero.maxHp,
    creat: `${creatAtk}/${creatHp} за ${creatMana}м`,
    eff: creatMana > 0 ? ((creatAtk + creatHp) / creatMana).toFixed(2) : "—",
    rush,
    ranged,
    spells: spellNote.join("; "),
  };
}

function main() {
  console.log(`=== Статика стартовых колод (ур.1 JSON) ===`);
  for (const f of FACTIONS) {
    const p = staticPower(f);
    console.log(
      `${f}: существа ${p.creat} (эфф ${(p as { eff: string }).eff}) rush=${p.rush} ranged=${p.ranged} | ${p.spells}`,
    );
  }

  console.log(`\n=== AI vs AI, ${GAMES} игр на пару, оба уровня 1 ===`);
  const rows: Row[] = [];
  for (const a of FACTIONS) {
    for (const b of FACTIONS) {
      if (a >= b) continue; // одна пара, без зеркал и дублей направления
      let aw = 0;
      let bw = 0;
      let draw = 0;
      for (let i = 0; i < GAMES; i++) {
        const first: "you" | "enemy" = i % 2 === 0 ? "you" : "enemy";
        const r = runGame(a, b, first);
        if (r === "a") aw += 1;
        else if (r === "b") bw += 1;
        else draw += 1;
      }
      rows.push({ a, b, aw, bw, draw, n: GAMES });
      const wr = ((aw / GAMES) * 100).toFixed(0);
      console.log(
        `${a} vs ${b}: ${a}=${aw} ${b}=${bw} ничья=${draw} → винрейт ${a} ${wr}%`,
      );
    }
  }

  // Рейтинг: среднее винрейта против остальных
  const score: Record<string, number[]> = {};
  for (const f of FACTIONS) score[f] = [];
  for (const r of rows) {
    score[r.a]!.push(r.aw / r.n);
    score[r.b]!.push(r.bw / r.n);
  }
  console.log(`\n=== Средний винрейт школы (чем выше — сильнее на старте) ===`);
  const ranked = FACTIONS.map((f) => {
    const arr = score[f]!;
    const avg = arr.reduce((s, x) => s + x, 0) / arr.length;
    return { f, avg };
  }).sort((x, y) => y.avg - x.avg);
  for (const r of ranked) {
    console.log(`${r.f}: ${(r.avg * 100).toFixed(1)}%`);
  }
}

main();
