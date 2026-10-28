/**
 * Полный PvP-бой с двух мест: сервер применяет ход, оба вида стола совпадают.
 */
import { getCard } from "./cards";
import {
  applyPvpAction,
  applySeatAction,
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
  const localBoard = local.you.slots.map(slotId).join(",") +
    "|" +
    local.enemy.slots.map(slotId).join(",") +
    `|hp ${local.you.hp}/${local.enemy.hp}`;
  const serverBoard = serverView.you.slots.map(slotId).join(",") +
    "|" +
    serverView.enemy.slots.map(slotId).join(",") +
    `|hp ${serverView.you.hp}/${serverView.enemy.hp}`;
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

export function pvpDuelAll(fails: QaFail[], ok: string[]): void {
  const log: string[] = [];
  const fail = (detail: string) => {
    fails.push({ area: "PvP дуэль", detail });
  };

  try {
    let thrown = false;
    try {
      applySeatAction(
        startPvpBattle({
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
        }).state,
        "host",
        {
          kind: "commitState",
          state: startPvpBattle({
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
          }).state,
        },
      );
    } catch {
      thrown = true;
    }
    if (!thrown) {
      fail("снимок стола всё ещё принимается");
      return;
    }
    log.push("снимок стола отвергнут");

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
    log.push(
      `старт: хост HP ${s.you.hp}, гость HP ${s.enemy.hp}, ход ${s.active === "you" ? "хоста" : "гостя"}`,
    );

    for (const slot of [0, 1, 2]) {
      const r = playCreature(s, "host", slot);
      if (r.error) {
        fail(`хост призыв ${slot}: ${r.error}`);
        return;
      }
      s = fillMana(r.host);
    }
    log.push(
      `хост призвал: ${s.you.slots.map(slotId).join(" ")}`,
    );

    {
      const r = act(s, "host", { kind: "endTurn" });
      if (r.error) {
        fail(`хост пас: ${r.error}`);
        return;
      }
      s = fillMana(r.host);
    }
    if (s.active !== "enemy") {
      fail(`после паса хоста active=${s.active}`);
      return;
    }
    log.push("ход перешёл гостю");

    {
      const r = playCreature(s, "guest", 0);
      if (r.error) {
        fail(`гость призыв: ${r.error}`);
        return;
      }
      s = fillMana(r.host);
    }
    const guestUnit = viewForSeat(s, "guest").you.slots[0];
    if (!guestUnit) {
      fail("гость не увидел своё существо");
      return;
    }
    const hostSeesFoe = s.enemy.slots[0];
    if (!hostSeesFoe || hostSeesFoe.cardId !== guestUnit.cardId) {
      fail("хост не видит скелета гостя");
      return;
    }
    log.push(`гость призвал ${slotId(guestUnit)} — хост видит того же`);

    {
      const r = act(s, "guest", { kind: "endTurn" });
      if (r.error) {
        fail(`гость пас: ${r.error}`);
        return;
      }
      s = fillMana(r.host);
    }
    log.push("круг закрыт, снова ход хоста");

    const ghost = structuredClone(s) as BattleState;
    const onlyLocal = applyPvpAction(viewForSeat(ghost, "host"), {
      kind: "attack",
      fromSlot: 0,
      target: 0,
    });
    if (onlyLocal.enemy.slots[0] && onlyLocal.enemy.slots[0].health > 0) {
      fail("локальный удар хоста не снял существо");
      return;
    }
    if (!ghost.enemy.slots[0]) {
      fail("локальный удар зря испортил сервер");
      return;
    }
    log.push(
      "баг воспроизведён: локальный удар убивает у хоста, на сервере существо живо",
    );

    {
      const r = act(s, "host", { kind: "attack", fromSlot: 0, target: 0 });
      if (r.error) {
        fail(`удар по скелету: ${r.error}`);
        return;
      }
      s = r.host;
    }
    if (s.enemy.slots[0]) {
      fail(
        `после серверного удара скелет жив HP=${s.enemy.slots[0].health}`,
      );
      return;
    }
    const guestAfterKill = viewForSeat(s, "guest");
    if (guestAfterKill.you.slots[0]) {
      fail("гость всё ещё видит своё существо после удара хоста");
      return;
    }
    if (s.winner) {
      fail("убийство существа выставило победу");
      return;
    }
    log.push(
      `хост убил скелета — у гостя слот пуст, победы нет (HP гостя ${s.enemy.hp})`,
    );

    let steps = 0;
    while (!s.winner && steps < 80) {
      steps += 1;
      if (s.active === "you") {
        const hostView = viewForSeat(s, "host");
        let hit = false;
        for (let i = 0; i < 5; i++) {
          const u = hostView.you.slots[i];
          if (!u?.canAttack) continue;
          const blocker = hostView.enemy.slots[i];
          const target = blocker ? i : "hero";
          const r = act(s, "host", { kind: "attack", fromSlot: i, target });
          if (r.error) {
            fail(`хост удар ${i}→${String(target)}: ${r.error}`);
            return;
          }
          s = r.host;
          hit = true;
          if (s.winner) break;
        }
        if (s.winner) break;
        if (!hit) {
          const r = act(s, "host", { kind: "endTurn" });
          if (r.error) {
            fail(`хост пас в бою: ${r.error}`);
            return;
          }
          s = fillMana(r.host);
        } else {
          const r = act(s, "host", { kind: "endTurn" });
          if (r.error) {
            fail(`хост пас после ударов: ${r.error}`);
            return;
          }
          s = fillMana(r.host);
        }
      } else {
        const guestView = viewForSeat(s, "guest");
        let hit = false;
        for (let i = 0; i < 5; i++) {
          const u = guestView.you.slots[i];
          if (!u?.canAttack) continue;
          const blocker = guestView.enemy.slots[i];
          const target = blocker ? i : "hero";
          const r = act(s, "guest", { kind: "attack", fromSlot: i, target });
          if (r.error) {
            fail(`гость удар ${i}→${String(target)}: ${r.error}`);
            return;
          }
          s = r.host;
          hit = true;
          if (s.winner) break;
        }
        if (s.winner) break;
        const r = act(s, "guest", { kind: "endTurn" });
        if (r.error) {
          fail(`гость пас в бою: ${r.error}`);
          return;
        }
        s = fillMana(r.host);
      }
    }

    if (!s.winner) {
      fail(`бой не кончился за ${steps} шагов, HP ${s.you.hp}/${s.enemy.hp}`);
      return;
    }
    const hostView = viewForSeat(s, "host");
    const guestView = viewForSeat(s, "guest");
    if (hostView.winner === "you") {
      if (guestView.winner !== "enemy") {
        fail(`хост победил, гость видит ${guestView.winner}`);
        return;
      }
      if (s.enemy.hp > 0) {
        fail("победа хоста при живом госте");
        return;
      }
      log.push(
        `победа хоста: HP ${s.you.hp}/${s.enemy.hp}, гость видит поражение, шагов ${steps}`,
      );
    } else if (hostView.winner === "enemy") {
      if (guestView.winner !== "you") {
        fail(`гость победил, хост видит ${hostView.winner}`);
        return;
      }
      log.push(
        `победа гостя: HP ${s.you.hp}/${s.enemy.hp}, оба вида согласны, шагов ${steps}`,
      );
    } else {
      fail(`странный winner=${String(s.winner)}`);
      return;
    }

    ok.push(`PvP дуэль с двух мест: ${log.join("; ")}`);
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}
