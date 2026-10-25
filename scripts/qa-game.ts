import "./polyfill-localstorage";
import { runQa } from "../src/game/qa";

const args = process.argv.slice(2);
let fuzzGames = 12;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--fuzz" && args[i + 1]) {
    const n = Number(args[i + 1]);
    if (Number.isFinite(n) && n >= 0) fuzzGames = Math.floor(n);
  }
}

const report = runQa({ fuzzGames });
console.log(report.text);
process.exit(report.failed ? 1 : 0);
