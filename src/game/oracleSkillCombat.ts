/**
 * Боевая логика умений оракула (активки 1× за бой).
 */
import type { BattleState, CreatureInstance, PlayerState } from "./types";
import { getCard } from "./cards";
import { getHero } from "./heroes";
import {
  getSkill,
  hasEquippedSkill,
  nEpic,
  unitImmuneToOracleSkills,
} from "./oracleSkills";

function uidLocal(): string {
  return `osk_${Math.random().toString(36).slice(2, 10)}`;
}

/** Крошечный росток: карта-паук со статами 1/1 (иконка временная). */
export function makeSproutToken(): CreatureInstance {
  return {
    uid: uidLocal(),
    cardId: "spider",
    baseAttack: 1,
    baseHealth: 1,
    permAttack: 0,
    permHealth: 0,
    packBonus: 0,
    attack: 1,
    health: 1,
    canAttack: false,
    statuses: [],
    upgradeLevel: 1,
  };
}

function paySchoolMana(p: PlayerState, cost: number): boolean {
  if (cost <= 0) return true;
  const have = p.mana[p.faction] ?? 0;
  if (have < cost) return false;
  p.mana[p.faction] = have - cost;
  return true;
}

function alreadyUsed(p: PlayerState, skillId: string): boolean {
  return Boolean(p.oracleSkillUsed?.[skillId]);
}

function markUsed(p: PlayerState, skillId: string): void {
  if (!p.oracleSkillUsed) p.oracleSkillUsed = {};
  p.oracleSkillUsed[skillId] = true;
  p.oracleActiveUsedThisTurn = true;
}

function unitHpCap(u: CreatureInstance): number {
  return (
    u.baseHealth +
    (u.permHealth ?? 0) +
    (u.packBonus ?? 0) +
    (u.auraHp ?? 0) +
    (u.schoolAuraHp ?? 0)
  );
}

function healUnit(u: CreatureInstance, amount: number): number {
  const cap = Math.max(unitHpCap(u), u.health);
  const before = u.health;
  u.health = Math.min(cap, u.health + amount);
  return u.health - before;
}

function clearPoisonBurn(u: { statuses: { type: string }[] }): void {
  u.statuses = u.statuses.filter((s) => s.type !== "poison" && s.type !== "burn");
}

/** Урон оракулу: мокрая броня / жёсткость / второй шанс / последний вздох. */
export function hurtOracle(p: PlayerState, raw: number, log: string[]): number {
  let dmg = Math.max(0, Math.floor(raw));
  if (dmg <= 0) return 0;

  if (p.heroGuardedByUid) {
    const tank = p.slots.find((s) => s && s.uid === p.heroGuardedByUid);
    if (tank && tank.health > 0) {
      const share = Math.min(1, Math.max(0, p.heroGuardShare ?? 1));
      const toTank = Math.round(dmg * share);
      const toHero = dmg - toTank;
      if (toTank > 0) {
        tank.health -= toTank;
        log.unshift(
          `⛓ ${getCard(tank.cardId).name} принимает ${Math.round(share * 100)}% удара за оракула (−${toTank})`,
        );
      }
      dmg = toHero;
      if (dmg <= 0) return toTank;
    }
  }

  if (hasEquippedSkill(p, "wet_armor") && !p.oracleWetArmorUsed) {
    p.oracleWetArmorUsed = true;
    const next = Math.floor(dmg / 2);
    if (next < dmg) log.unshift(`${p.name}: мокрая броня — урон −50%`);
    dmg = next;
  }

  if (hasEquippedSkill(p, "tough") && !p.oracleToughUsed) {
    p.oracleToughUsed = true;
    const next = Math.max(0, dmg - 1);
    if (next < dmg) log.unshift(`${p.name}: жёсткость — удар −1`);
    dmg = next;
  }

  if (dmg <= 0) return 0;

  if (p.hp - dmg <= 0 && !p.oracleSecondChanceUsed) {
    const second = hasEquippedSkill(p, "second_chance");
    const lastBreath =
      hasEquippedSkill(p, "last_breath") && (p.graveyard?.length ?? 0) > 0;
    if (second || lastBreath) {
      p.oracleSecondChanceUsed = true;
      const absorbed = p.hp - 1;
      p.hp = 1;
      log.unshift(
        lastBreath && !second
          ? `${p.name}: последний вздох — 1 HP`
          : `${p.name}: второй шанс — 1 HP`,
      );
      return Math.max(0, absorbed);
    }
  }

  p.hp -= dmg;
  return dmg;
}

export type CastOracleSkillOpts = {
  skillId: string;
  targetSlot?: number | null;
  toSlot?: number | null;
  healAll?: boolean;
};

/**
 * Активное умение от лица «you». Бросает Error с текстом для UI.
 */
export function castOracleSkill(
  state: BattleState,
  opts: CastOracleSkillOpts,
): BattleState {
  if (state.winner || state.active !== "you") {
    throw new Error("Сейчас не твой ход");
  }
  const def = getSkill(opts.skillId);
  if (!def) throw new Error("Неизвестное умение");
  if (def.kind !== "active") throw new Error("Это пассивное умение");

  const me0 = state.you;
  if (me0.faction !== def.faction) throw new Error("Умение другой школы");
  if (!(me0.oracleSkillLoadout ?? []).includes(def.id)) {
    throw new Error("Умение не экипировано");
  }
  if (alreadyUsed(me0, def.id)) {
    throw new Error("Умение уже использовано в этом бою");
  }
  if (me0.oracleActiveUsedThisTurn) {
    throw new Error("За ход — только одно активное умение");
  }
  if ((me0.oracleSkillsMutedTurns ?? 0) > 0) {
    throw new Error("Умения оракула заглушены");
  }

  const epic = getHero(me0.heroId).tier === "epic";
  const next = structuredClone(state) as BattleState;
  const you = next.you;
  const foe = next.enemy;
  const cost = def.manaCost ?? 0;
  if (!paySchoolMana(you, cost)) {
    throw new Error(`Нужно ${cost} маны ${you.faction}`);
  }

  const suffix = def.id.slice(def.faction.length + 1);
  let logLine = `Умение «${def.name}»`;

  const needEnemy = (slot?: number | null) => {
    if (slot == null || slot < 0 || slot > 4 || !foe.slots[slot]) {
      throw new Error("Выбери существо врага");
    }
    const u = foe.slots[slot]!;
    if (unitImmuneToOracleSkills(u)) {
      throw new Error("Цель невосприимчива к заклинаниям");
    }
    return u;
  };
  const needAlly = (slot?: number | null) => {
    if (slot == null || slot < 0 || slot > 4 || !you.slots[slot]) {
      throw new Error("Выбери своё существо");
    }
    return you.slots[slot]!;
  };

  switch (suffix) {
    case "mana_heal_self": {
      const heal = nEpic(5, epic);
      const before = you.hp;
      you.hp = Math.min(you.maxHp, you.hp + heal);
      logLine += `: +${you.hp - before} HP`;
      break;
    }
    case "mana_heal": {
      if (def.faction === "water") {
        const heal = nEpic(4, epic);
        const before = you.hp;
        you.hp = Math.min(you.maxHp, you.hp + heal);
        logLine += `: +${you.hp - before} HP`;
        break;
      }
      // nature
      if (opts.healAll) {
        const heal = nEpic(2, epic);
        for (const u of you.slots) {
          if (u) healUnit(u, heal);
        }
        logLine += `: все свои +${heal} HP`;
      } else if (opts.targetSlot != null && you.slots[opts.targetSlot]) {
        const heal = nEpic(5, epic);
        const got = healUnit(you.slots[opts.targetSlot]!, heal);
        logLine += `: юнит +${got} HP`;
      } else {
        const heal = nEpic(5, epic);
        const before = you.hp;
        you.hp = Math.min(you.maxHp, you.hp + heal);
        logLine += `: +${you.hp - before} HP`;
      }
      break;
    }
    case "mana_heal_unit": {
      const u = needAlly(opts.targetSlot);
      const got = healUnit(u, nEpic(6, epic));
      logLine += `: ${getCard(u.cardId).name} +${got} HP`;
      break;
    }
    case "heal_all": {
      const heal = nEpic(3, epic);
      for (const u of you.slots) {
        if (u) healUnit(u, heal);
      }
      logLine += `: все свои +${heal} HP`;
      break;
    }
    case "cleanse": {
      if (def.faction === "water") {
        you.heroBurn = undefined;
        logLine += `: с себя снят ожог`;
        break;
      }
      if (opts.targetSlot == null) {
        you.heroBurn = undefined;
        logLine += `: с оракула снят вред`;
      } else {
        const u = needAlly(opts.targetSlot);
        clearPoisonBurn(u);
        logLine += `: снят вред с ${getCard(u.cardId).name}`;
      }
      break;
    }
    case "shield": {
      const u = needAlly(opts.targetSlot);
      u.statuses = u.statuses.filter((s) => s.type !== "shield");
      u.statuses.push({ type: "shield", amount: 1 });
      logLine += `: щит на ${getCard(u.cardId).name}`;
      break;
    }
    case "mana_strike":
    case "fire_strike": {
      if (suffix === "fire_strike") {
        const dmg = nEpic(4, epic);
        hurtOracle(foe, dmg, next.log);
        logLine += `: враг −${dmg} HP`;
        break;
      }
      const dmg =
        def.faction === "hell" ? nEpic(3, epic) : nEpic(4, epic);
      if (opts.targetSlot == null) {
        hurtOracle(foe, dmg, next.log);
        logLine += `: враг-оракул −${dmg}`;
      } else {
        const u = needEnemy(opts.targetSlot);
        u.health -= dmg;
        logLine += `: ${getCard(u.cardId).name} −${dmg}`;
        if (u.health <= 0) {
          foe.graveyard.unshift(u.cardId);
          foe.slots[opts.targetSlot!] = null;
          onUnitKilled(next, you, foe, "enemy");
        }
      }
      break;
    }
    case "sacrifice": {
      const u = needAlly(opts.targetSlot);
      const gain = Math.max(0, u.health);
      const name = getCard(u.cardId).name;
      you.graveyard.unshift(u.cardId);
      you.slots[opts.targetSlot!] = null;
      you.hp = Math.min(you.maxHp, you.hp + gain);
      onUnitKilled(next, you, foe, "you");
      logLine += `: жертва ${name}, +${gain} HP`;
      break;
    }
    case "execute": {
      const u = needEnemy(opts.targetSlot);
      const thr = nEpic(4, epic);
      if (u.health > thr) throw new Error(`Нужно HP ≤ ${thr}`);
      const name = getCard(u.cardId).name;
      foe.graveyard.unshift(u.cardId);
      foe.slots[opts.targetSlot!] = null;
      onUnitKilled(next, you, foe, "enemy");
      logLine += `: добивание ${name}`;
      break;
    }
    case "corpse_drain": {
      if (!you.graveyard.length) throw new Error("Нет трупа в могиле");
      you.graveyard.shift();
      const heal = nEpic(4, epic);
      you.hp = Math.min(you.maxHp, you.hp + heal);
      you.mana.death = (you.mana.death ?? 0) + 1;
      logLine += `: +${heal} HP и +1 мана смерти`;
      break;
    }
    case "plague": {
      const u = needEnemy(opts.targetSlot);
      u.statuses = u.statuses.filter((s) => s.type !== "poison");
      u.statuses.push({ type: "poison", amount: nEpic(2, epic), turns: 3 });
      logLine += `: яд на ${getCard(u.cardId).name}`;
      break;
    }
    case "burn_hero": {
      foe.heroBurn = { amount: nEpic(2, epic), turns: 2 };
      logLine += `: враг горит`;
      break;
    }
    case "burn_unit": {
      const u = needEnemy(opts.targetSlot);
      u.statuses = u.statuses.filter((s) => s.type !== "burn");
      u.statuses.push({ type: "burn", amount: 1, turns: nEpic(3, epic) });
      logLine += `: ${getCard(u.cardId).name} горит`;
      break;
    }
    case "line_burn": {
      let n = 0;
      for (const u of foe.slots) {
        if (!u || unitImmuneToOracleSkills(u)) continue;
        u.statuses = u.statuses.filter((s) => s.type !== "burn");
        u.statuses.push({ type: "burn", amount: 1, turns: 99 });
        n += 1;
      }
      if (n === 0) throw new Error("Нет целей на поле");
      logLine += `: подожжено юнитов ${n}`;
      break;
    }
    case "sleep": {
      const u = needEnemy(opts.targetSlot);
      u.statuses = u.statuses.filter((s) => s.type !== "sleep");
      u.statuses.push({ type: "sleep", amount: 1 });
      u.canAttack = false;
      logLine += `: ${getCard(u.cardId).name} спит`;
      break;
    }
    case "bounce": {
      const u = needEnemy(opts.targetSlot);
      const thr = nEpic(2, epic);
      if (u.attack > thr) throw new Error(`Нужна атака ≤ ${thr}`);
      const cardId = u.cardId;
      foe.slots[opts.targetSlot!] = null;
      foe.hand.push(cardId);
      logLine += `: ${getCard(cardId).name} в руку врага`;
      break;
    }
    case "shift": {
      const from = opts.targetSlot;
      const to = opts.toSlot;
      if (from == null || !foe.slots[from]) throw new Error("Выбери врага");
      if (unitImmuneToOracleSkills(foe.slots[from]!)) {
        throw new Error("Цель невосприимчива к заклинаниям");
      }
      if (to == null || to < 0 || to > 4 || foe.slots[to]) {
        throw new Error("Выбери соседнюю пустую клетку");
      }
      if (Math.abs(from - to) !== 1) {
        throw new Error("Только на соседнюю клетку");
      }
      foe.slots[to] = foe.slots[from];
      foe.slots[from] = null;
      logLine += `: сдвиг`;
      break;
    }
    case "buff": {
      const u = needAlly(opts.targetSlot);
      const n = nEpic(1, epic);
      u.attack += n;
      u.health += n;
      u.baseHealth += n;
      u.permAttack = (u.permAttack ?? 0) + n;
      u.permHealth = (u.permHealth ?? 0) + n;
      logLine += `: ${getCard(u.cardId).name} +${n}/+${n}`;
      break;
    }
    case "sprout": {
      const slot = opts.targetSlot;
      if (slot == null || slot < 0 || slot > 4 || you.slots[slot]) {
        throw new Error("Выбери пустую свою клетку");
      }
      you.slots[slot] = makeSproutToken();
      logLine += `: росток 1/1`;
      break;
    }
    default:
      throw new Error(`Умение «${def.name}» ещё не подключено`);
  }

  markUsed(you, def.id);
  next.log = [logLine, ...next.log].slice(0, 14);
  next.selectedHand = null;
  next.selectedSlot = null;
  return next;
}

/** Хук смерти юнита для пассивов жатвы / косы / маны смерти. */
export function onUnitKilled(
  state: BattleState,
  killerSidePlayer: PlayerState,
  other: PlayerState,
  deadSide: "you" | "enemy",
): void {
  const you = state.you;
  const foe = state.enemy;
  // Жатва: любой труп → +1 HP владельцу жатвы (оба могут иметь)
  for (const p of [you, foe]) {
    if (hasEquippedSkill(p, "harvest")) {
      p.hp = Math.min(p.maxHp, p.hp + 1);
      state.log = [`${p.name}: жатва +1 HP`, ...state.log].slice(0, 14);
    }
  }
  if (deadSide === "you") {
    if (hasEquippedSkill(you, "death_mana")) {
      you.mana.death = (you.mana.death ?? 0) + 1;
      state.log = [`${you.name}: смерть → +1 мана смерти`, ...state.log].slice(
        0,
        14,
      );
    }
  }
  if (deadSide === "enemy") {
    if (hasEquippedSkill(you, "scythe") || hasEquippedSkill(you, "kill_spark")) {
      foe.hp -= 1;
      state.log = [
        `${you.name}: коса/жар — враг −1 HP`,
        ...state.log,
      ].slice(0, 14);
    }
  }
  void killerSidePlayer;
  void other;
}

/** Пассивы в начале хода (тик маны школы уже в growMana). */
export function tickOracleSkillPassivesStart(
  p: PlayerState,
  foe: PlayerState,
  turn: number,
  log: string[],
): void {
  // Тихий хил / корни: каждый 2-й ход
  if (turn > 0 && turn % 2 === 0) {
    if (hasEquippedSkill(p, "quiet_heal") || hasEquippedSkill(p, "roots")) {
      p.hp = Math.min(p.maxHp, p.hp + 1);
      log.unshift(`${p.name}: тихий хил/корни +1 HP`);
    }
  }
  // Запас маны / прилив / тление: каждый 3-й ход
  if (turn > 0 && turn % 3 === 0) {
    if (hasEquippedSkill(p, "mana_drip") || hasEquippedSkill(p, "tide")) {
      p.mana[p.faction] = (p.mana[p.faction] ?? 0) + 1;
      log.unshift(`${p.name}: запас маны +1 ${p.faction}`);
    }
    if (hasEquippedSkill(p, "smolder")) {
      foe.hp -= 1;
      log.unshift(`${p.name}: тление — враг −1 HP`);
    }
  }
}

/** Пассивы конца своего хода. */
export function tickOracleSkillPassivesEnd(
  state: BattleState,
  p: PlayerState,
  log: string[],
): void {
  const allies = p.slots.filter(Boolean).length;
  if (hasEquippedSkill(p, "aura_heal") && allies >= 2) {
    p.hp = Math.min(p.maxHp, p.hp + 1);
    log.unshift(`${p.name}: аура +1 HP`);
  }
  if (hasEquippedSkill(p, "undead_near")) {
    const hasDeath = p.slots.some(
      (u) => u && getCard(u.cardId).school === "death",
    );
    if (hasDeath) {
      p.hp = Math.min(p.maxHp, p.hp + 1);
      log.unshift(`${p.name}: нежить рядом +1 HP`);
    }
  }
  if (hasEquippedSkill(p, "thicket") && allies >= 3) {
    for (const u of p.slots) {
      if (!u) continue;
      u.health += 1;
      u.baseHealth += 1;
      u.permHealth = (u.permHealth ?? 0) + 1;
    }
    log.unshift(`${p.name}: чаща +0/+1`);
  }
  if (hasEquippedSkill(p, "empty_sprout") && !p.oracleEmptySproutUsed) {
    const empty = p.slots.findIndex((s) => !s);
    if (empty >= 0) {
      p.oracleEmptySproutUsed = true;
      p.slots[empty] = makeSproutToken();
      log.unshift(`${p.name}: пустое место → росток`);
    }
  }
  if (hasEquippedSkill(p, "calm") && !p.oracleCalmUsed) {
    const foe = p.id === "you" ? state.enemy : state.you;
    let best = -1;
    let bestAtk = -1;
    foe.slots.forEach((u, i) => {
      if (!u || unitImmuneToOracleSkills(u)) return;
      if (u.attack > bestAtk) {
        bestAtk = u.attack;
        best = i;
      }
    });
    if (best >= 0) {
      p.oracleCalmUsed = true;
      const u = foe.slots[best]!;
      u.attack = Math.max(0, u.attack - 1);
      log.unshift(`${p.name}: затишье −1 ATK`);
    }
  }
  // Сброс «одна активка за ход»
  p.oracleActiveUsedThisTurn = false;
}

/** Старт боя: пассивы старта + лишняя карта / ростки. */
export function applyOracleSkillBattleStart(state: BattleState): void {
  for (const side of ["you", "enemy"] as const) {
    const p = state[side];
    const epic = getHero(p.heroId).tier === "epic";
    void epic;
    if (hasEquippedSkill(p, "blood_start") || hasEquippedSkill(p, "deal")) {
      p.hp = Math.max(1, p.hp - 2);
      p.mana[p.faction] = (p.mana[p.faction] ?? 0) + 2;
      state.log = [
        `${p.name}: кровавый старт/сделка −2 HP, +2 маны`,
        ...state.log,
      ].slice(0, 14);
    }
    if (hasEquippedSkill(p, "spark_start") || hasEquippedSkill(p, "seeds")) {
      p.mana[p.faction] = (p.mana[p.faction] ?? 0) + 1;
      state.log = [`${p.name}: искра/семена +1 мана`, ...state.log].slice(
        0,
        14,
      );
    }
    if (hasEquippedSkill(p, "extra_card")) {
      // добор уже сделан в createBattle — добавим ещё одну если колода есть
      if (p.deck.length) {
        p.hand.push(p.deck.shift()!);
        state.log = [`${p.name}: лишняя карта`, ...state.log].slice(0, 14);
      }
    }
    if (hasEquippedSkill(p, "wild_start")) {
      const empty = p.slots.findIndex((s) => !s);
      if (empty >= 0) {
        p.slots[empty] = makeSproutToken();
        state.log = [`${p.name}: дикий старт — росток`, ...state.log].slice(
          0,
          14,
        );
      }
    }
  }
}
