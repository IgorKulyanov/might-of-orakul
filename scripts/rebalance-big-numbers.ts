/**
 * Крупный масштаб под вечные раны:
 * HP ~×5 от исходных, ATK ×2–4, танки 25–30, магия сильнее.
 * База: КАРТЫ до первого ребаланса (fbccd19).
 * Запуск: npx tsx scripts/rebalance-big-numbers.ts
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const raw = execSync('git show fbccd19:"КАРТЫ.json"', {
  encoding: "utf8",
  maxBuffer: 5 * 1024 * 1024,
});
const data = JSON.parse(raw) as {
  cards: Array<Record<string, unknown>>;
};

/** Ручной тюнинг ключевых карт (от исходных ролей). */
const OVERRIDE: Record<string, { attack: number; health: number }> = {
  // —— Жизнь ——
  spearman: { attack: 5, health: 12 },
  crossbowman: { attack: 3, health: 14 },
  tank: { attack: 3, health: 28 },
  berserk: { attack: 8, health: 22 },
  mage: { attack: 4, health: 16 },
  angel: { attack: 5, health: 20 },
  paladin: { attack: 4, health: 26 },
  valkyrie: { attack: 7, health: 22 },
  colossus: { attack: 5, health: 70 },

  // —— Смерть ——
  skeleton: { attack: 3, health: 8 },
  vampire: { attack: 6, health: 16 },
  zombie: { attack: 3, health: 15 },
  werewolf: { attack: 9, health: 12 },
  gravedigger: { attack: 4, health: 16 },
  hell_rider: { attack: 10, health: 14 },
  banshee: { attack: 5, health: 16 },
  necro_mage: { attack: 5, health: 18 },
  lich: { attack: 7, health: 22 },
  bone_rex: { attack: 10, health: 28 },

  // —— Вода ——
  aquilite: { attack: 3, health: 8 },
  water_spirit: { attack: 5, health: 12 },
  water_golem: { attack: 4, health: 28 },
  triton: { attack: 5, health: 16 },
  water_elemental: { attack: 7, health: 22 },
  mermaid: { attack: 5, health: 20 },
  clawfiend: { attack: 9, health: 30 },
  kraken: { attack: 4, health: 55 },

  // —— Ад ——
  fire_lizard: { attack: 5, health: 12 },
  fire_gopnik: { attack: 8, health: 8 },
  motardo: { attack: 5, health: 12 },
  imp: { attack: 5, health: 12 },
  cerberus: { attack: 3, health: 26 },
  fire_golem: { attack: 7, health: 22 },
  succubus: { attack: 7, health: 18 },
  balthazar: { attack: 7, health: 22 },
  fire_dragon: { attack: 12, health: 24 },
  inferno: { attack: 12, health: 32 },

  // —— Природа ——
  spider: { attack: 3, health: 10 },
  elf: { attack: 5, health: 12 },
  hornet_warrior: { attack: 3, health: 8 },
  leprechaun: { attack: 2, health: 12 },
  arch_orc: { attack: 8, health: 16 },
  ent: { attack: 4, health: 32 },
  basilisk: { attack: 7, health: 22 },
  hornet_queen: { attack: 5, health: 26 },
  leshy: { attack: 7, health: 36 },
  veles: { attack: 7, health: 28 },
  black_dragon: { attack: 12, health: 32 },

  // —— Нейтралы ——
  recruit: { attack: 5, health: 8 },
  archer: { attack: 3, health: 10 },
  mercenary: { attack: 8, health: 16 },
  wanderer: { attack: 7, health: 16 },
  scorpicora: { attack: 5, health: 16 },
  rogue: { attack: 6, health: 12 },
  arbiter: { attack: 7, health: 32 },
};

/** Исходные amount магий → новый масштаб (~×3–4, AoE чуть скромнее). */
const SPELL_AMOUNT: Record<string, Record<string, number>> = {
  strike: { damage_hero: 6 },
  undead_strike: { damage_undead: 10 },
  swamp: { damage_all_enemies: 6 },
  fire_aura: { damage_all_enemies: 6 },
  wave: { damage_all_enemies: 6 },
  arrow_cloud: { damage_all_enemies: 6 },
  ice_trap: { damage_unit: 10 },
  mind_grab: { damage_hero: 8 },
  life_root: { heal_hero: 12 },
  mass_poison: { poison_all: 2 },
  poison: { poison: 2 },
  undead_bonus: {}, // attack/health ниже отдельно
};

const SPELL_TEXT: Record<string, string> = {
  strike: "6 урона вражескому герою.",
  undead_strike: "10 урона всей нежити на поле.",
  swamp: "6 урона всем вражеским существам.",
  fire_aura: "6 урона всем вражеским существам.",
  wave: "6 урона всем вражеским существам.",
  arrow_cloud: "6 урона всем вражеским существам.",
  ice_trap: "10 урона одному вражескому существу.",
  mind_grab: "8 урона вражескому герою + добор 1 карты.",
  life_root: "Лечит героя на 12.",
  poison: "Отравляет вражеское существо: −2 HP в начале его хода, затем сильнее (+1).",
  mass_poison:
    "Отравляет всех вражеских существ: −2 HP в начале хода, затем сильнее (+1).",
};

function roleScale(atk: number, hp: number): { attack: number; health: number } {
  // Атака: стеклянные ударники ×3.5–4, середняки ×2.5–3, thrash ×2–2.5
  let attackMul = 2.8;
  if (atk >= 4 && hp <= 3) attackMul = 3.5;
  else if (atk >= 3 && hp <= 2) attackMul = 3.2;
  else if (atk <= 1 && hp >= 4) attackMul = 2.2; // танки
  else if (atk <= 1) attackMul = 2.5;
  else if (hp >= 6) attackMul = 2.4;

  let hpMul = 5;
  if (hp >= 10) hpMul = 5; // уже толстые
  if (atk <= 1 && hp >= 4) hpMul = 6.5; // линия танков → ~25–30

  let attack = Math.max(1, Math.round(atk * attackMul));
  let health = Math.max(5, Math.round(hp * hpMul));
  if (hp <= 1) health = Math.max(8, Math.round(5 * hpMul * 0.35));
  return { attack, health };
}

let creatures = 0;
let spells = 0;

for (const c of data.cards) {
  if (c.kind === "creature" && typeof c.id === "string") {
    const oldAtk = Number(c.attack);
    const oldHp = Number(c.health);
    if (!Number.isFinite(oldAtk) || !Number.isFinite(oldHp)) continue;
    const next = OVERRIDE[c.id] ?? roleScale(oldAtk, oldHp);
    console.log(`${c.id}: ${oldAtk}/${oldHp} → ${next.attack}/${next.health}`);
    c.attack = next.attack;
    c.health = next.health;
    creatures += 1;

    if (c.id === "vampire") {
      c.text =
        "Укус: восстанавливает 5 HP за удар, не выше своего максимума (16).";
      c.ability = "vampire_grow";
    }
    if (c.id === "recruit") {
      c.text = "Нейтрал: жизнь+ад. Дешёвый ударник 5/8.";
    }
    if (c.id === "tank") {
      c.text = "Много жизней, мало атаки. Держит линию (~28 HP).";
    }
    if (c.id === "lich") {
      c.text = String(c.text).includes("вытяг")
        ? c.text
        : "Вытягивает жизнь: после удара лечит себя на 5 HP (не выше максимума).";
    }
  }

  if (c.kind === "spell" && typeof c.id === "string") {
    const effects = c.spellEffects as Array<Record<string, unknown>> | undefined;
    if (!effects) continue;

    if (c.id === "undead_bonus") {
      for (const e of effects) {
        if (e.type === "buff_permanent") {
          e.attack = 3;
          e.health = 3;
          spells += 1;
        }
      }
      c.text = "Вся нежить на поле навсегда +3/+3.";
    }

    if (c.id === "to_attack") {
      for (const e of effects) {
        if (e.type === "buff_army_attack" && e.amount != null) {
          e.amount = 3;
          spells += 1;
        }
      }
      c.text = "Все ваши существа +3 атаки до конца хода.";
    }

    const map = SPELL_AMOUNT[c.id];
    if (map) {
      for (const e of effects) {
        const t = String(e.type);
        if (map[t] != null && e.amount !== map[t]) {
          console.log(`${c.id}.${t}: ${e.amount} → ${map[t]}`);
          e.amount = map[t];
          spells += 1;
        }
      }
    }

    if (SPELL_TEXT[c.id]) c.text = SPELL_TEXT[c.id];
  }
}

const out = resolve("КАРТЫ.json");
writeFileSync(out, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`\nCreatures: ${creatures}, spell tweaks: ${spells}`);
