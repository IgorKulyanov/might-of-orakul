import "./polyfill-localstorage";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CARDS } from "../src/game/cards";
import { BASE_HEROES, EPIC_HEROES, orakulArtUrl } from "../src/game/heroes";
import { DIAMOND_PACK_MAP } from "../src/game/shop";
import { runQa, type QaFail } from "../src/game/qa";

const args = process.argv.slice(2);
let fuzzGames = 12;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--fuzz" && args[i + 1]) {
    const n = Number(args[i + 1]);
    if (Number.isFinite(n) && n >= 0) fuzzGames = Math.floor(n);
  }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Файлы арта + сверка витрины с server/paymentsYookassa.js (только Node). */
function retailAssetsCheck(): { fails: QaFail[]; ok: string[] } {
  const fails: QaFail[] = [];
  const ok: string[] = [];
  let n = 0;
  const check = (name: string, fn: () => string | null) => {
    try {
      const bad = fn();
      if (bad) fails.push({ area: "арт", detail: `${name}: ${bad}` });
      else n += 1;
    } catch (e) {
      fails.push({ area: "арт", detail: `${name}: ${String(e)}` });
    }
  };

  const cardsDir = path.join(ROOT, "public", "cards");
  check("все art карт на диске", () => {
    if (!fs.existsSync(cardsDir)) return `нет ${cardsDir}`;
    const missing: string[] = [];
    for (const c of CARDS) {
      const art = c.art ?? `${c.id}.png`;
      const full = path.join(cardsDir, ...art.split("/"));
      if (!fs.existsSync(full)) missing.push(`${c.id}→${art}`);
    }
    if (missing.length) return `нет файлов: ${missing.slice(0, 8).join("; ")}`;
    return null;
  });

  check("портреты оракулов на диске", () => {
    const miss: string[] = [];
    for (const h of [...BASE_HEROES, ...EPIC_HEROES]) {
      const url = orakulArtUrl(h).split("?")[0]!;
      const rel = decodeURIComponent(url.replace(/^\/cards\//, ""));
      const full = path.join(cardsDir, ...rel.split("/"));
      if (!fs.existsSync(full)) miss.push(`${h.id}→${rel}`);
    }
    if (miss.length) return miss.join("; ");
    return null;
  });

  check("витрина клиент ↔ server/paymentsYookassa.js", () => {
    const serverPath = path.join(ROOT, "server", "paymentsYookassa.js");
    const src = fs.readFileSync(serverPath, "utf8");
    for (const p of Object.values(DIAMOND_PACK_MAP)) {
      const re = new RegExp(
        `${p.id}[\\s\\S]{0,160}diamonds:\\s*${p.diamonds}`,
      );
      if (!re.test(src)) return `сервер diamonds ≠ клиент для ${p.id}`;
      const rub = p.priceLabel.replace(/[^\d]/g, "");
      if (rub && !src.includes(`amountRub: ${rub}`)) {
        return `сервер amountRub ≠ ${p.priceLabel} (${p.id})`;
      }
    }
    return null;
  });

  if (!fails.length) ok.push(`арт/витрина: ${n} файловых проверок`);
  else ok.push(`арт/витрина: ${n} ок, есть FAIL`);
  return { fails, ok };
}

const report = runQa({ fuzzGames });
const assets = retailAssetsCheck();
const fails = [...report.fails, ...assets.fails];
const ok = [...report.ok, ...assets.ok];

const lines: string[] = [];
lines.push("=== QA MIGHT OF ORAKUL ===");
for (const line of ok) lines.push(`  OK  ${line}`);
if (fails.length) {
  lines.push("");
  lines.push(`  СЛОМАНО (${fails.length}):`);
  for (const f of fails) lines.push(`  FAIL [${f.area}] ${f.detail}`);
} else {
  lines.push("");
  lines.push("  Всё зелёное. Можно играть.");
}
console.log(lines.join("\n"));
process.exit(fails.length ? 1 : 0);
