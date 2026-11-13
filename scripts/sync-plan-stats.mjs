/**
 * Переписывает «атака N, жизни M» в cardUpgradePlan.ts под реальные статы лица
 * (КАРТЫ.json + bonusAtk/bonusHp для L1–L3).
 */
import { readFileSync, writeFileSync } from "fs";
import data from "../КАРТЫ.json" with { type: "json" };

const planPath = "./src/game/cardUpgradePlan.ts";
const upSrc = readFileSync("./src/game/cardUpgrades.ts", "utf8");
let planSrc = readFileSync(planPath, "utf8");

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

function syncText(text, atk, hp) {
  let out = text;
  if (/атака\s+\d+/.test(out)) out = out.replace(/атака\s+\d+/, `атака ${atk}`);
  if (/жизни\s+\d+/.test(out)) out = out.replace(/жизни\s+\d+/, `жизни ${hp}`);
  return out;
}

const defs = parseDefs(upSrc);
let changes = 0;

for (const c of data.cards) {
  if (c.kind !== "creature") continue;
  const d = defs[c.id] || { atk: [0, 0, 0], hp: [0, 0, 0] };
  const blockRe = new RegExp(
    `(  ${c.id}:\\s*\\{[\\s\\S]*?)(l1:\\s*")([^"]*)("(?:[\\s\\S]*?)l2:\\s*")([^"]*)("(?:[\\s\\S]*?)l3:\\s*")([^"]*)(")`,
  );
  const m = planSrc.match(blockRe);
  if (!m) continue;
  const faces = [1, 2, 3].map((lv) => ({
    atk: (c.attack ?? 0) + (d.atk[lv - 1] || 0),
    hp: (c.health ?? 0) + (d.hp[lv - 1] || 0),
  }));
  const n1 = syncText(m[3], faces[0].atk, faces[0].hp);
  const n2 = syncText(m[5], faces[1].atk, faces[1].hp);
  const n3 = syncText(m[7], faces[2].atk, faces[2].hp);
  if (n1 === m[3] && n2 === m[5] && n3 === m[7]) continue;
  const next = m[1] + m[2] + n1 + m[4] + n2 + m[6] + n3 + m[8];
  planSrc = planSrc.replace(m[0], next);
  changes++;
  console.log(
    c.id,
    `L1 ${m[3].match(/атака \d+, жизни \d+/)?.[0] ?? "?"} → атака ${faces[0].atk}, жизни ${faces[0].hp}`,
  );
}

writeFileSync(planPath, planSrc);
console.log("updated cards:", changes);
