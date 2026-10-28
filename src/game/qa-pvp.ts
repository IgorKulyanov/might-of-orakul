/**
 * Полный PvP-бой с двух мест: сервер применяет ход, оба вида стола совпадают.
 * + стресс ×100 дуэлей и явная проверка «Доп. мана».
 */
import { getCard } from "./cards";
import { botDeckForLevel } from "./botDeck";
import {
  applyPvpAction,
  applySeatAction,
  pvpOpeningView,
  startPvpBattle,
  viewForSeat,
  type PvpAction,
  type PvpSeat,
} from "./pvpProtocol";
import type { BattleState, ManaPool } from "./types";
import type { QaFail } from "./qa";

const FULL_MANA: ManaPool = {
  water: 9,
  hell: 9,
  death: 9,
  life: 9,
  nature: 9,
};

function fillMana(s: BattleState): BattleState {
  const next = structuredClone(s) as BattleState;
  next.you.mana = { ...FULL_MANA };
  next.enemy.mana = { ...FULL_MANA };
  return next;
}

function slotId(unit: BattleState["you"]["slots"][number]): string {
  return unit ? `${unit.cardId}@${unit.health}` : "—";
}

function factionMana(s: BattleState, seat: PvpSeat): number {
  const v = viewForSeat(s, seat);
  return v.you.mana[v.you.faction] ?? 0;
}

function viewsOk(host: BattleState): string | null {
  const h = viewForSeat(host, "host");
  const g = viewForSeat(host, "guest");
  if (h.you.hp !== g.enemy.hp) {
    return `HP хоста: хост видит ${h.you.hp}, гость видит врага ${g.enemy.hp}`;
  }
  if (h.enemy.hp !== g.you.hp) {
    return `HP гостя: хост видит врага ${h.enemy.hp}, гость видит себя ${g.you.hp}`;
  }
  for (let i = 0; i < 5; i++) {
    const hostYou = slotId(h.you.slots[i]);
    const guestFoe = slotId(g.enemy.slots[i]);
    if (hostYou !== guestFoe) {
      return `слот хоста ${i}: хост=${hostYou} гость(враг)=${guestFoe}`;
    }
    const hostFoe = slotId(h.enemy.slots[i]);
    const guestYou = slotId(g.you.slots[i]);
    if (hostFoe !== guestYou) {
      return `слот гостя ${i}: хост(враг)=${hostFoe} гость=${guestYou}`;
    }
  }
  if (h.winner === "you" && g.winner !== "enemy") {
    return `winner flip: хост=${h.winner} гость=${g.winner}`;
  }
  if (h.winner === "enemy" && g.winner !== "you") {
    return `winner flip: хост=${h.winner} гость=${g.winner}`;
  }
  if (!h.winner && g.winner) return `гость видит победу, хост нет`;
  if (h.winner && !g.winner) return `хост видит победу, гость нет`;
  if (h.winner === "you" && h.enemy.hp > 0) return "победа хоста при живом госте";
  if (h.winner === "enemy" && h.you.hp > 0) return "победа гостя при живом хосте";
  return null;
}

function creatureHand(view: BattleState): number {
  return view.you.hand.findIndex((id) => getCard(id).kind === "creature");
}

function emptySlot(view: BattleState): number {
  return view.you.slots.findIndex((u) => !u);
}

function act(
  host: BattleState,
  seat: PvpSeat,
  action: PvpAction,
): { host: BattleState; error?: string } {
  const beforeView = viewForSeat(host, seat);
  const local = applyPvpAction(beforeView, action);
  let next: BattleState;
  try {
    next = applySeatAction(host, seat, action);
  } catch (e) {
    return { host, error: e instanceof Error ? e.message : String(e) };
  }
  const serverView = viewForSeat(next, seat);
  const pack = (v: BattleState) =>
    v.you.slots.map(slotId).join(",") +
    "|" +
    v.enemy.slots.map(slotId).join(",") +
    `|hp ${v.you.hp}/${v.enemy.hp}` +
    `|hand ${v.you.hand.join(",")}` +
    `|mana ${v.you.mana[v.you.faction] ?? 0}`;
  const localBoard = pack(local);
  const serverBoard = pack(serverView);
  if (localBoard !== serverBoard) {
    return {
      host: next,
      error: `${seat} локально ${localBoard} ≠ сервер ${serverBoard}`,
    };
  }
  const mismatch = viewsOk(next);
  if (mismatch) return { host: next, error: mismatch };
  return { host: next };
}

function playCreature(host: BattleState, seat: PvpSeat, slot: number) {
  const view = viewForSeat(host, seat);
  const hand = creatureHand(view);
  if (hand < 0) return { host, error: `${seat}: нет существа в руке` };
  const empty = emptySlot(view);
  if (empty < 0 && view.you.slots[slot]) {
    return { host, error: `${seat}: нет пустого слота` };
  }
  const to = view.you.slots[slot] ? empty : slot;
  return act(host, seat, { kind: "playCard", handIndex: hand, slotIndex: to });
}

function playHeroMana(host: BattleState, seat: PvpSeat): {
  host: BattleState;
  error?: string;
} {
  const view = viewForSeat(host, seat);
  const idx = view.you.hand.indexOf("hero_mana");
  if (idx < 0) return { host, error: `${seat}: нет hero_mana в руке` };
  const beforeMana = view.you.mana[view.you.faction] ?? 0;
  const beforeHand = view.you.hand.length;
  const r = act(host, seat, {
    kind: "playCard",
    handIndex: idx,
    slotIndex: null,
  });
  if (r.error) return r;
  const after = viewForSeat(r.host, seat);
  if (after.you.hand.length !== beforeHand - 1) {
    return {
      host: r.host,
      error: `${seat}: hero_mana не списалась (рука ${beforeHand}→${after.you.hand.length})`,
    };
  }
  const beforeCount = view.you.hand.filter((id) => id === "hero_mana").length;
  const afterCount = after.you.hand.filter((id) => id === "hero_mana").length;
  if (afterCount !== beforeCount - 1) {
    return {
      host: r.host,
      error: `${seat}: копий hero_mana ${beforeCount}→${afterCount}`,
    };
  }
  const afterMana = after.you.mana[after.you.faction] ?? 0;
  if (afterMana < beforeMana + 1) {
    return {
      host: r.host,
      error: `${seat}: мана ${beforeMana}→${afterMana}, ждали +1`,
    };
  }
  if (r.host.winner) {
    return { host: r.host, error: `${seat}: hero_mana выставила победу` };
  }
  const mismatch = viewsOk(r.host);
  if (mismatch) return { host: r.host, error: mismatch };
  return r;
}

function boot(seed: number, first: PvpSeat = "host"): BattleState {
  const hostDeck = [
    ...botDeckForLevel(5 + (seed % 5), "life"),
    "hero_mana",
    "hero_mana",
  ];
  const guestDeck = [
    ...botDeckForLevel(4 + (seed % 6), "death"),
    "hero_mana",
    "hero_mana",
  ];
  return startPvpBattle({
    host: {
      deck: hostDeck,
      heroId: "hero_life",
      name: "Хост",
      level: 8 + (seed % 5),
    },
    guest: {
      deck: guestDeck,
      heroId: "hero_death",
      name: "Гость",
      level: 3 + (seed % 4),
    },
    dice: {
      host: first === "host" ? 6 : 1,
      guest: first === "host" ? 1 : 6,
      first,
    },
  }).state;
}

function seatNow(host: BattleState): PvpSeat {
  return host.active === "you" ? "host" : "guest";
}

/** Один полный бой до победителя; оба вида стола совпадают на каждом ходе. */
function runOneDuel(seed: number): string | null {
  let s = fillMana(boot(seed, seed % 2 === 0 ? "host" : "guest"));
  let steps = 0;
  while (!s.winner && steps < 120) {
    steps += 1;
    const seat = seatNow(s);
    const view = viewForSeat(s, seat);
    // 1) доп. мана если есть
    const manaIdx = view.you.hand.indexOf("hero_mana");
    if (manaIdx >= 0) {
      const r = playHeroMana(s, seat);
      if (r.error) return `сид ${seed} шаг ${steps} mana: ${r.error}`;
      s = fillMana(r.host);
      if (s.winner) break;
      continue;
    }
    // 2) призыв в пустой слот
    const ch = creatureHand(view);
    const es = emptySlot(view);
    if (ch >= 0 && es >= 0 && steps < 40) {
      const r = act(s, seat, {
        kind: "playCard",
        handIndex: ch,
        slotIndex: es,
      });
      if (r.error) return `сид ${seed} шаг ${steps} play: ${r.error}`;
      s = fillMana(r.host);
      if (s.winner) break;
      continue;
    }
    // 3) атаки
    let hit = false;
    for (let i = 0; i < 5; i++) {
      const u = viewForSeat(s, seat).you.slots[i];
      if (!u?.canAttack) continue;
      const blocker = viewForSeat(s, seat).enemy.slots[i];
      const target = blocker ? i : ("hero" as const);
      const r = act(s, seat, { kind: "attack", fromSlot: i, target });
      if (r.error) return `сид ${seed} шаг ${steps} atk: ${r.error}`;
      s = r.host;
      hit = true;
      if (s.winner) break;
    }
    if (s.winner) break;
    const pass = act(s, seat, { kind: "endTurn" });
    if (pass.error) return `сид ${seed} шаг ${steps} pass: ${pass.error}`;
    s = fillMana(pass.host);
    if (!hit && steps > 8) {
      // форс-дамаг чтобы бой кончался
      if (seat === "host") s.enemy.hp = Math.max(0, s.enemy.hp - 3);
      else s.you.hp = Math.max(0, s.you.hp - 3);
      if (s.you.hp <= 0) s.winner = "enemy";
      if (s.enemy.hp <= 0) s.winner = "you";
      const m = viewsOk(s);
      if (m) return `сид ${seed} force: ${m}`;
    }
  }
  if (!s.winner) return `сид ${seed}: нет победителя за ${steps}`;
  const m = viewsOk(s);
  if (m) return `сид ${seed} финал: ${m}`;
  return null;
}

export function pvpDuelAll(fails: QaFail[], ok: string[]): void {
  const log: string[] = [];
  const fail = (detail: string) => {
    fails.push({ area: "PvP дуэль", detail });
  };

  try {
    const emptyRolls = { host: null, guest: null };
    const hostWait = pvpOpeningView("wait", emptyRolls, "host", null);
    const guestWait = pvpOpeningView("wait", emptyRolls, "guest", null);
    if (!hostWait.needRoll || !guestWait.needRoll) {
      fail("на старте оба должны бросать кубик");
      return;
    }
    const afterHost = { host: 5, guest: null };
    const hostAfter = pvpOpeningView("wait", afterHost, "host", null);
    const guestAfter = pvpOpeningView("wait", afterHost, "guest", null);
    if (hostAfter.needRoll) {
      fail("хост уже бросил, needRoll должен быть false");
      return;
    }
    if (!guestAfter.needRoll || !guestAfter.foeRolled) {
      fail("гость должен бросать сам, даже если хост уже бросил");
      return;
    }
    if (guestAfter.openingDice) {
      fail("результат кубика рано у гостя");
      return;
    }
    log.push("кубик: хост бросил — гость всё ещё бросает сам");

    const afterBoth = pvpOpeningView(
      "done",
      { host: 5, guest: 2 },
      "guest",
      { host: 5, guest: 2, first: "host" },
    );
    if (afterBoth.needRoll || afterBoth.openingLocked) {
      fail("после кубиков ход должен быть открыт");
      return;
    }
    log.push("после кубиков стол разблокирован");

    let thrown = false;
    try {
      applySeatAction(boot(0), "host", {
        kind: "commitState",
        state: boot(0),
      });
    } catch {
      thrown = true;
    }
    if (!thrown) {
      fail("снимок стола всё ещё принимается");
      return;
    }
    log.push("снимок стола отвергнут");

    // --- hero_mana с обоих мест ---
    {
      let s = startPvpBattle({
        host: {
          deck: Array(20).fill("hero_mana"),
          heroId: "hero_life",
          name: "Хост",
          level: 5,
        },
        guest: {
          deck: Array(20).fill("hero_mana"),
          heroId: "hero_death",
          name: "Гость",
          level: 5,
        },
        dice: { host: 6, guest: 1, first: "host" },
      }).state;
      const hostBefore = factionMana(s, "host");
      const r1 = playHeroMana(s, "host");
      if (r1.error) {
        fail(`hero_mana хост: ${r1.error}`);
        return;
      }
      s = r1.host;
      if (factionMana(s, "host") < hostBefore + 1) {
        fail("hero_mana хост: мана не выросла");
        return;
      }
      const pass = act(s, "host", { kind: "endTurn" });
      if (pass.error) {
        fail(`пас после маны: ${pass.error}`);
        return;
      }
      s = pass.host;
      const guestBefore = factionMana(s, "guest");
      const r2 = playHeroMana(s, "guest");
      if (r2.error) {
        fail(`hero_mana гость: ${r2.error}`);
        return;
      }
      s = r2.host;
      if (factionMana(s, "guest") < guestBefore + 1) {
        fail("hero_mana гость: мана не выросла");
        return;
      }
      if (s.winner) {
        fail("hero_mana дала победу");
        return;
      }
      log.push("hero_mana: хост и гость — списалась, +1 маны, без победы");
    }

    // --- эталонный бой танк/скелет ---
    let s = startPvpBattle({
      host: {
        deck: Array(20).fill("tank"),
        heroId: "hero_life",
        name: "Хост",
        level: 8,
      },
      guest: {
        deck: Array(20).fill("skeleton"),
        heroId: "hero_death",
        name: "Гость",
        level: 3,
      },
      dice: { host: 6, guest: 1, first: "host" },
    }).state;
    s = fillMana(s);

    for (const slot of [0, 1, 2]) {
      const r = playCreature(s, "host", slot);
      if (r.error) {
        fail(`хост призыв ${slot}: ${r.error}`);
        return;
      }
      s = fillMana(r.host);
    }
    {
      const r = act(s, "host", { kind: "endTurn" });
      if (r.error) {
        fail(`хост пас: ${r.error}`);
        return;
      }
      s = fillMana(r.host);
    }
    {
      const r = playCreature(s, "guest", 0);
      if (r.error) {
        fail(`гость призыв: ${r.error}`);
        return;
      }
      s = fillMana(r.host);
    }
    {
      const r = act(s, "guest", { kind: "endTurn" });
      if (r.error) {
        fail(`гость пас: ${r.error}`);
        return;
      }
      s = fillMana(r.host);
    }
    {
      const r = act(s, "host", { kind: "attack", fromSlot: 0, target: 0 });
      if (r.error) {
        fail(`удар по скелету: ${r.error}`);
        return;
      }
      s = r.host;
    }
    if (s.enemy.slots[0]) {
      fail("скелет жив после удара");
      return;
    }
    if (viewForSeat(s, "guest").you.slots[0]) {
      fail("гость видит скелета после смерти");
      return;
    }
    if (s.winner) {
      fail("убийство существа = победа");
      return;
    }
    log.push("убийство существа без победы, оба вида пусты");

    let steps = 0;
    while (!s.winner && steps < 80) {
      steps += 1;
      const seat = seatNow(s);
      for (let i = 0; i < 5; i++) {
        const u = viewForSeat(s, seat).you.slots[i];
        if (!u?.canAttack) continue;
        const blocker = viewForSeat(s, seat).enemy.slots[i];
        const target = blocker ? i : ("hero" as const);
        const r = act(s, seat, { kind: "attack", fromSlot: i, target });
        if (r.error) {
          fail(`${seat} удар: ${r.error}`);
          return;
        }
        s = r.host;
        if (s.winner) break;
      }
      if (s.winner) break;
      const r = act(s, seat, { kind: "endTurn" });
      if (r.error) {
        fail(`${seat} пас: ${r.error}`);
        return;
      }
      s = fillMana(r.host);
    }
    if (!s.winner) {
      fail(`бой не кончился, HP ${s.you.hp}/${s.enemy.hp}`);
      return;
    }
    const fin = viewsOk(s);
    if (fin) {
      fail(fin);
      return;
    }
    log.push(`эталонный бой: победа согласована, шагов ${steps}`);

    // --- 100 случайных дуэлей ---
    let stressOk = 0;
    for (let seed = 1000; seed < 1100; seed++) {
      const bad = runOneDuel(seed);
      if (bad) {
        fail(bad);
        return;
      }
      stressOk += 1;
    }
    log.push(`стресс: ${stressOk}/100 дуэлей зелёные`);

    ok.push(`PvP дуэль с двух мест: ${log.join("; ")}`);
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}
