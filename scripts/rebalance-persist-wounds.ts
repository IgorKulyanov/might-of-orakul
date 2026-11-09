/**
 * Пересчёт ATK/HP под вечные раны + чуть сильнее боевые спеллы.
 * Запуск: npx tsx scripts/rebalance-persist-wounds.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve("КАРТЫ.json");
const raw = readFileSync(path, "utf8");
const data = JSON.parse(raw) as {
  cards: Array<Record<string, unknown>>;
};

/** Ручной тюнинг стартов и ключевых кривых (после формулы). */
const OVERRIDE: Record<string, { attack: number; health: number }> = {
  // Жизнь
  spearman: { attack: 3, health: 4 },
  crossbowman: { attack: 2, health: 5 },
  tank: { attack: 2, health: 8 },
  // Смерть
  skeleton: { attack: 2, health: 3 },
  zombie: { attack: 3, health: 5 },
  vampire: { attack: 2, health: 4 },
  // Вода
  aquilite: { attack: 2, health: 3 },
  water_spirit: { attack: 3, health: 4 },
  // Ад
  fire_lizard: { attack: 3, health: 4 },
  fire_gopnik: { attack: 4, health: 3 },
  motardo: { attack: 3, health: 4 },
  // Природа
  spider: { attack: 2, health: 4 },
  elf: { attack: 3, health: 4 },
  hornet_warrior: { attack: 2, health: 3 },
  // Нейтралы старт-уровня
  recruit: { attack: 3, health: 3 },
  archer: { attack: 2, health: 4 },
};

function scaleCreature(atk: number, hp: number): { attack: number; health: number } {
  // ATK ~×1.4, HP ~×1.9 — раны остаются, корпус толще
  let attack = Math.max(1, Math.round(atk * 1.4));
  let health = Math.max(2, Math.round(hp * 1.9));
  if (hp <= 1) health = Math.max(3, attack - 1); // бывшие «стеклянные» 1 HP
  if (atk === 1 && hp >= 4) {
    attack = 2;
    health = Math.max(health, Math.round(hp * 2));
  }
  return { attack, health };
}

const SPELL_AMOUNT: Record<string, Record<string, number>> = {
  strike: { damage_hero: 3 },
  undead_strike: { damage_undead: 4 },
  swamp: { damage_all_enemies: 3 },
  fire_aura: { damage_all_enemies: 3 },
  wave: { damage_all_enemies: 3 },
  arrow_cloud: { damage_all_enemies: 3 },
  ice_trap: { damage_unit: 4 },
  mind_grab: { damage_hero: 4 },
  life_root: { heal_hero: 5 },
};

let creaturesChanged = 0;
let spellsChanged = 0;

for (const c of data.cards) {
  if (c.kind === "creature" && typeof c.id === "string") {
    const oldAtk = Number(c.attack);
    const oldHp = Number(c.health);
    if (!Number.isFinite(oldAtk) || !Number.isFinite(oldHp)) continue;
    const next = OVERRIDE[c.id] ?? scaleCreature(oldAtk, oldHp);
    if (next.attack !== oldAtk || next.health !== oldHp) {
      c.attack = next.attack;
      c.health = next.health;
      creaturesChanged += 1;
      console.log(
        `${c.id}: ${oldAtk}/${oldHp} → ${next.attack}/${next.health}`,
      );
    }
  }

  if (c.kind === "spell" && typeof c.id === "string" && SPELL_AMOUNT[c.id]) {
    const map = SPELL_AMOUNT[c.id]!;
    const effects = c.spellEffects as Array<Record<string, unknown>> | undefined;
    if (!effects) continue;
    for (const e of effects) {
      const t = String(e.type);
      if (map[t] != null && e.amount !== map[t]) {
        console.log(`${c.id}.${t}: ${e.amount} → ${map[t]}`);
        e.amount = map[t];
        spellsChanged += 1;
      }
    }
    // Подправить текст числа, если простое
    if (typeof c.text === "string") {
      if (c.id === "strike") c.text = "3 урона герою врага.";
      if (c.id === "undead_strike") c.text = "4 урона всей нежити на поле.";
      if (c.id === "ice_trap") c.text = "4 урона одному вражескому существу.";
      if (c.id === "life_root") c.text = "Лечит героя на 5.";
      if (c.id === "swamp" || c.id === "fire_aura" || c.id === "wave" || c.id === "arrow_cloud") {
        c.text = String(c.text).replace("2 урона", "3 урона");
      }
      if (c.id === "mind_grab") {
        c.text = String(c.text).replace("3 урона", "4 урона");
      }
    }
  }
}

writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`\nCreatures updated: ${creaturesChanged}, spell amounts: ${spellsChanged}`);
