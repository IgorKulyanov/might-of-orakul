/**
 * Жёсткий самотест PvP-логики. Без UI, без игроков.
 * Коды FAIL — сразу причина, не «что-то сломалось».
 */
import {
  applySeatAction,
  isSeatTurn,
  startPvpBattle,
  viewForSeat,
  type PvpSeat,
} from "../src/game/pvpProtocol.ts";
import type { BattleState } from "../src/game/types.ts";

export type PvpCanaryResult = {
  ok: boolean;
  code: string;
  detail: string;
  ms: number;
  at: number;
};

const DECK = [
  "skeleton",
  "skeleton",
  "skeleton",
  "skeleton",
  "mage",
  "tank",
  "zombie",
  "zombie",
];

let lastResult: PvpCanaryResult = {
  ok: true,
  code: "NOT_RUN",
  detail: "canary ещё не запускался",
  ms: 0,
  at: 0,
};

export function getLastPvpCanary(): PvpCanaryResult {
  return lastResult;
}

function fail(code: string, detail: string, t0: number): PvpCanaryResult {
  const result: PvpCanaryResult = {
    ok: false,
    code,
    detail,
    ms: Date.now() - t0,
    at: Date.now(),
  };
  lastResult = result;
  console.error(
    `[pvp:FAIL] code=${code} detail=${JSON.stringify(detail)} ms=${result.ms}`,
  );
  return result;
}

function ok(code: string, detail: string, t0: number): PvpCanaryResult {
  const result: PvpCanaryResult = {
    ok: true,
    code,
    detail,
    ms: Date.now() - t0,
    at: Date.now(),
  };
  lastResult = result;
  console.warn(`[pvp:OK] code=${code} detail=${detail} ms=${result.ms}`);
  return result;
}

function slotCount(s: BattleState, side: "you" | "enemy"): number {
  return s[side].slots.filter(Boolean).length;
}

function fillMana(s: BattleState): BattleState {
  const next = structuredClone(s) as BattleState;
  const full = { water: 9, hell: 9, death: 9, life: 9, nature: 9 };
  next.you.mana = { ...full };
  next.enemy.mana = { ...full };
  return next;
}

function viewsParity(host: BattleState): string | null {
  const h = viewForSeat(host, "host");
  const g = viewForSeat(host, "guest");
  if (h.you.hp !== g.enemy.hp) return `hp host you=${h.you.hp} guest foe=${g.enemy.hp}`;
  if (h.enemy.hp !== g.you.hp) return `hp host foe=${h.enemy.hp} guest you=${g.you.hp}`;
  for (let i = 0; i < 5; i++) {
    const a = h.you.slots[i]?.cardId ?? null;
    const b = g.enemy.slots[i]?.cardId ?? null;
    if (a !== b) return `slot host.you[${i}]=${a} guest.enemy=${b}`;
    const c = h.enemy.slots[i]?.cardId ?? null;
    const d = g.you.slots[i]?.cardId ?? null;
    if (c !== d) return `slot host.enemy[${i}]=${c} guest.you=${d}`;
  }
  if ((h.active === "you") === (g.active === "you")) {
    return `active both see same side host=${h.active} guest=${g.active}`;
  }
  return null;
}

function runScenario(first: PvpSeat, t0: number): PvpCanaryResult | null {
  const dice =
    first === "host"
      ? { host: 6, guest: 1, first: "host" as const }
      : { host: 1, guest: 6, first: "guest" as const };

  let host: BattleState;
  try {
    host = startPvpBattle({
      host: {
        deck: DECK,
        heroId: "hero_death",
        name: "CanaryHost",
        level: 5,
      },
      guest: {
        deck: DECK,
        heroId: "hero_death",
        name: "CanaryGuest",
        level: 5,
      },
      dice,
    }).state;
  } catch (e) {
    return fail(
      "BOOT_BATTLE",
      e instanceof Error ? e.message : String(e),
      t0,
    );
  }

  host = fillMana(host);
  if (!isSeatTurn(host, first)) {
    return fail(
      "BOOT_TURN",
      `first=${first} but isSeatTurn false active=${host.active}`,
      t0,
    );
  }

  const second: PvpSeat = first === "host" ? "guest" : "host";
  host = applySeatAction(host, first, { kind: "endTurn" });
  if (!isSeatTurn(host, second)) {
    return fail(
      "TURN_PASS_1",
      `after ${first} endTurn expected ${second} active=${host.active}`,
      t0,
    );
  }

  host = fillMana(host);
  const beforeEnemy = slotCount(viewForSeat(host, first), "enemy");
  host = applySeatAction(host, second, {
    kind: "playCard",
    handIndex: 0,
    slotIndex: 0,
  });
  const afterEnemy = slotCount(viewForSeat(host, first), "enemy");
  const afterYou = slotCount(viewForSeat(host, second), "you");
  if (afterYou < 1) {
    return fail(
      "PLAY_REJECTED",
      `${second} playCard не поставил юнита себе youSlots=${afterYou}`,
      t0,
    );
  }
  if (afterEnemy <= beforeEnemy) {
    return fail(
      "PLAY_INVISIBLE_TO_FOE",
      `${second} поставил карту, но ${first} не видит enemySlots ${beforeEnemy}->${afterEnemy}`,
      t0,
    );
  }

  const parity = viewsParity(host);
  if (parity) return fail("VIEW_DESYNC", parity, t0);

  host = applySeatAction(host, second, { kind: "endTurn" });
  if (!isSeatTurn(host, first)) {
    return fail(
      "TURN_PASS_2",
      `after ${second} endTurn expected ${first} active=${host.active} turn=${host.turn}`,
      t0,
    );
  }
  if (host.turn < 2 && first === "host") {
    // host first: after full round turn should be 2
    return fail(
      "TURN_COUNTER",
      `expected turn>=2 after full round, got ${host.turn}`,
      t0,
    );
  }

  const parity2 = viewsParity(host);
  if (parity2) return fail("VIEW_DESYNC", parity2, t0);

  return null;
}

/** Синхронный canary — миллисекунды, без сети. */
export function runPvpLogicCanary(): PvpCanaryResult {
  const t0 = Date.now();
  try {
    for (const first of ["host", "guest"] as const) {
      const bad = runScenario(first, t0);
      if (bad) return bad;
    }
    return ok("LOGIC_SYNC", "host+guest first: turn pass + play visible", t0);
  } catch (e) {
    return fail(
      "EXCEPTION",
      e instanceof Error ? e.message : String(e),
      t0,
    );
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Фоновый сторож: каждые 45с. Падение = [pvp:FAIL] в journal. */
export function startPvpCanaryWatchdog(intervalMs = 45_000) {
  if (timer) return;
  runPvpLogicCanary();
  timer = setInterval(() => {
    runPvpLogicCanary();
  }, intervalMs);
  timer.unref?.();
  console.warn("[pvp:OK] code=WATCHDOG_ON intervalMs=", intervalMs);
}
