import { readFileSync } from "fs";
import data from "../КАРТЫ.json" with { type: "json" };

const planSrc = readFileSync("./src/game/cardUpgradePlan.ts", "utf8");
const upSrc = readFileSync("./src/game/cardUpgrades.ts", "utf8");

/** Split CARD_UPGRADE_DEFS blocks by top-level id keys. */
function parseDefs(src) {
  const defs = {};
  const re = /^  ([a-z0-9_]+):\s*\{/gm;
  const idxs = [];
  let m;
  while ((m = re.exec(src))) idxs.push({ id: m[1], i: m.index });
  for (let i = 0; i < idxs.length; i++) {
    const start = idxs[i].i;
    const end = i + 1 < idxs.length ? idxs[i + 1].i : src.length;
    const block = src.slice(start, end);
    const ba = block.match(/bonusAtk:\s*\[([^\]]+)\]/);
    const bh = block.match(/bonusHp:\s*\[([^\]]+)\]/);
    defs[idxs[i].id] = {
      atk: ba ? ba[1].split(",").map((s) => +s.trim()) : [0, 0, 0],
      hp: bh ? bh[1].split(",").map((s) => +s.trim()) : [0, 0, 0],
    };
  }
  return defs;
}

function parsePlans(src) {
  const plans = {};
  const re = /^  ([a-z0-9_]+):\s*\{/gm;
  const idxs = [];
  let m;
  while ((m = re.exec(src))) idxs.push({ id: m[1], i: m.index });
  for (let i = 0; i < idxs.length; i++) {
    const start = idxs[i].i;
    const end = i + 1 < idxs.length ? idxs[i + 1].i : src.length;
    const block = src.slice(start, end);
    const l1 = block.match(/l1:\s*"([^"]*)"/);
    const l2 = block.match(/l2:\s*"([^"]*)"/);
    const l3 = block.match(/l3:\s*"([^"]*)"/);
    if (l1) plans[idxs[i].id] = { l1: l1[1], l2: l2?.[1] ?? "", l3: l3?.[1] ?? "" };
  }
  return plans;
}

const defs = parseDefs(upSrc);
const plans = parsePlans(planSrc);
const bad = [];
const noNums = [];

for (const c of data.cards) {
  if (c.kind !== "creature") continue;
  const d = defs[c.id] || { atk: [0, 0, 0], hp: [0, 0, 0] };
  const p = plans[c.id];
  if (!p) {
    bad.push({ id: c.id, name: c.name, issue: "no plan" });
    continue;
  }
  for (const lv of [1, 2, 3]) {
    const faceA = (c.attack ?? 0) + (d.atk[lv - 1] || 0);
    const faceH = (c.health ?? 0) + (d.hp[lv - 1] || 0);
    const text = p[`l${lv}`];
    const am = text.match(/атака\s+(\d+)/);
    const hm = text.match(/жизни\s+(\d+)/);
    if (!am || !hm) {
      if (lv === 1) noNums.push({ id: c.id, name: c.name, face: `${faceA}/${faceH}`, text });
      continue;
    }
    if (+am[1] !== faceA || +hm[1] !== faceH) {
      bad.push({
        id: c.id,
        name: c.name,
        lv,
        face: `${faceA}/${faceH}`,
        plan: `${am[1]}/${hm[1]}`,
        json: `${c.attack}/${c.health}`,
        bonAtk: d.atk,
        bonHp: d.hp,
        text,
      });
    }
  }
}

console.log("=== mismatches face vs plan ===");
console.log(bad.length);
for (const x of bad) console.log(JSON.stringify(x));
console.log("=== L1 plans without numeric atk/hp ===");
console.log(noNums.length);
for (const x of noNums) console.log(JSON.stringify(x));

// spotlight cards user mentioned
for (const id of ["lich", "orc", "zombie", "bone_rex", "balthazar", "valkyrie"]) {
  const c = data.cards.find((x) => x.id === id);
  const d = defs[id];
  const p = plans[id];
  if (!c) continue;
  console.log(
    "SPOT",
    id,
    "json",
    `${c.attack}/${c.health}`,
    "faceL1",
    `${c.attack + (d?.atk[0] || 0)}/${c.health + (d?.hp[0] || 0)}`,
    "planL1",
    p?.l1,
  );
}
