import {
  creatureGender,
  formatManaCost,
  getCard,
  isFemaleWarrior,
  manaCostTotal,
} from "./cards";
import { getHero } from "./heroes";
import { heavySpellCost } from "./battleRules";
import {
  addMana,
  canPay,
  growMana,
  manaSchoolOf,
  payMana,
  startingManaPool,
} from "./mana";
import {
  hasDeathScytheGift,
  natureGiftHp,
  orakulBattleHp,
  waterGiftStartMana,
} from "./oracleGifts";
import { alog } from "./actionLog";
import {
  abilityUnlockedAt,
  angelBuffAmount,
  bansheeStunTurns,
  berserkDecayAmount,
  berserkRageBonus,
  boneRexRangedWard,
  clampUpgradeLevel,
  colossusArmyShieldOnPlay,
  colossusManaOnPlay,
  crossbowRiposteHeroChance,
  defaultUpgradeLevel,
  gravediggerReviveBuff,
  gravediggerReviveLimit,
  hellRiderKillMana,
  hellRiderRangedWardChance,
  lichDrainAmount,
  lichHeroPoke,
  mageHealAmount,
  mechRefundManaOnDeath,
  necroSummonCount,
  paladinShieldTurns,
  paladinShieldsArmy,
  skeletonHasArrowWard,
  skeletonHasPack,
  spearmanIgnoresShield,
  tankSelfShieldOnPlay,
  upgradeAttackPattern,
  upgradeStatBonus,
  valkyrieFreeMove,
  aquiliteFreeMove,
  arbiterSelfBuff,
  arbiterSparesAllyLegend,
  archerHalfRiposte,
  balthazarSwapAtkLoss,
  basiliskGazeTurns,
  blackDragonLineBurn,
  cerberusCenterMul,
  clawfiendTideAlways,
  elfDoubleShot,
  entUsesBoardHp,
  fireGolemSplashBurn,
  goblinStealOnPlay,
  hornetTempPoison,
  ifritMeleeRetaliate,
  impHeroBurn,
  killGrowAtk,
  krakenWaterHpBonus,
  leprechaunAllyHeal,
  leprechaunHeroHeal,
  leshyCanTargetEnemy,
  mercenaryRiposteSplash,
  mermaidSleepTurns,
  motardoHeroBonus,
  orcKillStun,
  recruitDeathHeal,
  resolveSpellEffects,
  rogueStealEvery,
  scorpicoraFastPoison,
  spiderPoisonAmount,
  spiderShieldOnPlay,
  succubusSleepTurns,
  tritonAquiliteAura,
  trollRegen,
  unicornKeepAttackAfterBreak,
  unicornManaOnPlay,
  vampireCanOverheal,
  vampireGainsAtkOnBite,
  vampireHealAmount,
  velesHealOnPlay,
  velesNatureAuraHeal,
  wandererFreeMove,
  waterElementalSplash,
  waterGolemLifesteal,
  waterSpiritDrawOnKill,
  zombieDeathTrick,
  type CardUpgradeLevel,
} from "./cardUpgrades";
import { startManaBonus } from "./progression";
import type {
  AttackPattern,
  BattleState,
  CreatureAbility,
  CreatureInstance,
  Faction,
  LingeringSpell,
  ManaCost,
  PlayerState,
  Slot,
  SpellEffect,
} from "./types";

function battleUpgradeLevel(
  state: BattleState | null | undefined,
  side: "you" | "enemy",
  cardId: string,
): CardUpgradeLevel {
  const map =
    side === "you" ? state?.youCardUpgrades : state?.enemyCardUpgrades;
  const raw = map?.[cardId];
  if (raw == null) return defaultUpgradeLevel(cardId);
  return clampUpgradeLevel(raw);
}

function hostUpgradeLevel(
  host?: CreatureInstance | null,
  cardId?: string,
): CardUpgradeLevel {
  if (host?.upgradeLevel != null) return clampUpgradeLevel(host.upgradeLevel);
  return defaultUpgradeLevel(cardId ?? host?.cardId ?? "");
}

/** Стоимость карты с учётом правил боя (тяжёлые заклинания и т.п.). */
export function battleManaCost(
  state: BattleState,
  cardId: string,
): ManaCost {
  const card = getCard(cardId);
  let cost: ManaCost = { ...(card.manaCost ?? {}) };
  const caster = state.active === "you" ? state.you : state.enemy;
  const rules = state.rules;

  if (card.kind === "creature" && rules?.deathTax && card.school === "death") {
    cost = { ...cost, death: (cost.death ?? 0) + 1 };
  }
  if (card.kind === "creature" && rules?.creatureTax) {
    cost = heavySpellCost(cardId, cost, caster.faction);
  }
  if (card.kind === "spell" && rules?.heavySpells) {
    // «Доп. мана» / «Камни»: иначе +1 своей школы съедает весь прирост.
    const effects =
      card.spellEffects && card.spellEffects.length > 0
        ? card.spellEffects
        : cardId === "hero_mana"
          ? ([{ type: "gain_mana" as const, amount: 1 }] as SpellEffect[])
          : [];
    if (!isManaRampSpell(effects)) {
      cost = heavySpellCost(cardId, cost, caster.faction);
    }
  }
  return cost;
}

let uidSeq = 1;
function uid(): string {
  return `u${uidSeq++}`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Супер-умение карты. Если host.stripped — умения нет (атака остаётся). */
function abilityOf(
  cardId: string,
  host?: CreatureInstance | null,
): CreatureAbility | undefined {
  if (host?.stripped) return undefined;
  const ab = getCard(cardId).ability;
  if (!ab) return undefined;
  if (ab === "skeleton_pack") {
    return skeletonHasPack(hostUpgradeLevel(host, cardId))
      ? "skeleton_pack"
      : undefined;
  }
  const lv = hostUpgradeLevel(host, cardId);
  if (!abilityUnlockedAt(cardId, ab, lv)) return undefined;
  return ab;
}

function hasAbility(
  cardId: string,
  a: CreatureAbility,
  host?: CreatureInstance | null,
): boolean {
  if (host?.stripped) return false;
  const c = getCard(cardId);
  const listed = c.ability === a || (c.abilities ?? []).includes(a);
  if (!listed) return false;
  if (a === "skeleton_pack") {
    return skeletonHasPack(hostUpgradeLevel(host, cardId));
  }
  const lv = hostUpgradeLevel(host, cardId);
  return abilityUnlockedAt(cardId, a, lv);
}

function effectiveBase(c: CreatureInstance): { atk: number; hp: number } {
  return {
    atk:
      c.baseAttack +
      c.permAttack +
      (c.packBonus ?? 0) +
      (c.swarmBonus ?? 0),
    hp:
      c.baseHealth +
      c.permHealth +
      (c.packBonus ?? 0) +
      (c.auraHp ?? 0) +
      (c.schoolAuraHp ?? 0),
  };
}

function isHornet(
  cardId: string,
  host?: CreatureInstance | null,
): boolean {
  return (
    hasAbility(cardId, "hornet_pack", host) ||
    hasAbility(cardId, "hornet_queen_flex", host)
  );
}

/** Стая скелетов: 1-й = база, 2-й даёт всем +2/+2, 3-й ещё +2 и т.д. */
function syncSkeletonPack(p: PlayerState, log: string[]): void {
  const pack = p.slots
    .map((s, i) => ({ s, i }))
    .filter(
      (x): x is { s: CreatureInstance; i: number } =>
        !!x.s && abilityOf(x.s.cardId, x.s) === "skeleton_pack",
    );
  const bonus = Math.max(0, pack.length - 1) * 2;
  if (!pack.length) return;

  let changed = false;
  for (const { s } of pack) {
    const prev = s.packBonus ?? 0;
    const d = bonus - prev;
    if (d === 0) continue;
    s.packBonus = bonus;
    s.attack += d;
    s.health += d;
    changed = true;
  }
  if (changed) {
    log.unshift(`Стая скелетов ×${pack.length}: всем +${bonus}/+${bonus}`);
  }
}

/** Рой шершней (матка + воины): каждый доп. даёт всем шершням +2 ATK. */
function syncHornetPack(p: PlayerState, log: string[]): void {
  const pack = p.slots
    .map((s, i) => ({ s, i }))
    .filter(
      (x): x is { s: CreatureInstance; i: number } =>
        !!x.s && isHornet(x.s.cardId, x.s),
    );
  if (!pack.length) return;
  const bonus = Math.max(0, pack.length - 1) * 2;

  let changed = false;
  for (const { s } of pack) {
    const prev = s.swarmBonus ?? 0;
    const d = bonus - prev;
    if (d === 0) continue;
    s.swarmBonus = bonus;
    s.attack += d;
    changed = true;
  }
  if (changed) {
    log.unshift(
      bonus > 0
        ? `Рой шершней ×${pack.length}: всем +${bonus} ATK`
        : `Рой шершней: бонус атаки снят`,
    );
  }
}

/** Пока на поле water_tide — все водные союзники +3 к макс. и текущему HP. */
function syncWaterTide(p: PlayerState, log: string[]): void {
  const active = p.slots.some((s) => {
    if (!s || !hasAbility(s.cardId, "water_tide", s)) return false;
    const lv = hostUpgradeLevel(s, s.cardId);
    // L3 — всегда; L2 — только если ещё не бил в этот ход
    if (clawfiendTideAlways(lv)) return true;
    return s.canAttack;
  });
  const want = active ? 3 : 0;
  let gained = false;
  let lost = false;
  for (const s of p.slots) {
    if (!s) continue;
    const water = getCard(s.cardId).school === "water";
    const prev = s.auraHp ?? 0;
    const next = water ? want : 0;
    if (prev === next) continue;
    s.auraHp = next;
    s.health += next - prev;
    if (s.health < 1 && s.health + (prev - next) > 0) {
      /* убрали ауру — не убиваем юнита с 1 HP */
      s.health = Math.max(1, s.health);
    }
    if (next > prev) gained = true;
    if (next < prev) lost = true;
  }
  if (gained) log.unshift(`Прилив: водные существа +3 HP`);
  if (lost && !active) log.unshift(`Прилив спал`);
}

/** Тритон ур.3: всем акулитам +1/+1. */
function syncAquiliteAura(p: PlayerState, log: string[]): void {
  const boost = p.slots.some(
    (s) =>
      s &&
      s.cardId === "triton" &&
      tritonAquiliteAura(hostUpgradeLevel(s, s.cardId)),
  );
  const want = boost ? 1 : 0;
  let changed = false;
  for (const s of p.slots) {
    if (!s || s.cardId !== "aquilite") continue;
    const prevAtk = s.swarmBonus ?? 0;
    if (prevAtk !== want) {
      s.swarmBonus = want;
      s.attack += want - prevAtk;
      changed = true;
    }
    const prevHp = s.schoolAuraHp ?? 0;
    if (prevHp !== want) {
      s.schoolAuraHp = want;
      s.health += want - prevHp;
      if (s.health < 1) s.health = 1;
      changed = true;
    }
  }
  if (changed && boost) log.unshift(`Тритон: акулиты +1/+1`);
}

function syncBoardAuras(p: PlayerState, log: string[]): void {
  syncSkeletonPack(p, log);
  syncHornetPack(p, log);
  syncWaterTide(p, log);
  syncAquiliteAura(p, log);
}

/**
 * Конец хода: ATK к базе (затем снова вешаем «slow»).
 * HP больше не откатываем — раны остаются до хила / смерти / конца боя.
 * Замедление само по себе здесь НЕ снимаем — иначе «Замедлить врага»
 * сгорает до хода жертвы. Срок: expireSlow у владельца после его хода.
 */
function restoreSurvivors(p: PlayerState): void {
  for (let i = 0; i < p.slots.length; i++) {
    const s = p.slots[i];
    if (!s) continue;
    // Из последних сил: без резета ATK до конца боя
    if (s.noRestore || s.statuses.some((st) => st.type === "last_gasp")) {
      continue;
    }
    const base = effectiveBase(s);
    s.attack = base.atk;
    // Не лечим: только потолок, если база HP упала (ауры и т.п.)
    if (s.health > base.hp) s.health = base.hp;
    // устаревший флаг ответки больше не нужен при вечных ранах
    s.statuses = s.statuses.filter((st) => st.type !== "hold_wound");
    for (const st of s.statuses) {
      if (st.type === "slow") {
        s.attack = Math.max(0, s.attack - st.amount);
      }
    }
  }
}

/** Снять замедление после хода владельца (он уже успел/не успел бить ослабленным). */
function expireSlow(p: PlayerState): void {
  for (const s of p.slots) {
    if (!s) continue;
    if (!s.statuses.some((st) => st.type === "slow")) continue;
    s.statuses = s.statuses.filter((st) => st.type !== "slow");
    if (s.noRestore || s.statuses.some((st) => st.type === "last_gasp")) {
      continue;
    }
    const base = effectiveBase(s);
    s.attack = base.atk;
  }
}

/**
 * Яд в начале хода владельца: −N от текущего HP, затем сила +1
 * (1 → 2 → 3…), пока не снимут или цель не умрёт.
 */
function tickPoison(
  p: PlayerState,
  log: string[],
  state?: BattleState,
): void {
  for (let i = 0; i < p.slots.length; i++) {
    const s = p.slots[i];
    if (!s) continue;
    const poison = s.statuses.filter((st) => st.type === "poison");
    if (!poison.length) continue;
    const dmg = poison.reduce((sum, st) => sum + st.amount, 0);
    const steady = poison.every((st) => st.steady);
    const timed = poison.some((st) => st.turns != null);
    s.health -= dmg;
    if (s.health <= 0) {
      log.unshift(`${getCard(s.cardId).name} погибает от яда (−${dmg})`);
      removeIfDead(p, i, log, state);
    } else if (timed) {
      const kept: typeof s.statuses = s.statuses.filter(
        (st) => st.type !== "poison",
      );
      let leftMin = 99;
      for (const st of poison) {
        const left = Math.max(0, (st.turns ?? 1) - 1);
        if (left <= 0) continue;
        kept.push({
          type: "poison",
          amount: st.amount,
          ...(st.steady ? { steady: true } : {}),
          turns: left,
        });
        leftMin = Math.min(leftMin, left);
      }
      s.statuses = kept;
      if (leftMin < 99) {
        log.unshift(
          `${getCard(s.cardId).name}: яд −${dmg} → ${s.health} HP (ещё ${leftMin})`,
        );
      } else {
        log.unshift(
          `${getCard(s.cardId).name}: яд −${dmg} → ${s.health} HP (сошёл)`,
        );
      }
    } else if (steady) {
      s.statuses = s.statuses.filter((st) => st.type !== "poison");
      s.statuses.push({ type: "poison", amount: dmg, steady: true });
      log.unshift(
        `${getCard(s.cardId).name}: яд −${dmg} → ${s.health} HP (постоянно −${dmg})`,
      );
    } else {
      const fast = poison.some((st) => st.fast);
      const next = dmg + (fast ? 2 : 1);
      s.statuses = s.statuses.filter((st) => st.type !== "poison");
      s.statuses.push({
        type: "poison",
        amount: next,
        ...(fast ? { fast: true } : {}),
      });
      log.unshift(
        `${getCard(s.cardId).name}: яд −${dmg} → ${s.health} HP (далее −${next})`,
      );
    }
  }
}

function applyPoisonStatus(
  unit: CreatureInstance,
  amount: number,
  opts?: { steady?: boolean; turns?: number; fast?: boolean },
): void {
  unit.statuses.push({
    type: "poison",
    amount,
    ...(opts?.steady ? { steady: true } : {}),
    ...(opts?.turns != null ? { turns: opts.turns } : {}),
    ...(opts?.fast ? { fast: true } : {}),
  });
}

/** Горение: фиксированный урон amount, turns ходов (обновляет старый burn). */
function applyBurnStatus(
  unit: CreatureInstance,
  amount: number,
  turns: number,
): void {
  unit.statuses = unit.statuses.filter((st) => st.type !== "burn");
  unit.statuses.push({ type: "burn", amount, turns });
}

function applyHeroBurn(
  p: PlayerState,
  amount: number,
  turns: number,
  log: string[],
): void {
  p.heroBurn = { amount: Math.max(1, amount), turns: Math.max(1, turns) };
  log.unshift(`${p.name}: горит! −${amount} HP/ход, ${turns} хода`);
}

function tickHeroBurn(p: PlayerState, log: string[]): void {
  const b = p.heroBurn;
  if (!b) return;
  const dmg = Math.max(1, b.amount);
  p.hp -= dmg;
  const left = Math.max(0, (b.turns ?? 1) - 1);
  if (left <= 0) {
    p.heroBurn = undefined;
    log.unshift(`${p.name}: огонь −${dmg} HP (потух)`);
  } else {
    p.heroBurn = { amount: b.amount, turns: left };
    log.unshift(`${p.name}: огонь −${dmg} HP (ещё ${left})`);
  }
}

function tickBurn(
  p: PlayerState,
  log: string[],
  state?: BattleState,
): void {
  for (let i = 0; i < p.slots.length; i++) {
    const s = p.slots[i];
    if (!s) continue;
    const burn = s.statuses.find((st) => st.type === "burn");
    if (!burn) continue;
    const dmg = Math.max(1, burn.amount);
    s.health -= dmg;
    const left = Math.max(0, (burn.turns ?? 1) - 1);
    if (s.health <= 0) {
      log.unshift(`${getCard(s.cardId).name} сгорает (−${dmg})`);
      removeIfDead(p, i, log, state);
      continue;
    }
    if (left <= 0) {
      s.statuses = s.statuses.filter((st) => st.type !== "burn");
      log.unshift(
        `${getCard(s.cardId).name}: огонь −${dmg} → ${s.health} HP (потух)`,
      );
    } else {
      burn.turns = left;
      log.unshift(
        `${getCard(s.cardId).name}: огонь −${dmg} → ${s.health} HP (ещё ${left})`,
      );
    }
  }
}

function tickSchoolManaAura(p: PlayerState, log: string[]): void {
  const gained: Partial<Record<Faction, number>> = {};
  for (const s of p.slots) {
    if (!s || !hasAbility(s.cardId, "school_mana_aura", s)) continue;
    const school = getCard(s.cardId).school;
    if (school === "neutral") continue;
    addMana(p.mana, school, 1);
    gained[school] = (gained[school] ?? 0) + 1;
  }
  for (const [school, n] of Object.entries(gained)) {
    if (!n) continue;
    log.unshift(`Аура школы (${school}): +${n} маны`);
  }
}

function makePlayer(
  id: "you" | "enemy",
  name: string,
  deckIds: string[],
  heroId: string,
  opts?: { maxHp?: number; startManaBonus?: number; level?: number },
): PlayerState {
  const hero = getHero(heroId);
  const deck = shuffle(deckIds);
  const hand = deck.splice(0, 4);
  const bonus = opts?.startManaBonus ?? 0;
  const mana = startingManaPool(hero.faction, bonus);
  const maxHp = opts?.maxHp ?? hero.maxHp;
  return {
    id,
    name,
    heroId: hero.id,
    faction: hero.faction,
    level: Math.max(1, Math.min(50, opts?.level ?? 1)),
    hp: maxHp,
    maxHp,
    mana,
    deck,
    hand,
    slots: [null, null, null, null, null],
    graveyard: [],
    activeSpells: [],
    bonusDrawTurns: 0,
    revealEnemyHandTurns: 0,
    weakenDamageTurns: 0,
    muteRangedTurns: 0,
    attackBanSchool: null,
    attackBanTurns: 0,
  };
}

/** 50% щит: нечётный урон вниз (3→1, 5→2). */
function mitigatedDamage(raw: number, def: CreatureInstance): number {
  if (raw <= 0) return 0;
  if (def.statuses.some((st) => st.type === "bunker")) return 0;
  if (!def.statuses.some((st) => st.type === "shield")) return raw;
  return Math.floor(raw / 2);
}

/** Исходящий урон с учётом «Пыль в глаза». */
function outgoingDamage(owner: PlayerState, raw: number): number {
  if (raw <= 0) return 0;
  if (owner.weakenDamageTurns > 0) return Math.max(1, Math.floor(raw / 2));
  return raw;
}

/** Ищем стража на том же поле (слоты стороны подопечного). */
function findTankByUid(
  slots: Slot[],
  tankUid: string,
): CreatureInstance | null {
  for (const s of slots) {
    if (s?.uid === tankUid) return s;
  }
  return null;
}

function dealToCreature(
  def: CreatureInstance,
  raw: number,
  log: string[],
  allySlots?: Slot[],
  opts?: { ignoreShield?: boolean },
): number {
  // Страж: урон с подопечного уходит на того, кто «берёт удар»
  if (raw > 0 && def.guardedByUid && allySlots) {
    const tank = findTankByUid(allySlots, def.guardedByUid);
    if (tank && tank.uid !== def.uid && tank.health > 0) {
      log.unshift(
        `⛓ ${getCard(tank.cardId).name} принимает удар за ${getCard(def.cardId).name}`,
      );
      return dealToCreature(tank, raw, log, undefined, opts);
    }
  }
  const dealt = opts?.ignoreShield ? Math.max(0, raw) : mitigatedDamage(raw, def);
  def.health -= dealt;
  if (dealt !== raw) {
    log.unshift(
      opts?.ignoreShield
        ? `⚔ Прокол: полный урон ${dealt} по ${getCard(def.cardId).name}`
        : `🛡 Щит: ${raw} → ${dealt} урона по ${getCard(def.cardId).name}`,
    );
  } else if (opts?.ignoreShield && def.statuses.some((st) => st.type === "shield")) {
    log.unshift(
      `⚔ Прокол щита: ${dealt} по ${getCard(def.cardId).name}`,
    );
  }
  return dealt;
}

function findUnitByUid(
  state: BattleState,
  uid: string,
): { side: "you" | "enemy"; slot: number; unit: CreatureInstance } | null {
  for (const side of ["you", "enemy"] as const) {
    const slots = state[side].slots;
    for (let i = 0; i < slots.length; i++) {
      const u = slots[i];
      if (u?.uid === uid) return { side, slot: i, unit: u };
    }
  }
  return null;
}

/**
 * Снять длящееся заклинание → в сброс кастера.
 * Раньше untilCleared (яд) возвращался в руку — в стартовой колоде смерти
 * карта крутилась без конца («юзаю — хоп, снова в руке»).
 */
function reclaimLingeringSpell(
  state: BattleState,
  sp: LingeringSpell,
  boardFallback: PlayerState,
): void {
  const caster =
    sp.casterSide === "you" || sp.casterSide === "enemy"
      ? state[sp.casterSide]
      : boardFallback;
  caster.graveyard.push(sp.cardId);
}

function pruneLingering(state: BattleState): void {
  for (const side of ["you", "enemy"] as const) {
    const p = state[side];
    const keep: LingeringSpell[] = [];
    for (const sp of p.activeSpells) {
      // эхо снимает clearEchoSpells в конце хода
      if (sp.mode === "echo" || sp.kind === "echo") {
        keep.push(sp);
        continue;
      }
      if (sp.targetUid) {
        const live = findUnitByUid(state, sp.targetUid);
        if (!live) {
          reclaimLingeringSpell(state, sp, p);
          continue;
        }
        if (sp.kind === "poison") {
          if (!live.unit.statuses.some((st) => st.type === "poison")) {
            reclaimLingeringSpell(state, sp, p);
            continue;
          }
        }
        if (sp.kind === "shield") {
          if (!live.unit.statuses.some((st) => st.type === "shield")) {
            reclaimLingeringSpell(state, sp, p);
            continue;
          }
        }
        if (sp.kind === "guardian") {
          if (!sp.guardianUid) {
            reclaimLingeringSpell(state, sp, p);
            continue;
          }
          const tank = findUnitByUid(state, sp.guardianUid);
          if (!tank) {
            live.unit.guardedByUid = undefined;
            reclaimLingeringSpell(state, sp, p);
            continue;
          }
        }
        if (sp.kind === "traitor") {
          if (!live.unit.statuses.some((st) => st.type === "traitor")) {
            reclaimLingeringSpell(state, sp, p);
            continue;
          }
        }
      }
      if (sp.turnsLeft != null && sp.turnsLeft <= 0) {
        clearSpellEffectsOnBoard(state, sp);
        reclaimLingeringSpell(state, sp, p);
        continue;
      }
      keep.push(sp);
    }
    p.activeSpells = keep;
  }
}

/** Конец хода владельца: тик щита и сна на его существах. */
function tickEndOwnerEffects(p: PlayerState, log: string[]): void {
  for (const s of p.slots) {
    if (!s) continue;
    const shield = s.statuses.find((st) => st.type === "shield");
    if (shield) {
      shield.amount -= 1;
      if (shield.amount <= 0) {
        s.statuses = s.statuses.filter((st) => st.type !== "shield");
        log.unshift(`🛡 Щит с ${getCard(s.cardId).name} спал`);
      }
    }
  }
  for (const sp of p.activeSpells) {
    if (sp.kind === "shield" && sp.turnsLeft != null) {
      sp.turnsLeft -= 1;
    }
    // Чистое небо / пыль: тик в конце хода жертвы — иначе 1 ход спадает до её атак.
    if (
      (sp.kind === "mute_ranged" || sp.kind === "weaken") &&
      sp.turnsLeft != null
    ) {
      sp.turnsLeft -= 1;
    }
  }
  if (p.muteRangedTurns > 0) {
    p.muteRangedTurns -= 1;
    if (p.muteRangedTurns <= 0) {
      log.unshift(`${p.name}: чистое небо — стрелки снова могут бить`);
    }
  }
  if (p.weakenDamageTurns > 0) {
    p.weakenDamageTurns -= 1;
    if (p.weakenDamageTurns <= 0) {
      log.unshift(`${p.name}: пыль в глаза спала — урон полный`);
    }
  }
}

function canPhysicallyAttack(
  attackerId: string,
  defenderId: string,
  defender?: CreatureInstance | null,
): boolean {
  // Сукуб: мужчины не бьют, только женщины (или магия — не сюда)
  if (abilityOf(defenderId, defender) === "succubus_flex") {
    if (creatureGender(attackerId) === "male") return false;
  }
  return true;
}

export function createBattle(
  yourDeck: string[],
  enemyDeck: string[],
  yourHeroId = "hero_life",
  enemyHeroId = "hero_hell",
  yourName = "Ты",
  yourLevel = 1,
  enemyLevel = yourLevel,
  firstActive: "you" | "enemy" = "you",
): BattleState {
  uidSeq = 1;
  const youHero = getHero(yourHeroId);
  const enemyHero = getHero(enemyHeroId);
  const youHp = orakulBattleHp(youHero.faction, yourLevel, youHero.tier);
  const enemyHp = orakulBattleHp(
    enemyHero.faction,
    enemyLevel,
    enemyHero.tier,
  );
  const youEpic = youHero.tier === "epic" ? 1 : 0;
  const enemyEpic = enemyHero.tier === "epic" ? 1 : 0;
  const youWater =
    youEpic && youHero.faction === "water"
      ? waterGiftStartMana(yourLevel)
      : 0;
  const enemyWater =
    enemyEpic && enemyHero.faction === "water"
      ? waterGiftStartMana(enemyLevel)
      : 0;
  const you = makePlayer("you", yourName, yourDeck, yourHeroId, {
    maxHp: youHp,
    startManaBonus: startManaBonus(yourLevel) + youEpic + youWater,
    level: yourLevel,
  });
  const enemy = makePlayer("enemy", "Соперник", enemyDeck, enemyHeroId, {
    maxHp: enemyHp,
    // Те же правила, что у игрока: уровень + эпик + дар воды. Без «+1 боту».
    startManaBonus: startManaBonus(enemyLevel) + enemyEpic + enemyWater,
    level: enemyLevel,
  });
  const youNatureNote =
    youEpic &&
    youHero.faction === "nature" &&
    natureGiftHp(yourLevel) > 0
      ? `, дар рощи +${natureGiftHp(yourLevel)} HP`
      : "";
  const youWaterNote =
    youWater > 0 ? `, дар пучины +${youWater} маны` : "";
  const youDeathNote =
    youEpic && youHero.faction === "death"
      ? `, дар косы (смерть юнита death → +1 мана death / ход)`
      : "";
  const battle: BattleState = {
    turn: 1,
    active: firstActive,
    you,
    enemy,
    calmTurnsLeft: 0,
    bloodFrenzy: 0,
    aiLevel: enemyLevel,
    log: [
      `Оракулы: ${yourName} (${youHero.name}, ур.${yourLevel}, ${youHp} HP${youNatureNote}${youWaterNote}${youDeathNote}) vs ${enemyHero.name} (ур.${enemyLevel}, ${enemyHp} HP).`,
      `🩸 Буйство крови после ${BLOOD_FRENZY_AFTER_TURNS} циклов или когда колоды иссякнут.`,
    ],
    winner: null,
    selectedHand: null,
    selectedSlot: null,
  };
  alog("engine", "createBattle", {
    yourHeroId,
    enemyHeroId,
    yourLevel,
    enemyLevel,
    firstActive,
    youCards: yourDeck.length,
    enemyCards: enemyDeck.length,
  });
  return battle;
}

/** Лимит руки: при крутящейся колоде 7 жирно, 5 — выбор без голода. */
export const MAX_HAND_SIZE = 5;

/** После стольких циклов ходов (turn > N) начинается буйство крови. */
export const BLOOD_FRENZY_AFTER_TURNS = 20;

/** Нечего добирать: колода и грейв пусты. */
function pilesEmpty(p: PlayerState): boolean {
  return p.deck.length === 0 && p.graveyard.length === 0;
}

/**
 * «Колоды иссякли» для буйства крови.
 * Важно:
 * — старт короткой колоды (все в руке, колода 0) — НЕ иссякание;
 * — все карты выложены существами на стол — тоже НЕ иссякание
 *   (иначе дуэль на 4–8 картах включает буйство через пару ходов).
 */
function cardsExhausted(p: PlayerState): boolean {
  if (!pilesEmpty(p) || p.hand.length > 0) return false;
  if (p.slots.some((u) => !!u)) return false;
  return true;
}

function bloodFrenzyThreshold(state: BattleState): number {
  return state.rules?.bloodFrenzyAfter ?? BLOOD_FRENZY_AFTER_TURNS;
}

function shouldStartBloodFrenzy(state: BattleState): boolean {
  if (state.bloodFrenzy > 0 || state.winner) return false;
  if (state.turn > bloodFrenzyThreshold(state)) return true;
  return cardsExhausted(state.you) || cardsExhausted(state.enemy);
}

/** Запуск режима: оба оракула сразу получают первый удар (−1). */
function armBloodFrenzy(state: BattleState, reason: string): void {
  if (state.bloodFrenzy > 0) return;
  state.bloodFrenzy = 1;
  state.log = [`🩸 Буйство крови! ${reason}`, ...state.log].slice(0, 12);
  tickBloodFrenzy(state);
}

/** Один цикл буйства: оба −N HP, затем N+1 на следующий цикл. */
function tickBloodFrenzy(state: BattleState): void {
  if (state.bloodFrenzy <= 0 || state.winner) return;
  const dmg = state.bloodFrenzy;
  state.you.hp -= dmg;
  state.enemy.hp -= dmg;
  state.log = [
    `🩸 Буйство крови: оракулы −${dmg} HP (далее −${dmg + 1})`,
    ...state.log,
  ].slice(0, 12);
  state.bloodFrenzy = dmg + 1;
  checkWinner(state);
}

function draw(p: PlayerState, n = 1, state?: BattleState): void {
  for (let i = 0; i < n; i++) {
    if (p.deck.length === 0) {
      // Грейв → колода. Если пусто — просто нет добора.
      // Буйство крови стартует в end*Turn через shouldStartBloodFrenzy
      // (с учётом руки — короткая стартовая колода не считается «иссякшей»).
      if (p.graveyard.length > 0) {
        p.deck = shuffle(p.graveyard);
        p.graveyard = [];
      } else {
      continue;
    }
    }
    // Рука полна → карта с колоды сгорает в грейв, в руке не появляется
    if (p.hand.length >= MAX_HAND_SIZE) {
      const burned = p.deck.shift()!;
      p.graveyard.push(burned);
      if (state) {
        state.log = [
          `${p.name}: рука полна — ${getCard(burned).name} сразу в грейв`,
          ...state.log,
        ].slice(0, 12);
      }
      continue;
    }
    p.hand.push(p.deck.shift()!);
  }
}

function checkWinner(state: BattleState): void {
  const youDead = state.you.hp <= 0;
  const enemyDead = state.enemy.hp <= 0;
  if (youDead && enemyDead) {
    // Одновременная смерть (буйство крови и т.п.): выше HP побеждает;
    // при равенстве — не засчитываем ложную победу игроку.
    state.winner = state.you.hp > state.enemy.hp ? "you" : "enemy";
    return;
  }
  if (youDead) state.winner = "enemy";
  else if (enemyDead) state.winner = "you";
}

function spawnCreature(
  cardId: string,
  rules?: BattleState["rules"] | null,
  upgradeLevel?: CardUpgradeLevel,
): CreatureInstance {
  const c = getCard(cardId);
  const up = clampUpgradeLevel(
    upgradeLevel ?? defaultUpgradeLevel(cardId),
  );
  const bonus = upgradeStatBonus(cardId, up);
  let atk = (c.attack ?? 0) + bonus.atk;
  let hp = (c.health ?? 1) + bonus.hp;
  let permAttack = 0;
  let permHealth = 0;
  if (rules?.undeadSurge && c.school === "death") {
    atk += 1;
    hp += 1;
    permAttack += 1;
    permHealth += 1;
  }
  if (rules?.undeadWane && c.school === "death") {
    atk = Math.max(0, atk - 1);
    hp = Math.max(1, hp - 1);
    permAttack -= 1;
    permHealth -= 1;
  }
  if (rules?.lifeBloom && c.school === "life") {
    hp += 1;
    permHealth += 1;
  }
  if (rules?.emberEdge && c.school === "hell") {
    atk += 1;
    permAttack += 1;
  }
  if (rules?.tideSkin && c.school === "water") {
    hp += 1;
    permHealth += 1;
  }
  if (rules?.wildFang && c.school === "nature") {
    atk += 1;
    permAttack += 1;
  }
  if (rules?.ironBoard) {
    hp += 1;
  }
  if (rules?.fragileBoard) {
    hp = Math.max(1, hp - 1);
  }
  const unit: CreatureInstance = {
    uid: uid(),
    cardId,
    baseAttack: (c.attack ?? 0) + bonus.atk,
    baseHealth: Math.max(
      1,
      (c.health ?? 1) +
        bonus.hp -
        (rules?.fragileBoard ? 1 : 0) +
        (rules?.ironBoard ? 1 : 0),
    ),
    permAttack,
    permHealth,
    packBonus: 0,
    swarmBonus: 0,
    attack: atk,
    health: hp,
    canAttack: false,
    statuses: [],
    upgradeLevel: up,
  };
  // rush смотрим после upgradeLevel на инстансе
  unit.canAttack = hasAbility(cardId, "rush", unit);
  return unit;
}

/** Вампир: после укуса лечит 5 HP, не выше своего максимума. */
function tryVampireGrow(
  owner: PlayerState,
  fromSlot: number,
  log: string[],
): void {
  const u = owner.slots[fromSlot];
  if (!u || abilityOf(u.cardId, u) !== "vampire_grow") return;
  const lv = hostUpgradeLevel(u, u.cardId);
  const heal = vampireHealAmount(lv);
  const base = effectiveBase(u);
  const before = u.health;
  const cap = vampireCanOverheal(lv) ? base.hp + heal : base.hp;
  u.health = Math.min(cap, u.health + heal);
  const gained = u.health - before;
  if (vampireGainsAtkOnBite(lv)) {
    u.permAttack += 1;
    u.attack += 1;
    u.baseAttack += 1;
  }
  if (gained > 0 || vampireGainsAtkOnBite(lv)) {
    log.unshift(
      `${getCard(u.cardId).name}: укус +${gained} HP${
        vampireGainsAtkOnBite(lv) ? " +1 атк" : ""
      } → ${u.attack}/${u.health}`,
    );
  } else {
    log.unshift(
      `${getCard(u.cardId).name}: укус — уже полный запас (${u.health} HP)`,
    );
  }
}

/** Награда за убийство (адский гонщик / дух воды и т.п.). */
function tryKillRewards(
  killer: CreatureInstance | null | undefined,
  killerOwner: PlayerState,
  victimDead: boolean,
  log: string[],
  state?: BattleState,
): void {
  if (!victimDead || !killer) return;
  if (killer.cardId === "hell_rider") {
    const lv = hostUpgradeLevel(killer, killer.cardId);
    const mode = hellRiderKillMana(lv);
    const school =
      mode === "death" ? "death" : getCard(killer.cardId).school;
    if (school === "neutral") {
      addMana(killerOwner.mana, "death", 1);
      log.unshift(`${getCard(killer.cardId).name}: убийство +1 мана смерти`);
    } else {
      addMana(killerOwner.mana, school, 1);
      log.unshift(
        `${getCard(killer.cardId).name}: убийство +1 мана (${school})`,
      );
    }
  }
  if (
    killer.cardId === "water_spirit" &&
    waterSpiritDrawOnKill(hostUpgradeLevel(killer, killer.cardId))
  ) {
    draw(killerOwner, 1, state);
    log.unshift(`${getCard(killer.cardId).name}: убийство — добор 1`);
  }
  {
    const gain = killGrowAtk(
      killer.cardId,
      hostUpgradeLevel(killer, killer.cardId),
    );
    if (gain > 0) {
      killer.permAttack += gain;
      killer.attack += gain;
      killer.baseAttack += gain;
      log.unshift(
        `${getCard(killer.cardId).name}: убийство +${gain} ATK → ${killer.attack}`,
      );
    }
  }
}

function patternOf(
  cardId: string,
  host?: CreatureInstance | null,
): AttackPattern {
  const base = getCard(cardId).attackPattern ?? "melee";
  return upgradeAttackPattern(
    cardId,
    hostUpgradeLevel(host, cardId),
    base,
  );
}

/** Исходящий ATK с учётом ярости берсерка ур.3. */
function strikePower(atk: CreatureInstance): number {
  const rage = berserkRageBonus(
    hostUpgradeLevel(atk, atk.cardId),
    atk.health,
    effectiveBase(atk).hp,
  );
  return atk.attack + rage;
}

function strikeIgnoreShield(atk: CreatureInstance): boolean {
  return (
    atk.cardId === "spearman" &&
    spearmanIgnoresShield(hostUpgradeLevel(atk, atk.cardId))
  );
}

function cleaveSlots(center: number): number[] {
  const out = [center];
  if (center - 1 >= 0) out.push(center - 1);
  if (center + 1 <= 4) out.push(center + 1);
  return out;
}

/** Страх: нельзя бить существ запрещённой школы. */
function isAttackBanned(
  attacker: PlayerState,
  targetCardId: string,
): boolean {
  if (!attacker.attackBanSchool || attacker.attackBanTurns <= 0) return false;
  return getCard(targetCardId).school === attacker.attackBanSchool;
}

/** Валидные цели для атаки из своего слота fromSlot */
export function validAttackTargets(
  state: BattleState,
  fromSlot: number,
): Array<"hero" | number> {
  const atk = state.you.slots[fromSlot];
  if (!atk || !atk.canAttack) return [];
  const pattern = patternOf(atk.cardId, atk);
  const foe = state.enemy.slots;
  const me = state.you;
  const targets: Array<"hero" | number> = [];
  const okUnit = (t: CreatureInstance) =>
    canPhysicallyAttack(atk.cardId, t.cardId, t) && !isAttackBanned(me, t.cardId);

  if (pattern === "melee") {
    if (foe[fromSlot] && okUnit(foe[fromSlot]!)) {
      targets.push(fromSlot);
    } else if (!foe[fromSlot]) {
      targets.push("hero");
    }
    return targets;
  }

  if (pattern === "melee_lane3") {
    for (const i of cleaveSlots(fromSlot)) {
      const t = foe[i];
      if (t && okUnit(t)) targets.push(i);
    }
    if (!targets.length) targets.push("hero");
    return targets;
  }

  if (pattern === "aoe_all") {
    foe.forEach((s, i) => {
      if (s && okUnit(s)) targets.push(i);
    });
    if (!targets.length) targets.push("hero");
    return targets;
  }

  if (pattern === "ranged" || atk.statuses.some((st) => st.type === "sniper")) {
    foe.forEach((s, i) => {
      if (s && okUnit(s)) targets.push(i);
    });
    targets.push("hero");
    return targets;
  }

  // lane_cleave3 — только тройка напротив своего слота (цербер)
  if (pattern === "lane_cleave3") {
    for (const i of cleaveSlots(fromSlot)) {
      const t = foe[i];
      if (t && okUnit(t)) targets.push(i);
    }
    if (!targets.length) targets.push("hero");
    return targets;
  }

  // cleave3 — любая цель как центр дыхания (+ соседи)
  foe.forEach((s, i) => {
    if (s && okUnit(s)) targets.push(i);
  });
  if (!foe[fromSlot]) targets.push("hero");
  return targets;
}

function tryDeathScytheGift(
  state: BattleState,
  owner: PlayerState,
  deadCardId: string,
  log: string[],
): void {
  if (getCard(deadCardId).school !== "death") return;
  let hero;
  try {
    hero = getHero(owner.heroId);
  } catch {
    return;
  }
  if (!hasDeathScytheGift(hero.faction, hero.tier)) return;
  const stamp = state.deathGiftStamp ?? {};
  if (stamp[owner.id] === state.turn) return;
  stamp[owner.id] = state.turn;
  state.deathGiftStamp = stamp;
  addMana(owner.mana, "death", 1);
  log.unshift(`Дар косы: +1 мана смерти`);
}

function removeIfDead(
  owner: PlayerState,
  slot: number,
  log: string[],
  state?: BattleState,
  opts?: { killer?: CreatureInstance | null },
): void {
  const s = owner.slots[slot];
  if (!s) return;
  if (s.health > 0) return;
  const deadUid = s.uid;
  const deadCardId = s.cardId;
  const lv = hostUpgradeLevel(s, deadCardId);

  // Зомби ур.3: яд убийце, иначе труп 1 HP
  if (
    deadCardId === "zombie" &&
    zombieDeathTrick(lv) &&
    !s.isCorpse
  ) {
    const killer = opts?.killer;
    if (killer && killer.health > 0) {
      applyPoisonStatus(killer, 1, { steady: true });
      log.unshift(
        `${getCard(deadCardId).name}: предсмертный яд на ${getCard(killer.cardId).name}`,
      );
    } else {
      s.health = 1;
      s.attack = 0;
      s.baseAttack = 0;
      s.canAttack = false;
      s.stripped = true;
      s.isCorpse = true;
      log.unshift(`${getCard(deadCardId).name}: остался труп (1 HP)`);
      return;
    }
  }

  const paid = s.paidMana;
  const refund =
    deadCardId === "mech_guardian" &&
    mechRefundManaOnDeath(lv) &&
    paid;
  const recruitHeal = recruitDeathHeal(lv);
  if (deadCardId === "recruit" && recruitHeal > 0) {
    owner.hp = Math.min(owner.maxHp, owner.hp + recruitHeal);
    log.unshift(
      `${getCard(deadCardId).name}: героизм — герой +${recruitHeal} HP`,
    );
  }
  log.unshift(`${getCard(deadCardId).name} уничтожен`);
  owner.graveyard.push(deadCardId);
  owner.slots[slot] = null;
  if (refund) {
    for (const [f, n] of Object.entries(paid)) {
      if (n && n > 0) addMana(owner.mana, f as Faction, n);
    }
    log.unshift(
      `${getCard(deadCardId).name}: мана возвращена (${formatManaCost(paid)})`,
    );
  }
  syncBoardAuras(owner, log);
  if (state) {
    clearBondsForUnit(state, deadUid);
    tryDeathScytheGift(state, owner, deadCardId, log);
  } else {
    for (const u of owner.slots) {
      if (u?.guardedByUid === deadUid) u.guardedByUid = undefined;
    }
  }
}

/**
 * Ответный выстрел: жертва удара (если жива и ability riposte)
 * сразу бьёт атакующего. Не тратит её «ход атаки».
 */
function tryRiposte(
  defenderOwner: PlayerState,
  attackerOwner: PlayerState,
  attackerSlot: number,
  victim: CreatureInstance,
  log: string[],
  state?: BattleState,
): void {
  if (victim.health <= 0) return;
  if (!hasAbility(victim.cardId, "riposte", victim)) return;
  const atk = attackerOwner.slots[attackerSlot];
  if (!atk || atk.health <= 0) return;
  if (!canPhysicallyAttack(victim.cardId, atk.cardId, atk)) {
    log.unshift(
      `${getCard(victim.cardId).name}: ответный выстрел не достаёт ${getCard(atk.cardId).name}`,
    );
    return;
  }
  const lv = hostUpgradeLevel(victim, victim.cardId);
  let power = victim.attack;
  if (victim.cardId === "archer" && archerHalfRiposte(lv)) {
    power = Math.max(1, Math.floor(victim.attack / 2));
  }
  const dmg = dealToCreature(
    atk,
    outgoingDamage(defenderOwner, power),
    log,
    attackerOwner.slots,
  );
  log.unshift(
    `${getCard(victim.cardId).name}: ответный выстрел по ${getCard(atk.cardId).name} на ${dmg} → ${Math.max(0, atk.health)} HP`,
  );
  if (
    victim.cardId === "mercenary" &&
    mercenaryRiposteSplash(lv)
  ) {
    for (const i of [attackerSlot - 1, attackerSlot + 1]) {
      if (i < 0 || i > 4) continue;
      const n = attackerOwner.slots[i];
      if (!n || n.health <= 0) continue;
      const splash = Math.max(1, Math.floor(power / 2));
      dealToCreature(n, splash, log, attackerOwner.slots);
      log.unshift(
        `${getCard(victim.cardId).name}: задела ${getCard(n.cardId).name} (−${splash})`,
      );
      removeIfDead(attackerOwner, i, log, state);
    }
  }
  for (let i = 0; i < attackerOwner.slots.length; i++) {
    removeIfDead(attackerOwner, i, log, state);
  }
  const heroChance = crossbowRiposteHeroChance(lv);
  if (heroChance > 0 && Math.random() < heroChance) {
    const poke = Math.max(1, Math.floor(victim.attack / 2));
    attackerOwner.hp -= poke;
    log.unshift(
      `${getCard(victim.cardId).name}: ответка задела героя (−${poke})`,
    );
  }
}

/** Кто реально получил урон (учёт стража). */
function resolveHitVictim(
  def: CreatureInstance,
  defHpBefore: number,
  defenderOwner: PlayerState,
  tankHpBefore: number | null,
): CreatureInstance | null {
  const tank = def.guardedByUid
    ? findTankByUid(defenderOwner.slots, def.guardedByUid)
    : null;
  if (
    tank &&
    tankHpBefore != null &&
    tank.health < tankHpBefore
  ) {
    return tank.health > 0 ? tank : null;
  }
  if (def.health < defHpBefore) {
    return def.health > 0 ? def : null;
  }
  return null;
}

/**
 * Ближний бой: бьёт только атакующий (инициатива хода).
 * Убил — цели нет, ответки нет. Выжила — ответит уже в свой ход
 * (кроме ability riposte — ответ сразу).
 * Боевой урон остаётся на карте до хила или смерти.
 */
function meleeStrike(
  attackerOwner: PlayerState,
  defenderOwner: PlayerState,
  fromSlot: number,
  toSlot: number,
  log: string[],
  state?: BattleState,
): void {
  const atk = attackerOwner.slots[fromSlot];
  const def = defenderOwner.slots[toSlot];
  if (!atk || !def) return;

  if (!canPhysicallyAttack(atk.cardId, def.cardId, def)) {
    log.unshift(
      `${getCard(def.cardId).name} недоступна для атаки ${getCard(atk.cardId).name}`,
    );
    return;
  }
  const defHpBefore = def.health;
  const tank = def.guardedByUid
    ? findTankByUid(defenderOwner.slots, def.guardedByUid)
    : null;
  const tankHpBefore = tank?.health ?? null;
  const power = strikePower(atk);
  const aDmg = dealToCreature(
    def,
    outgoingDamage(attackerOwner, power),
    log,
    defenderOwner.slots,
    { ignoreShield: strikeIgnoreShield(atk) },
  );
  atk.canAttack = false;

  log.unshift(
    `${getCard(atk.cardId).name} бьёт ${getCard(def.cardId).name} на ${aDmg} → ${Math.max(0, def.health)} HP`,
  );

  applyOnHitExtras(atk, def, attackerOwner, defenderOwner, log);
  const victim = resolveHitVictim(def, defHpBefore, defenderOwner, tankHpBefore);
  const defWasAlive = defHpBefore > 0;
  for (let i = 0; i < defenderOwner.slots.length; i++) {
    removeIfDead(defenderOwner, i, log, state, { killer: atk });
  }
  const after = defenderOwner.slots[toSlot];
  const victimDead =
    defWasAlive &&
    (!after || after.uid !== def.uid || after.isCorpse === true);
  tryKillRewards(atk, attackerOwner, victimDead, log, state);
  if (victimDead) {
    tryOrcKillStun(atk, defenderOwner, toSlot, log);
  }
  tryWaterOnHit(atk, attackerOwner, defenderOwner, toSlot, aDmg, log, state);
  tryHellOnHit(atk, defenderOwner, toSlot, log, state);
  tryIfritRetaliate(def, atk, log);
  if (victim && victim.health > 0) {
    tryRiposte(defenderOwner, attackerOwner, fromSlot, victim, log, state);
  }
  tryVampireGrow(attackerOwner, fromSlot, log);
  if (hasAbility(atk.cardId, "water_tide", atk)) {
    syncWaterTide(attackerOwner, log);
  }
}

/** Голем хил / элементаль splash после удара. */
function tryWaterOnHit(
  atk: CreatureInstance,
  _attackerOwner: PlayerState,
  defenderOwner: PlayerState,
  toSlot: number,
  dealt: number,
  log: string[],
  state?: BattleState,
): void {
  const lv = hostUpgradeLevel(atk, atk.cardId);
  const heal = waterGolemLifesteal(lv);
  if (atk.cardId === "water_golem" && heal > 0) {
    const before = atk.health;
    atk.health = Math.min(effectiveBase(atk).hp, atk.health + heal);
    const g = atk.health - before;
    if (g > 0) {
      log.unshift(`${getCard(atk.cardId).name}: прилив сил +${g} HP`);
    }
  }
  if (
    atk.cardId === "water_elemental" &&
    waterElementalSplash(lv) &&
    dealt > 0
  ) {
    const splash = Math.max(1, Math.floor(dealt / 2));
    for (const i of [toSlot - 1, toSlot + 1]) {
      if (i < 0 || i > 4) continue;
      const n = defenderOwner.slots[i];
      if (!n) continue;
      dealToCreature(n, splash, log, defenderOwner.slots);
      log.unshift(
        `${getCard(atk.cardId).name}: всплеск −${splash} ${getCard(n.cardId).name}`,
      );
      removeIfDead(defenderOwner, i, log, state, { killer: atk });
    }
  }
}

/** Орк ур.3: при убийстве оглушает соседа цели. */
function tryOrcKillStun(
  atk: CreatureInstance,
  defenderOwner: PlayerState,
  deadSlot: number,
  log: string[],
): void {
  if (atk.cardId !== "orc") return;
  if (!orcKillStun(hostUpgradeLevel(atk, atk.cardId))) return;
  for (const i of [deadSlot - 1, deadSlot + 1]) {
    if (i < 0 || i > 4) continue;
    const n = defenderOwner.slots[i];
    if (!n || n.health <= 0) continue;
    n.canAttack = false;
    n.statuses = n.statuses.filter((st) => st.type !== "sleep");
    n.statuses.push({ type: "sleep", amount: 1 });
    log.unshift(
      `${getCard(atk.cardId).name}: рёв оглушает ${getCard(n.cardId).name}`,
    );
    break;
  }
}

/** Голем ада: сосед цели тоже чуть горит. */
function tryHellOnHit(
  atk: CreatureInstance,
  defenderOwner: PlayerState,
  toSlot: number,
  log: string[],
  _state?: BattleState,
): void {
  const lv = hostUpgradeLevel(atk, atk.cardId);
  if (atk.cardId !== "fire_golem" || !fireGolemSplashBurn(lv)) return;
  for (const i of [toSlot - 1, toSlot + 1]) {
    if (i < 0 || i > 4) continue;
    const n = defenderOwner.slots[i];
    if (!n || n.health <= 0) continue;
    applyBurnStatus(n, 2, 2);
    log.unshift(
      `${getCard(atk.cardId).name}: жар − сосед ${getCard(n.cardId).name} горит`,
    );
  }
}

/** Ифрит ур.3: рукопашный атакующий загорается. */
function tryIfritRetaliate(
  def: CreatureInstance,
  atk: CreatureInstance,
  log: string[],
): void {
  if (def.cardId !== "ifrit" || def.health <= 0) return;
  if (!ifritMeleeRetaliate(hostUpgradeLevel(def, def.cardId))) return;
  if (atk.health <= 0) return;
  applyBurnStatus(atk, 2, 2);
  log.unshift(
    `${getCard(def.cardId).name}: ответный огонь — ${getCard(atk.cardId).name} горит`,
  );
}

function tryStealMana(
  thief: PlayerState,
  victim: PlayerState,
  log: string[],
): void {
  const factions = (["water", "hell", "death", "life", "nature"] as const).filter(
    (f) => (victim.mana[f] ?? 0) > 0,
  );
  if (!factions.length) {
    log.unshift(`${thief.name}: нечего красть — у врага нет маны`);
    return;
  }
  const f = factions[Math.floor(Math.random() * factions.length)]!;
  victim.mana[f] -= 1;
  addMana(thief.mana, f, 1);
  log.unshift(`${thief.name}: разбойник украл 1 ману (${f})`);
}

/** Яд скорпикоры / кража маны разбойника после удара. */
function applyOnHitExtras(
  atk: CreatureInstance,
  def: CreatureInstance | null,
  attackerOwner: PlayerState,
  defenderOwner: PlayerState,
  log: string[],
): void {
  if (def && def.health > 0 && hasAbility(atk.cardId, "scorpion_poison", atk)) {
    const fast = scorpicoraFastPoison(
      hostUpgradeLevel(atk, atk.cardId),
    );
    if (!def.statuses.some((st) => st.type === "poison")) {
      applyPoisonStatus(def, 1, fast ? { fast: true } : undefined);
    }
    log.unshift(
      fast
        ? `${getCard(def.cardId).name}: яд скорпикоры (−1, растёт быстрее)`
        : `${getCard(def.cardId).name}: яд скорпикоры (−1 в начале хода, растёт)`,
    );
  }
  if (def && def.health > 0 && hasAbility(atk.cardId, "spider_poison", atk)) {
    const amt = spiderPoisonAmount(hostUpgradeLevel(atk, atk.cardId));
    if (!def.statuses.some((st) => st.type === "poison")) {
      applyPoisonStatus(def, amt, { steady: true });
    }
    log.unshift(
      `${getCard(def.cardId).name}: яд паука (−${amt}/ход, пока не снимут)`,
    );
  }
  if (
    def &&
    def.health > 0 &&
    atk.cardId === "hornet_warrior" &&
    hornetTempPoison(hostUpgradeLevel(atk, atk.cardId))
  ) {
    if (!def.statuses.some((st) => st.type === "poison")) {
      applyPoisonStatus(def, 1, { steady: true, turns: 2 });
      log.unshift(
        `${getCard(def.cardId).name}: жало шершня (−1/ход, 2 хода)`,
      );
    }
  }
  if (def && def.health > 0 && hasAbility(atk.cardId, "flame_burn", atk)) {
    applyBurnStatus(def, 3, 3);
    log.unshift(
      `${getCard(def.cardId).name}: горит! −3 HP/ход, 3 хода`,
    );
  }
  if (def && def.health > 0 && hasAbility(atk.cardId, "basilisk_gaze", atk)) {
    const turns = basiliskGazeTurns(hostUpgradeLevel(atk, atk.cardId));
    def.canAttack = false;
    def.statuses = def.statuses.filter((st) => st.type !== "sleep");
    def.statuses.push({ type: "sleep", amount: turns });
    log.unshift(
      `${getCard(atk.cardId).name} окаменяет ${getCard(def.cardId).name} на ${turns} ход.`,
    );
  }
  if (
    hasAbility(atk.cardId, "mana_steal", atk) &&
    atk.cardId !== "rogue" &&
    Math.random() < 0.3
  ) {
    tryStealMana(attackerOwner, defenderOwner, log);
  }
  if (hasAbility(atk.cardId, "imp_burn", atk)) {
    const poke = impHeroBurn(
      atk.cardId,
      hostUpgradeLevel(atk, atk.cardId),
    );
    if (poke > 0) {
      defenderOwner.hp -= poke;
      log.unshift(
        `${getCard(atk.cardId).name}: искры ада −${poke} герою врага`,
      );
    }
  }
  {
    const bonus = motardoHeroBonus(hostUpgradeLevel(atk, atk.cardId));
    if (atk.cardId === "motardo" && bonus > 0) {
      defenderOwner.hp -= bonus;
      log.unshift(
        `${getCard(atk.cardId).name}: бензин в лицо −${bonus} герою`,
      );
    }
  }
  if (!def && hasAbility(atk.cardId, "flame_burn", atk)) {
    applyHeroBurn(defenderOwner, 3, 3, log);
  }
  if (def && hasAbility(atk.cardId, "lich_drain", atk)) {
    const lv = hostUpgradeLevel(atk, atk.cardId);
    const drain = lichDrainAmount(lv);
    if (drain > 0) {
      const base = effectiveBase(atk);
      const before = atk.health;
      atk.health = Math.min(base.hp, atk.health + drain);
      const gained = atk.health - before;
      if (gained > 0) {
        log.unshift(
          `${getCard(atk.cardId).name} вытягивает жизнь +${gained} HP`,
        );
      }
    }
    const poke = lichHeroPoke(lv);
    if (poke > 0) {
      defenderOwner.hp -= poke;
      log.unshift(
        `${getCard(atk.cardId).name}: холод могилы −${poke} герою врага`,
      );
    }
  }
}

function rangedHit(
  attackerOwner: PlayerState,
  defenderOwner: PlayerState,
  fromSlot: number,
  toSlot: number,
  log: string[],
  state?: BattleState,
): void {
  const atk = attackerOwner.slots[fromSlot];
  const def = defenderOwner.slots[toSlot];
  if (!atk || !def) return;
  if (!canPhysicallyAttack(atk.cardId, def.cardId, def)) {
    log.unshift(
      `${getCard(def.cardId).name} недоступна для атаки ${getCard(atk.cardId).name}`,
    );
    return;
  }
  const defHpBefore = def.health;
  const tank = def.guardedByUid
    ? findTankByUid(defenderOwner.slots, def.guardedByUid)
    : null;
  const tankHpBefore = tank?.health ?? null;
  let raw = outgoingDamage(attackerOwner, strikePower(atk));
  raw = applyRangedWards(atk, def, raw, log);
  const dmg = dealToCreature(
    def,
    raw,
    log,
    defenderOwner.slots,
    { ignoreShield: strikeIgnoreShield(atk) },
  );
  atk.canAttack = false;
  log.unshift(
    `${getCard(atk.cardId).name} (лучник) бьёт ${getCard(def.cardId).name} на ${dmg} → ${def.health} HP`,
  );
  applyOnHitExtras(atk, def, attackerOwner, defenderOwner, log);
  const victim = resolveHitVictim(def, defHpBefore, defenderOwner, tankHpBefore);
  const defWasAlive = defHpBefore > 0;
  for (let i = 0; i < defenderOwner.slots.length; i++) {
    removeIfDead(defenderOwner, i, log, state, { killer: atk });
  }
  const after = defenderOwner.slots[toSlot];
  const victimDead =
    defWasAlive &&
    (!after || after.uid !== def.uid || after.isCorpse === true);
  tryKillRewards(atk, attackerOwner, victimDead, log, state);
  if (victimDead) {
    tryOrcKillStun(atk, defenderOwner, toSlot, log);
  }
  if (victim && victim.health > 0) {
    tryRiposte(defenderOwner, attackerOwner, fromSlot, victim, log, state);
  }
  tryVampireGrow(attackerOwner, fromSlot, log);
  if (hasAbility(atk.cardId, "water_tide", atk)) {
    syncWaterTide(attackerOwner, log);
  }
}

/** Снижение дальнего урона: скелет / рекс / гонщик. */
function applyRangedWards(
  atk: CreatureInstance,
  def: CreatureInstance,
  raw: number,
  log: string[],
): number {
  const arrowAtk =
    atk.cardId === "elf" ||
    atk.cardId === "crossbowman" ||
    atk.cardId === "archer" ||
    patternOf(atk.cardId, atk) === "ranged";
  if (!arrowAtk || raw <= 0) return raw;
  let next = raw;
  if (
    def.cardId === "skeleton" &&
    skeletonHasArrowWard(hostUpgradeLevel(def, "skeleton"))
  ) {
    const halved = Math.floor(next / 2);
    if (halved !== next) {
      log.unshift(`🦴 Скелет (ур.3): стрелы ${next} → ${halved}`);
    }
    next = halved;
  }
  if (
    def.cardId === "bone_rex" &&
    boneRexRangedWard(hostUpgradeLevel(def, def.cardId))
  ) {
    const halved = Math.floor(next / 2);
    if (halved !== next) {
      log.unshift(`🦖 Костяной рекс: дальние ${next} → ${halved}`);
    }
    next = halved;
  }
  const riderChance = hellRiderRangedWardChance(
    hostUpgradeLevel(def, def.cardId),
  );
  if (def.cardId === "hell_rider" && riderChance > 0 && Math.random() < riderChance) {
    const halved = Math.floor(next / 2);
    log.unshift(
      `🏍 Адский гонщик: увернулся от дальних ${next} → ${halved}`,
    );
    next = halved;
  }
  return next;
}

function cleaveHit(
  attackerOwner: PlayerState,
  defenderOwner: PlayerState,
  fromSlot: number,
  centerSlot: number,
  log: string[],
  state?: BattleState,
): void {
  const atk = attackerOwner.slots[fromSlot];
  if (!atk) return;
  const targets = cleaveSlots(centerSlot).filter((i) => {
    const t = defenderOwner.slots[i];
    return !!t && canPhysicallyAttack(atk.cardId, t.cardId, t);
  });
  if (!targets.length) return;

  const names: string[] = [];
  const riposteVictims: CreatureInstance[] = [];
  const power = strikePower(atk);
  const centerMul =
    atk.cardId === "cerberus"
      ? cerberusCenterMul(hostUpgradeLevel(atk, atk.cardId))
      : 1;
  let shown = power;
  for (const i of targets) {
    const def = defenderOwner.slots[i]!;
    const defHpBefore = def.health;
    const tank = def.guardedByUid
      ? findTankByUid(defenderOwner.slots, def.guardedByUid)
      : null;
    const tankHpBefore = tank?.health ?? null;
    const raw =
      i === centerSlot && centerMul > 1
        ? power * centerMul
        : power;
    shown = dealToCreature(
      def,
      outgoingDamage(attackerOwner, raw),
      log,
      defenderOwner.slots,
      { ignoreShield: strikeIgnoreShield(atk) },
    );
    names.push(getCard(def.cardId).name);
    const victim = resolveHitVictim(
      def,
      defHpBefore,
      defenderOwner,
      tankHpBefore,
    );
    if (victim) riposteVictims.push(victim);
    // огнемётчик / огненный дракон: burn только на центр; чёрный дракон ур.3 — вся линия
    const lineBurn =
      atk.cardId === "black_dragon" &&
      blackDragonLineBurn(hostUpgradeLevel(atk, atk.cardId));
    if (i === centerSlot || lineBurn) {
      if (lineBurn && def.health > 0) {
        applyBurnStatus(def, 2, 2);
        log.unshift(
          `${getCard(def.cardId).name}: дыхание тьмы — горит`,
        );
      }
      if (i === centerSlot) {
        applyOnHitExtras(atk, def, attackerOwner, defenderOwner, log);
      }
    }
  }

  atk.canAttack = false;
  log.unshift(
    `${getCard(atk.cardId).name} бьёт [${names.join(", ")}] по ~${shown}`,
  );

  for (const i of targets) {
    removeIfDead(defenderOwner, i, log, state, { killer: atk });
  }
  for (const victim of riposteVictims) {
    if (victim.health > 0) {
      tryRiposte(defenderOwner, attackerOwner, fromSlot, victim, log, state);
    }
  }
  tryVampireGrow(attackerOwner, fromSlot, log);
}

function applySpellEffects(
  state: BattleState,
  caster: PlayerState,
  foe: PlayerState,
  effects: SpellEffect[],
  targetSlot: number | null,
  log: string[],
  lingerMeta?: { cardId: string },
): boolean {
  for (const eff of effects) {
    switch (eff.type) {
      case "damage_hero":
        foe.hp -= eff.amount;
        log.unshift(`${caster.name}: ${eff.amount} урона герою`);
        break;
      case "damage_enemy": {
        if (targetSlot == null) {
          foe.hp -= eff.amount;
          log.unshift(`${caster.name}: ${eff.amount} урона оракулу врага`);
          break;
        }
        if (!foe.slots[targetSlot]) return false;
        const u = foe.slots[targetSlot]!;
        if (hasAbility(u.cardId, "immune_spells", u)) {
          log.unshift(
            `${caster.name}: ${getCard(u.cardId).name} невосприимчив к заклинаниям`,
          );
          break;
        }
        const dealt = dealToCreature(u, eff.amount, log);
        log.unshift(
          `${caster.name}: ${getCard(u.cardId).name} получает ${dealt} → ${u.health} HP`,
        );
        removeIfDead(foe, targetSlot, log, state);
        break;
      }
      case "heal_hero":
        caster.hp = Math.min(caster.maxHp, caster.hp + eff.amount);
        log.unshift(`${caster.name}: +${eff.amount} HP`);
        break;
      case "damage_all_enemies":
        foe.slots.forEach((s, i) => {
          if (!s) return;
          if (hasAbility(s.cardId, "immune_spells", s)) {
            log.unshift(
              `${getCard(s.cardId).name} невосприимчив к заклинаниям`,
            );
            return;
          }
          dealToCreature(s, eff.amount, log);
          removeIfDead(foe, i, log, state);
        });
        log.unshift(`${caster.name}: ${eff.amount} всем вражеским существам`);
        break;
      case "damage_undead": {
        const names: string[] = [];
        for (const side of [caster, foe]) {
          side.slots.forEach((s, i) => {
            if (!s) return;
            if (getCard(s.cardId).school !== "death") return;
            dealToCreature(s, eff.amount, log);
            names.push(getCard(s.cardId).name);
            removeIfDead(side, i, log, state);
          });
        }
        log.unshift(
          names.length
            ? `Атака нежити: ${eff.amount} всей нежити [${names.join(", ")}]`
            : `Атака нежити: на поле нет нежити`,
        );
        break;
      }
      case "draw": {
        const n = Number(eff.amount);
        const add = Number.isFinite(n) && n > 0 ? n : 1;
        draw(caster, add, state);
        log.unshift(`${caster.name}: добор ${add}`);
        break;
      }
      case "buff_permanent": {
        if (targetSlot == null || !caster.slots[targetSlot]) return false;
        const u = caster.slots[targetSlot]!;
        if (eff.onlySchool && getCard(u.cardId).school !== eff.onlySchool) {
          log.unshift(
            `${caster.name}: бонус только для школы «${eff.onlySchool}»`,
          );
          return false;
        }
        u.permAttack += eff.attack;
        u.permHealth += eff.health;
        u.attack += eff.attack;
        u.health += eff.health;
        log.unshift(
          `${caster.name}: ${getCard(u.cardId).name} навсегда +${eff.attack}/+${eff.health}`,
        );
        break;
      }
      case "heal_unit": {
        if (targetSlot == null || !caster.slots[targetSlot]) return false;
        const u = caster.slots[targetSlot]!;
        u.statuses = u.statuses.filter((st) => st.type !== "poison");
        const base = effectiveBase(u);
        u.health = Math.min(base.hp, u.health + eff.amount);
        log.unshift(
          `${caster.name}: ${getCard(u.cardId).name} лечение ${eff.amount}, яд снят`,
        );
        break;
      }
      case "poison": {
        if (targetSlot == null || !foe.slots[targetSlot]) return false;
        const u = foe.slots[targetSlot]!;
        if (hasAbility(u.cardId, "immune_spells", u)) {
          log.unshift(
            `${caster.name}: ${getCard(u.cardId).name} невосприимчив к заклинаниям`,
          );
          break;
        }
        if (hasAbility(u.cardId, "immune_hell_death", u)) {
          log.unshift(
            `${caster.name}: ${getCard(u.cardId).name} невосприимчив к яду/смерти`,
          );
          break;
        }
        applyPoisonStatus(u, eff.amount);
        if (lingerMeta) {
          // Яд висит на стороне отравленного
          pushBoardSpell(foe, {
            cardId: lingerMeta.cardId,
            turnsLeft: null,
            targetUid: u.uid,
            targetSide: foe.id,
            casterSide: caster.id,
            kind: "poison",
            mode: "active",
          });
        }
        log.unshift(
          `${caster.name}: ${getCard(u.cardId).name} отравлен (−${eff.amount} от текущих HP в свой ход, затем растёт)`,
        );
        break;
      }
      case "damage_unit": {
        if (targetSlot == null || !foe.slots[targetSlot]) return false;
        const u = foe.slots[targetSlot]!;
        if (hasAbility(u.cardId, "immune_spells", u)) {
          log.unshift(
            `${caster.name}: ${getCard(u.cardId).name} невосприимчив к заклинаниям`,
          );
        break;
    }
        const dealt = dealToCreature(u, eff.amount, log);
        log.unshift(
          `${caster.name}: ${getCard(u.cardId).name} получает ${dealt} → ${u.health} HP`,
        );
        removeIfDead(foe, targetSlot, log, state);
        break;
      }
      case "slow_enemy": {
        if (targetSlot == null || !foe.slots[targetSlot]) return false;
        const u = foe.slots[targetSlot]!;
        if (hasAbility(u.cardId, "immune_spells", u)) {
          log.unshift(
            `${caster.name}: ${getCard(u.cardId).name} невосприимчив к заклинаниям`,
          );
          break;
        }
        u.attack = Math.max(0, u.attack - eff.amount);
        u.statuses.push({ type: "slow", amount: eff.amount });
        log.unshift(
          `${caster.name}: ${getCard(u.cardId).name}: −${eff.amount} атаки до конца его хода`,
        );
        break;
      }
      case "shield_ally": {
        if (targetSlot == null || !caster.slots[targetSlot]) return false;
        const u = caster.slots[targetSlot]!;
        u.statuses = u.statuses.filter((st) => st.type !== "shield");
        u.statuses.push({ type: "shield", amount: eff.turns });
        if (lingerMeta) {
          pushBoardSpell(caster, {
            cardId: lingerMeta.cardId,
            turnsLeft: eff.turns,
            targetUid: u.uid,
            targetSide: caster.id,
            casterSide: caster.id,
            kind: "shield",
            mode: "active",
          });
        }
        log.unshift(
          `${caster.name}: 🛡 щит на ${getCard(u.cardId).name} (−50% урона, ${eff.turns} хода)`,
        );
        break;
      }
      case "gain_mana": {
        const f = manaSchoolOf(caster, eff.faction);
        const amt = Number(eff.amount);
        const add = Number.isFinite(amt) && amt !== 0 ? amt : 1;
        addMana(caster.mana, f, add);
        log.unshift(
          `${caster.name}: +${add} маны своей школы (${f})`,
        );
        break;
      }
      case "skip_combat": {
        state.calmTurnsLeft = Math.max(state.calmTurnsLeft, 1);
        for (const side of [caster, foe]) {
          for (const s of side.slots) {
            if (s) s.canAttack = false;
          }
        }
        log.unshift(
          `${caster.name}: затишье — оба войска бездействуют до конца хода соперника`,
        );
        break;
      }
      case "shuffle_board": {
        const idxs: number[] = [];
        const units: CreatureInstance[] = [];
        caster.slots.forEach((s, i) => {
          if (!s) return;
          idxs.push(i);
          units.push(s);
        });
        if (units.length < 2) {
          log.unshift(
            `${caster.name}: ураган — на поле мало существ для перемешивания`,
          );
          break;
        }
        // Перемешиваем только занятые слоты (карта: «на поле»), бафы/uid сохраняются.
        let perm = shuffle(units);
        // Не оставляем визуальный no-op, если выпал тот же порядок.
        if (
          units.length >= 2 &&
          perm.every((u, i) => u.uid === units[i]!.uid)
        ) {
          perm = [units[units.length - 1]!, ...units.slice(0, -1)];
        }
        idxs.forEach((slot, i) => {
          caster.slots[slot] = perm[i]!;
        });
        log.unshift(
          `${caster.name}: ураган перемешал существ на поле (эффекты сохранены)`,
        );
        break;
      }
      case "extra_draw_turns": {
        caster.bonusDrawTurns += eff.turns;
        log.unshift(
          `${caster.name}: доп. карта на ${eff.turns} след. хода (всего ${caster.bonusDrawTurns})`,
        );
        break;
      }
      case "buff_army_attack": {
        let n = 0;
        for (const s of caster.slots) {
          if (!s) continue;
          if (hasAbility(s.cardId, "immune_spells", s)) continue;
          s.attack += eff.amount;
          n += 1;
        }
        log.unshift(
          n
            ? `${caster.name}: в атаку — все существа +${eff.amount} ATK до конца хода (${n})`
            : `${caster.name}: в атаку — на поле нет существ`,
        );
        break;
      }
      case "banish_unit": {
        if (targetSlot == null || !foe.slots[targetSlot]) return false;
        const u = foe.slots[targetSlot]!;
        if (hasAbility(u.cardId, "immune_spells", u)) {
          log.unshift(
            `${caster.name}: ${getCard(u.cardId).name} невосприимчив к заклинаниям`,
          );
          break;
        }
        if (
          hasAbility(u.cardId, "immune_death", u) ||
          hasAbility(u.cardId, "immune_hell_death", u)
        ) {
          log.unshift(
            `${caster.name}: ${getCard(u.cardId).name} невосприимчив к магии смерти`,
          );
          break;
        }
        log.unshift(
          `${caster.name}: ${getCard(u.cardId).name} убран с поля`,
        );
        foe.graveyard.push(u.cardId);
        foe.slots[targetSlot] = null;
        syncBoardAuras(foe, log);
        break;
      }
      case "cure_poison": {
        if (targetSlot == null || !caster.slots[targetSlot]) return false;
        const u = caster.slots[targetSlot]!;
        const had = u.statuses.some((st) => st.type === "poison");
        u.statuses = u.statuses.filter((st) => st.type !== "poison");
        // снять висящий яд — карта обратно кастеру яда
        for (const side of [caster, foe]) {
          side.activeSpells = side.activeSpells.filter((sp) => {
            if (sp.kind === "poison" && sp.targetUid === u.uid) {
              reclaimLingeringSpell(state, sp, side);
              return false;
            }
            return true;
          });
        }
        log.unshift(
          had
            ? `${caster.name}: противоядие — яд снят с ${getCard(u.cardId).name}`
            : `${caster.name}: противоядие — на ${getCard(u.cardId).name} яда не было`,
        );
        break;
      }
      case "cure_poison_all": {
        let n = 0;
        for (const u of caster.slots) {
          if (!u) continue;
          if (!u.statuses.some((st) => st.type === "poison")) continue;
          u.statuses = u.statuses.filter((st) => st.type !== "poison");
          n += 1;
        }
        for (const side of [caster, foe]) {
          side.activeSpells = side.activeSpells.filter((sp) => {
            if (sp.kind !== "poison" || !sp.targetUid) return true;
            const still = caster.slots.some(
              (s) => s && s.uid === sp.targetUid && s.statuses.some((st) => st.type === "poison"),
            );
            if (!still && caster.slots.some((s) => s?.uid === sp.targetUid)) {
              reclaimLingeringSpell(state, sp, side);
              return false;
            }
            // если цель наша и яд снят
            if (caster.slots.some((s) => s?.uid === sp.targetUid)) {
              reclaimLingeringSpell(state, sp, side);
              return false;
            }
            return true;
          });
        }
        log.unshift(
          `${caster.name}: общее противоядие — очищено существ: ${n}`,
        );
        break;
      }
      case "bounce_enemy_hand": {
        if (targetSlot == null || !foe.slots[targetSlot]) return false;
        const u = foe.slots[targetSlot]!;
        if (hasAbility(u.cardId, "immune_spells", u)) {
          log.unshift(
            `${caster.name}: ${getCard(u.cardId).name} невосприимчив к заклинаниям`,
          );
          break;
        }
        if (foe.hand.length >= MAX_HAND_SIZE) {
          log.unshift(`${caster.name}: рука врага полна — карта в сброс`);
          foe.graveyard.push(u.cardId);
        } else {
          foe.hand.push(u.cardId);
          log.unshift(
            `${caster.name}: ${getCard(u.cardId).name} возвращён в руку врага`,
          );
        }
        foe.slots[targetSlot] = null;
        syncBoardAuras(foe, log);
        clearBondsForUnit(state, u.uid);
        break;
      }
      case "reveal_enemy_hand": {
        caster.revealEnemyHandTurns = Math.max(
          caster.revealEnemyHandTurns,
          eff.turns,
        );
        log.unshift(
          `${caster.name}: рука врага видна ${eff.turns} ход(а)`,
        );
        break;
      }
      case "guardian_bond": {
        // только через playGuardianBond (два слота) — иначе не глотаем карту
        log.unshift(`${caster.name}: нужно выбрать стража и подопечного`);
        return false;
      }
      case "break_enemy_spell": {
        const removed = breakOneEnemySpell(foe, state, log);
        if (!removed) {
          const echoOnly = countEnemySpellEchoes(foe, state) > 0;
          log.unshift(
            echoOnly
              ? `${caster.name}: у врага только серые «следы» (камни маны и т.п.) — они уже сработали, снять нельзя`
              : `${caster.name}: у врага нет длящихся заклинаний (яд, щит, страх…)`,
          );
        }
        break;
      }
      case "break_all_enemy_spells": {
        const n = breakAllEnemySpells(foe, state, log);
        if (n === 0) {
          const echoOnly = countEnemySpellEchoes(foe, state) > 0;
          log.unshift(
            echoOnly
              ? `${caster.name}: общее разбитие — серые следы не снимаются (уже сработали)`
              : `${caster.name}: общее разбитие — длящихся заклинаний нет`,
          );
        } else {
          log.unshift(
            `${caster.name}: общее разбитие — снято заклинаний: ${n}`,
          );
        }
        break;
      }
      case "freeze_enemy": {
        if (targetSlot == null || !foe.slots[targetSlot]) return false;
        const u = foe.slots[targetSlot]!;
        if (hasAbility(u.cardId, "immune_spells", u)) {
          log.unshift(
            `${caster.name}: ${getCard(u.cardId).name} невосприимчив к заклинаниям`,
          );
          break;
        }
        u.canAttack = false;
        u.statuses = u.statuses.filter((st) => st.type !== "sleep");
        u.statuses.push({ type: "sleep", amount: 1 });
        log.unshift(
          `${caster.name}: ${getCard(u.cardId).name} заморожен на следующий ход`,
        );
        break;
      }
      case "discard_enemy_hand": {
        const n = Math.min(eff.amount, foe.hand.length);
        if (n <= 0) {
          log.unshift(`${caster.name}: у врага пустая рука`);
          break;
        }
        const dumped: string[] = [];
        for (let i = 0; i < n; i++) {
          const hi = Math.floor(Math.random() * foe.hand.length);
          const id = foe.hand.splice(hi, 1)[0]!;
          foe.graveyard.push(id);
          dumped.push(getCard(id).name);
        }
        log.unshift(
          `${caster.name}: враг сбрасывает ${n} — ${dumped.join(", ")}`,
        );
        break;
      }
      case "refresh_hand": {
        const n = caster.hand.length;
        if (n <= 0) {
          log.unshift(`${caster.name}: сменить руку — рука пуста`);
          break;
        }
        const dumped = caster.hand.splice(0, caster.hand.length);
        for (const id of dumped) {
          caster.graveyard.push(id);
        }
        draw(caster, n, state);
        log.unshift(
          `${caster.name}: сменил руку — ${n} в грейв, добор ${caster.hand.length}`,
        );
        break;
      }
      case "traitor": {
        if (targetSlot == null || !foe.slots[targetSlot]) return false;
        const u = foe.slots[targetSlot]!;
        if (hasAbility(u.cardId, "immune_spells", u)) {
          log.unshift(
            `${caster.name}: ${getCard(u.cardId).name} невосприимчив к заклинаниям`,
          );
          break;
        }
        u.statuses = u.statuses.filter((st) => st.type !== "traitor");
        u.statuses.push({ type: "traitor", amount: 2 });
        u.canAttack = false;
        if (lingerMeta) {
          pushBoardSpell(foe, {
            cardId: lingerMeta.cardId,
            turnsLeft: 2,
            targetUid: u.uid,
            targetSide: foe.id,
            casterSide: caster.id,
            kind: "traitor",
            mode: "active",
          });
        }
        log.unshift(
          `${caster.name}: изменник — ${getCard(u.cardId).name} ударит своих после конца хода`,
        );
        break;
      }
      case "fear_protect": {
        // Враг не бьёт существ школы твоего оракула
        foe.attackBanSchool = caster.faction;
        foe.attackBanTurns = Math.max(foe.attackBanTurns, eff.turns);
        log.unshift(
          `${caster.name}: страх — враг не бьёт школу «${caster.faction}» ${eff.turns} хода`,
        );
        break;
      }
      case "marionette": {
        // Только через playMarionette (кукла + цель)
        log.unshift(
          `${caster.name}: марионетка — выбери существо врага, затем цель`,
        );
        return false;
      }
      case "strip_ability": {
        if (targetSlot == null || !foe.slots[targetSlot]) return false;
        const u = foe.slots[targetSlot]!;
        if (hasAbility(u.cardId, "immune_spells", u)) {
          log.unshift(
            `${caster.name}: ${getCard(u.cardId).name} невосприимчив к заклинаниям`,
          );
          break;
        }
        u.stripped = true;
        log.unshift(
          `${caster.name}: ничтожество — у ${getCard(u.cardId).name} снято супер-умение до конца боя`,
        );
        break;
      }
      case "gain_mana_all": {
        for (const f of ["water", "hell", "death", "life", "nature"] as const) {
          addMana(caster.mana, f, eff.amount);
        }
        log.unshift(
          `${caster.name}: +${eff.amount} маны каждой школе`,
        );
        break;
      }
      case "poison_all": {
        let n = 0;
        foe.slots.forEach((s, i) => {
          if (!s) return;
          if (hasAbility(s.cardId, "immune_spells", s)) return;
          if (hasAbility(s.cardId, "immune_hell_death", s)) return;
          if (hasAbility(s.cardId, "immune_death", s)) return;
          if (!s.statuses.some((st) => st.type === "poison")) {
            applyPoisonStatus(s, eff.amount);
            n += 1;
            if (lingerMeta) {
              pushBoardSpell(foe, {
                cardId: lingerMeta.cardId,
                turnsLeft: null,
                targetUid: s.uid,
                targetSide: foe.id,
                casterSide: caster.id,
                kind: "poison",
                mode: "active",
              });
            }
          }
          void i;
        });
        log.unshift(
          `${caster.name}: общее отравление — яд на ${n} существ`,
        );
        break;
      }
      case "recruit_to_hand": {
        if (targetSlot == null || !foe.slots[targetSlot]) return false;
        const u = foe.slots[targetSlot]!;
        if (hasAbility(u.cardId, "immune_spells", u)) {
          log.unshift(
            `${caster.name}: ${getCard(u.cardId).name} невосприимчив к заклинаниям`,
          );
          break;
        }
        const id = u.cardId;
        foe.slots[targetSlot] = null;
        syncBoardAuras(foe, log);
        clearBondsForUnit(state, u.uid);
        if (caster.hand.length >= MAX_HAND_SIZE) {
          caster.graveyard.push(id);
          log.unshift(
            `${caster.name}: предатель — рука полна, ${getCard(id).name} в сброс`,
          );
        } else {
          caster.hand.push(id);
          log.unshift(
            `${caster.name}: предатель — ${getCard(id).name} перешёл в твою руку (на эту битву)`,
          );
        }
        break;
      }
      case "last_stand": {
        if (targetSlot == null || !caster.slots[targetSlot]) return false;
        const u = caster.slots[targetSlot]!;
        const addAtk = u.baseAttack;
        const addHp = u.baseHealth;
        u.baseAttack *= 2;
        u.baseHealth *= 2;
        u.attack += addAtk;
        u.health += addHp;
        u.noRestore = true;
        u.statuses = u.statuses.filter((st) => st.type !== "last_gasp");
        u.statuses.push({ type: "last_gasp", amount: 1 });
        log.unshift(
          `${caster.name}: из последних сил — ${getCard(u.cardId).name} ${u.attack}/${u.health}, без резета до конца боя`,
        );
        break;
      }
      case "bunker": {
        if (targetSlot == null || !caster.slots[targetSlot]) return false;
        const u = caster.slots[targetSlot]!;
        u.canAttack = false;
        u.statuses = u.statuses.filter((st) => st.type !== "bunker");
        u.statuses.push({ type: "bunker", amount: eff.turns });
        if (lingerMeta) {
          pushBoardSpell(caster, {
            cardId: lingerMeta.cardId,
            turnsLeft: eff.turns,
            targetUid: u.uid,
            targetSide: caster.id,
            casterSide: caster.id,
            kind: "bunker",
            mode: "active",
          });
        }
        log.unshift(
          `${caster.name}: ${getCard(u.cardId).name} в домике на ${eff.turns} хода (нельзя бить и действовать)`,
        );
        break;
      }
      case "mute_ranged": {
        foe.muteRangedTurns = Math.max(foe.muteRangedTurns, eff.turns);
        for (const s of foe.slots) {
          if (!s) continue;
          const pat = patternOf(s.cardId);
          if (
            pat === "ranged" ||
            hasAbility(s.cardId, "mage_flex", s) ||
            hasAbility(s.cardId, "arbiter_flex", s)
          ) {
            s.canAttack = false;
          }
        }
        if (lingerMeta) {
          pushBoardSpell(foe, {
            cardId: lingerMeta.cardId,
            turnsLeft: eff.turns,
            targetSide: foe.id,
            casterSide: caster.id,
            kind: "mute_ranged",
            mode: "active",
          });
        }
        log.unshift(
          `${caster.name}: чистое небо — стрелки/маги врага молчат ${eff.turns} ход`,
        );
        break;
      }
      case "weaken_foe_damage": {
        foe.weakenDamageTurns = Math.max(foe.weakenDamageTurns, eff.turns);
        if (lingerMeta) {
          pushBoardSpell(foe, {
            cardId: lingerMeta.cardId,
            turnsLeft: eff.turns,
            targetSide: foe.id,
            casterSide: caster.id,
            kind: "weaken",
            mode: "active",
          });
        }
        log.unshift(
          `${caster.name}: пыль в глаза — враг бьёт на 50% ${eff.turns} хода`,
        );
        break;
      }
      case "sniper_buff": {
        let n = 0;
        for (const u of caster.slots) {
          if (!u) continue;
          const pat = patternOf(u.cardId);
          const isAim =
            pat === "ranged" ||
            hasAbility(u.cardId, "mage_flex", u) ||
            hasAbility(u.cardId, "arbiter_flex", u);
          if (!isAim) continue;
          u.permAttack += eff.attack;
          u.attack += eff.attack;
          u.statuses = u.statuses.filter((st) => st.type !== "sniper");
          u.statuses.push({ type: "sniper", amount: eff.turns });
          n += 1;
          if (lingerMeta) {
            pushBoardSpell(caster, {
              cardId: lingerMeta.cardId,
              turnsLeft: eff.turns,
              targetUid: u.uid,
              targetSide: caster.id,
              casterSide: caster.id,
              kind: "sniper",
              mode: "active",
            });
          }
        }
        log.unshift(
          n
            ? `${caster.name}: снайпер — ${n} стрелков/магов +${eff.attack} ATK, бьют юнитов и оракула ${eff.turns} ход`
            : `${caster.name}: снайпер — на поле нет стрелков/магов`,
        );
        break;
      }
      case "wake_ally": {
        if (targetSlot == null || !caster.slots[targetSlot]) return false;
        const u = caster.slots[targetSlot]!;
        const woke = grantReadyAttack(u);
        log.unshift(
          woke
            ? `${caster.name}: пробуждение — ${getCard(u.cardId).name} снова готов к бою`
            : `${caster.name}: пробуждение — ${getCard(u.cardId).name} снят сон, но действовать нельзя`,
        );
        break;
      }
      case "wake_all_allies": {
        let n = 0;
        for (const u of caster.slots) {
          if (!u) continue;
          if (grantReadyAttack(u)) n += 1;
        }
        log.unshift(
          n
            ? `${caster.name}: общая побудка — ${n} существ снова готовы`
            : `${caster.name}: общая побудка — некого будить`,
        );
        break;
      }
      default: {
        const t = (eff as { type?: string }).type ?? "?";
        log.unshift(`${caster.name}: эффект «${t}» не сработал`);
        break;
      }
    }
  }
  pruneLingering(state);
  return true;
}

function clearBondsForUnit(state: BattleState, unitUid: string): void {
  for (const side of ["you", "enemy"] as const) {
    const p = state[side];
    p.activeSpells = p.activeSpells.filter((sp) => {
      if (
        (sp.kind === "guardian" || sp.kind === "traitor" || sp.kind === "poison" || sp.kind === "shield") &&
        (sp.targetUid === unitUid || sp.guardianUid === unitUid)
      ) {
        reclaimLingeringSpell(state, sp, p);
        return false;
      }
      return true;
    });
  }
  for (const side of ["you", "enemy"] as const) {
    for (const s of state[side].slots) {
      if (!s) continue;
      if (s.uid === unitUid) {
        s.guardedByUid = undefined;
        s.statuses = s.statuses.filter((st) => st.type !== "traitor");
      }
      if (s.guardedByUid === unitUid) s.guardedByUid = undefined;
    }
  }
}

function clearSpellEffectsOnBoard(
  state: BattleState,
  sp: LingeringSpell,
): void {
  // Глобальные проклятия на стороне жертвы (без targetUid)
  if (sp.kind === "mute_ranged" || sp.kind === "weaken") {
    const victim =
      sp.targetSide === "you"
        ? state.you
        : sp.targetSide === "enemy"
          ? state.enemy
          : null;
    if (victim) {
      if (sp.kind === "mute_ranged") victim.muteRangedTurns = 0;
      if (sp.kind === "weaken") victim.weakenDamageTurns = 0;
    }
    return;
  }
  if (!sp.targetUid) return;
  const live = findUnitByUid(state, sp.targetUid);
  if (!live) return;
  if (sp.kind === "poison") {
    live.unit.statuses = live.unit.statuses.filter((st) => st.type !== "poison");
  }
  if (sp.kind === "shield") {
    live.unit.statuses = live.unit.statuses.filter((st) => st.type !== "shield");
  }
  if (sp.kind === "traitor") {
    live.unit.statuses = live.unit.statuses.filter((st) => st.type !== "traitor");
  }
  if (sp.kind === "guardian") {
    live.unit.guardedByUid = undefined;
    if (sp.guardianUid) {
      const tank = findUnitByUid(state, sp.guardianUid);
      // ward cleared above
      void tank;
    }
  }
  if (sp.kind === "bunker") {
    live.unit.statuses = live.unit.statuses.filter((st) => st.type !== "bunker");
  }
  if (sp.kind === "sniper") {
    const had = live.unit.statuses.some((st) => st.type === "sniper");
    if (had) {
      live.unit.attack = Math.max(0, live.unit.attack - 2);
      live.unit.permAttack = Math.max(0, live.unit.permAttack - 2);
    }
    live.unit.statuses = live.unit.statuses.filter((st) => st.type !== "sniper");
  }
}

function isEnemyCastSpell(
  sp: LingeringSpell,
  foe: PlayerState,
): boolean {
  return (
    sp.mode === "active" &&
    sp.kind !== "echo" &&
    (sp.casterSide ?? foe.id) === foe.id
  );
}

/** Серые эхо разовых карт врага (камни маны и т.п.) — не «активные». */
function countEnemySpellEchoes(
  foe: PlayerState,
  state: BattleState,
): number {
  let n = 0;
  for (const side of [state.you, state.enemy]) {
    for (const sp of side.activeSpells) {
      if (
        (sp.mode === "echo" || sp.kind === "echo") &&
        (sp.casterSide ?? foe.id) === foe.id
      ) {
        n += 1;
      }
    }
  }
  return n;
}

function breakOneEnemySpell(
  foe: PlayerState,
  state: BattleState,
  log: string[],
): boolean {
  // Враг кастовал: баф у него на столе ИЛИ яд/проклятие на тебе
  for (const side of [state.you, state.enemy]) {
    const idx = side.activeSpells.findIndex((sp) => isEnemyCastSpell(sp, foe));
    if (idx < 0) continue;
    const sp = side.activeSpells.splice(idx, 1)[0]!;
    clearSpellEffectsOnBoard(state, sp);
    foe.graveyard.push(sp.cardId);
    log.unshift(
      `Разбито заклинание врага: ${getCard(sp.cardId).name}`,
    );
    return true;
  }
  return false;
}

function breakAllEnemySpells(
  foe: PlayerState,
  state: BattleState,
  _log: string[],
): number {
  let n = 0;
  for (const side of [state.you, state.enemy]) {
    const keep: LingeringSpell[] = [];
    for (const sp of side.activeSpells) {
      if (isEnemyCastSpell(sp, foe)) {
        clearSpellEffectsOnBoard(state, sp);
        foe.graveyard.push(sp.cardId);
        n += 1;
      } else {
        keep.push(sp);
      }
    }
    side.activeSpells = keep;
  }
  return n;
}

function spellNeedsTarget(
  effects: SpellEffect[],
): "ally" | "enemy" | "enemy_or_hero" | "ally_pair" | "marionette" | null {
  for (const e of effects) {
    if (e.type === "guardian_bond") return "ally_pair";
    if (e.type === "marionette") return "marionette";
    if (e.type === "damage_enemy") return "enemy_or_hero";
    if (
      e.type === "buff_permanent" ||
      e.type === "heal_unit" ||
      e.type === "shield_ally" ||
      e.type === "cure_poison" ||
      e.type === "bunker" ||
      e.type === "last_stand" ||
      e.type === "wake_ally"
    ) {
      return "ally";
    }
    if (
      e.type === "poison" ||
      e.type === "damage_unit" ||
      e.type === "slow_enemy" ||
      e.type === "banish_unit" ||
      e.type === "bounce_enemy_hand" ||
      e.type === "traitor" ||
      e.type === "freeze_enemy" ||
      e.type === "strip_ability" ||
      e.type === "recruit_to_hand"
    ) {
      return "enemy";
    }
  }
  return null;
}

function isLingeringSpell(cardId: string): boolean {
  return !!getCard(cardId).spellLinger;
}

/**
 * Сторона стола для карты заклинания:
 * — эффект на своих / кастера → сторона кастера;
 * — на вражеских существ / героя / руку врага → сторона цели (foe).
 */
function boardSideForSpellEffects(
  effects: SpellEffect[],
  casterId: "you" | "enemy",
  foeId: "you" | "enemy",
): "you" | "enemy" {
  const need = spellNeedsTarget(effects);
  if (need === "enemy" || need === "enemy_or_hero") return foeId;
  if (need === "ally" || need === "ally_pair") return casterId;
  for (const e of effects) {
    if (
      e.type === "damage_hero" ||
      e.type === "damage_enemy" ||
      e.type === "damage_all_enemies" ||
      e.type === "damage_undead" ||
      e.type === "discard_enemy_hand" ||
      e.type === "reveal_enemy_hand" ||
      e.type === "break_enemy_spell" ||
      e.type === "break_all_enemy_spells" ||
      e.type === "bounce_enemy_hand" ||
      e.type === "freeze_enemy" ||
      e.type === "slow_enemy" ||
      e.type === "poison" ||
      e.type === "damage_unit" ||
      e.type === "banish_unit" ||
      e.type === "traitor"
    ) {
      return foeId;
    }
    if (
      e.type === "gain_mana" ||
      e.type === "heal_hero" ||
      e.type === "heal_unit" ||
      e.type === "shield_ally" ||
      e.type === "buff_permanent" ||
      e.type === "buff_army_attack" ||
      e.type === "draw" ||
      e.type === "refresh_hand" ||
      e.type === "wake_ally" ||
      e.type === "wake_all_allies" ||
      e.type === "cure_poison" ||
      e.type === "cure_poison_all" ||
      e.type === "shuffle_board" ||
      e.type === "extra_draw_turns" ||
      e.type === "guardian_bond" ||
      e.type === "skip_combat"
    ) {
      return casterId;
    }
    if (e.type === "mute_ranged" || e.type === "weaken_foe_damage") {
      return foeId;
    }
  }
  return casterId;
}

function pushBoardSpell(
  board: PlayerState,
  partial: Omit<LingeringSpell, "uid"> & { uid?: string },
): void {
  board.activeSpells.push({
    uid: partial.uid ?? uid(),
    cardId: partial.cardId,
    turnsLeft: partial.turnsLeft,
    targetUid: partial.targetUid,
    targetSide: partial.targetSide ?? board.id,
    casterSide: partial.casterSide,
    guardianUid: partial.guardianUid,
    kind: partial.kind,
    mode: partial.mode,
  });
}

/**
 * Серые «эхо» разовых заклинаний.
 * Снимаем в конце хода игрока — так заклинания врага лежат весь твой ход.
 */
function clearEchoSpells(state: BattleState): void {
  for (const side of ["you", "enemy"] as const) {
    const p = state[side];
    const keep: LingeringSpell[] = [];
    for (const sp of p.activeSpells) {
      if (sp.mode === "echo" || sp.kind === "echo") {
        const caster =
          sp.casterSide === "enemy" ? state.enemy : state.you;
        // В т.ч. рамп («Доп. мана» / «Камни») — раньше сжигали из боя,
        // и в стартовой колоде из 4 карт она вылезала в руку один раз.
        caster.graveyard.push(sp.cardId);
        continue;
      }
      keep.push(sp);
    }
    p.activeSpells = keep;
  }
}

/** Рамп маны (доп. мана / камни) — для ИИ и тяжёлых заклинаний. */
function isManaRampSpell(effects: SpellEffect[]): boolean {
  if (!effects.length) return false;
  return effects.every(
    (e) => e.type === "gain_mana" || e.type === "gain_mana_all",
  );
}

function addSpellEcho(
  state: BattleState,
  caster: PlayerState,
  foe: PlayerState,
  cardId: string,
  effects: SpellEffect[],
): void {
  // На себе / своих → сторона кастера; на враге / герое врага → сторона цели.
  // Важно: рамп тоже в эхо до конца хода — иначе карта сразу в грейв,
  // тасуется и снова лезет в руку, пока существа ещё на столе / другие спеллы в эхе.
  const boardId = boardSideForSpellEffects(effects, caster.id, foe.id);
  const board = boardId === "you" ? state.you : state.enemy;
  pushBoardSpell(board, {
    cardId,
    turnsLeft: 1,
    casterSide: caster.id,
    targetSide: boardId,
    kind: "echo",
    mode: "echo",
  });
}

function spellBlockedByImmunity(
  cardSchool: string,
  targetCardId: string,
  target?: CreatureInstance | null,
): boolean {
  if (hasAbility(targetCardId, "immune_spells", target)) return true;
  if (hasAbility(targetCardId, "immune_hell_death", target)) {
    return cardSchool === "hell" || cardSchool === "death";
  }
  if (hasAbility(targetCardId, "immune_death", target)) {
    return cardSchool === "death";
  }
  return false;
}

export function playCard(
  state: BattleState,
  handIndex: number,
  slotIndex: number | null,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const foe = next.enemy;
  if (handIndex < 0 || handIndex >= me.hand.length) return state;
  const cardId = me.hand[handIndex];
  const card = getCard(cardId);
  const cost = battleManaCost(next, cardId);
  if (!canPay(me.mana, cost)) {
    next.log = [
      `Недостаточно маны (нужно ${formatManaCost(cost)})`,
      ...next.log,
    ].slice(0, 10);
    return next;
  }

  if (card.kind === "creature") {
    if (slotIndex == null || slotIndex < 0 || slotIndex > 4 || me.slots[slotIndex]) {
      next.log = ["Выбери свободный свой слот", ...next.log].slice(0, 10);
      return next;
    }
    payMana(me.mana, cost);
    me.hand.splice(handIndex, 1);
    const spawned = spawnCreature(
      cardId,
      next.rules,
      battleUpgradeLevel(next, next.active, cardId),
    );
    spawned.paidMana = { ...cost };
    me.slots[slotIndex] = spawned;
    syncBoardAuras(me, next.log);
    const up = hostUpgradeLevel(spawned, cardId);
    if (card.school === "nature") {
      const catalogHp = Math.max(1, card.health ?? 1);
      me.natureSummonHpTotal = (me.natureSummonHpTotal ?? 0) + catalogHp;
    }
    if (cardId === "ent") {
      let hp = Math.max(1, spawned.baseHealth);
      if (entUsesBoardHp(up)) {
        let sum = 0;
        for (const u of me.slots) {
          if (!u || u.uid === spawned.uid) continue;
          sum += Math.max(0, u.health);
        }
        hp = Math.max(1, sum || spawned.baseHealth);
      } else {
        hp = Math.max(1, me.natureSummonHpTotal ?? spawned.baseHealth);
      }
      spawned.baseHealth = hp;
      spawned.health = hp;
      next.log = [
        `${card.name}: корни → ${hp} HP`,
        ...next.log,
      ].slice(0, 10);
    }
    if (cardId === "spider" && spiderShieldOnPlay(up)) {
      spawned.statuses = spawned.statuses.filter((st) => st.type !== "shield");
      spawned.statuses.push({ type: "shield", amount: 3 });
      next.log = [
        `${card.name}: панцирь на 3 хода`,
        ...next.log,
      ].slice(0, 10);
    }
    if (cardId === "unicorn" && unicornManaOnPlay(up)) {
      addMana(me.mana, "nature", 1);
      next.log = [`${card.name}: +1 мана природы`, ...next.log].slice(0, 10);
    }
    if (cardId === "goblin" && goblinStealOnPlay(up)) {
      tryStealMana(me, foe, next.log);
    }
    if (cardId === "tank" && tankSelfShieldOnPlay(up)) {
      spawned.statuses = spawned.statuses.filter((st) => st.type !== "shield");
      spawned.statuses.push({ type: "shield", amount: 2 });
      next.log = [
        `${card.name}: призыв — лёгкий щит себе на 2 хода`,
        ...next.log,
      ].slice(0, 10);
    }
    if (cardId === "colossus" && colossusManaOnPlay(up)) {
      addMana(me.mana, "life", 1);
      next.log = [`${card.name}: +1 мана жизни`, ...next.log].slice(0, 10);
    }
    if (cardId === "colossus" && colossusArmyShieldOnPlay(up)) {
      let shielded = 0;
      for (const s of me.slots) {
        if (!s) continue;
        s.statuses = s.statuses.filter((st) => st.type !== "shield");
        s.statuses.push({ type: "shield", amount: 1 });
        shielded += 1;
      }
      next.log = [
        `${card.name}: щит армии на 1 ход (${shielded})`,
        ...next.log,
      ].slice(0, 10);
    }
    if (cardId === "kraken" && krakenWaterHpBonus(up)) {
      let waters = 0;
      for (const side of [me, foe]) {
        for (const u of side.slots) {
          if (u && getCard(u.cardId).school === "water") waters += 1;
        }
      }
      if (waters > 0) {
        spawned.baseHealth += waters;
        spawned.health += waters;
        next.log = [
          `${card.name}: глубина +${waters} HP за водных на поле`,
          ...next.log,
        ].slice(0, 10);
      }
    }
    if (cardId === "veles") {
      const heal = velesHealOnPlay(up);
      if (heal > 0) {
        me.hp = Math.min(me.maxHp, me.hp + heal);
        next.log = [
          `${card.name}: призыв, герой +${heal}`,
          ...next.log,
        ].slice(0, 10);
      }
    } else if (card.onPlayHealHero) {
      me.hp = Math.min(me.maxHp, me.hp + card.onPlayHealHero);
      next.log = [
        `${card.name}: призыв, герой +${card.onPlayHealHero}`,
        ...next.log,
      ].slice(0, 10);
    }
    next.log = [
      `${me.name} ставит ${card.name} [${patternOf(cardId, spawned)}] в слот ${slotIndex + 1}`,
      ...next.log,
    ].slice(0, 10);
  } else {
    const need = spellNeedsTarget(card.spellEffects ?? []);
    if (need === "ally_pair") {
      next.log = ["Выбери стража, затем подопечного", ...next.log].slice(
        0,
        10,
      );
      return next;
    }
    if (need && need !== "enemy_or_hero" && slotIndex == null) {
      next.log = [
        need === "ally"
          ? "Выбери своё существо"
          : need === "enemy"
            ? "Выбери вражеское существо"
            : "Выбери цель",
        ...next.log,
      ].slice(0, 10);
      return next;
    }
    if (need === "ally" && (slotIndex == null || !me.slots[slotIndex])) {
      next.log = ["Нужна цель — своё существо", ...next.log].slice(0, 10);
      return next;
    }
    if (
      need === "ally" &&
      slotIndex != null &&
      me.slots[slotIndex] &&
      !allyValidForSpell(card.id, me.slots[slotIndex]!.cardId)
    ) {
      const only = (card.spellEffects ?? []).find(
        (e) => e.type === "buff_permanent" && e.onlySchool,
      );
      const school =
        only && only.type === "buff_permanent" ? only.onlySchool : null;
      next.log = [
        school === "death"
          ? "Бонус нежити: цель должна быть нежитью"
          : "Цель не подходит для этого заклинания",
        ...next.log,
      ].slice(0, 10);
      return next;
    }
    if (need === "enemy" && (slotIndex == null || !foe.slots[slotIndex])) {
      next.log = ["Нужна цель — враг", ...next.log].slice(0, 10);
      return next;
    }
    if (
      need === "enemy_or_hero" &&
      slotIndex != null &&
      !foe.slots[slotIndex]
    ) {
      next.log = [
        "Кликни существо врага или его оракула",
        ...next.log,
      ].slice(0, 10);
      return next;
    }
    if (
      (need === "enemy" || need === "enemy_or_hero") &&
      slotIndex != null &&
      foe.slots[slotIndex] &&
      spellBlockedByImmunity(card.school, foe.slots[slotIndex]!.cardId, foe.slots[slotIndex]!)
    ) {
      next.log = [
        `${getCard(foe.slots[slotIndex]!.cardId).name} невосприимчив к этому заклинанию`,
        ...next.log,
      ].slice(0, 10);
      return next;
    }
    if (
      need === "ally" &&
      slotIndex != null &&
      me.slots[slotIndex] &&
      hasAbility(me.slots[slotIndex]!.cardId, "immune_spells", me.slots[slotIndex]!)
    ) {
      next.log = [
        `${getCard(me.slots[slotIndex]!.cardId).name} невосприимчив к заклинаниям`,
        ...next.log,
      ].slice(0, 10);
      return next;
    }
    payMana(me.mana, cost);
    me.hand.splice(handIndex, 1);
    const linger = isLingeringSpell(cardId);
    const baseEffects =
      card.spellEffects && card.spellEffects.length > 0
        ? card.spellEffects
        : cardId === "hero_mana"
          ? [{ type: "gain_mana" as const, amount: 1 }]
          : [];
    const spellLv = battleUpgradeLevel(next, next.active, cardId);
    const effects = resolveSpellEffects(cardId, baseEffects, spellLv);
    const ownBefore = me.mana[me.faction] ?? 0;
    const ok = applySpellEffects(
      next,
      me,
      foe,
      effects,
      slotIndex,
      next.log,
      linger ? { cardId } : undefined,
    );
    if (!ok) {
      // карта возвращается в руку? сейчас уже снята — в грейв
      me.graveyard.push(cardId);
      next.log = ["Цель не подходит", ...next.log].slice(0, 10);
      return next;
    }
    if (
      cardId === "hero_mana" &&
      (me.mana[me.faction] ?? 0) <= ownBefore
    ) {
      addMana(me.mana, manaSchoolOf(me), 1);
      next.log = [
        `${me.name}: +1 маны своей школы (${me.faction})`,
        ...next.log,
      ].slice(0, 10);
    }
    if (!linger) {
      // разовое: эхо на рейке; рамп маны — сразу в грейв (см. addSpellEcho)
      addSpellEcho(next, me, foe, cardId, effects);
    }
    next.log = [`${me.name}: ${card.name}`, ...next.log].slice(0, 10);
  }

  next.selectedHand = null;
  next.selectedSlot = null;
  checkWinner(next);
  return next;
}

/** Ангел: действие хода — союзник навсегда +1/+1 (вместо атаки). */
export function healWithAngel(
  state: BattleState,
  fromSlot: number,
  toSlot: number,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const healer = me.slots[fromSlot];
  const target = me.slots[toSlot];
  if (!healer || !healer.canAttack) return state;
  if (abilityOf(healer.cardId, healer) !== "angel_heal") return state;
  if (!target) {
    next.log = ["Нужен союзник для лечения", ...next.log].slice(0, 10);
    return next;
  }

  const buff = angelBuffAmount(hostUpgradeLevel(healer, healer.cardId));
  target.permAttack += buff.atk;
  target.permHealth += buff.hp;
  target.attack += buff.atk;
  target.health += buff.hp;
  healer.canAttack = false;
  next.selectedSlot = null;
  next.log = [
    `${getCard(healer.cardId).name} благословляет ${getCard(target.cardId).name}: +${buff.atk}/+${buff.hp} → ${target.attack}/${target.health}`,
    ...next.log,
  ].slice(0, 10);
  return next;
}

export function angelHealReady(state: BattleState, fromSlot: number): boolean {
  const u = state.you.slots[fromSlot];
  return !!u && u.canAttack && abilityOf(u.cardId, u) === "angel_heal";
}

/**
 * Маг жизни: вместо удара — навсегда +3 HP союзнику или оракулу.
 * toSlot === "hero" → свой оракул (maxHp и hp +3).
 */
export function buffWithMage(
  state: BattleState,
  fromSlot: number,
  toSlot: number | "hero",
): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const mage = me.slots[fromSlot];
  if (!mage || !mage.canAttack) return state;
  if (abilityOf(mage.cardId, mage) !== "mage_flex") return state;

  const heal = mageHealAmount(hostUpgradeLevel(mage, mage.cardId));
  if (toSlot === "hero") {
    me.maxHp += heal;
    me.hp += heal;
    mage.canAttack = false;
    next.selectedSlot = null;
    next.log = [
      `${getCard(mage.cardId).name} дарует оракулу +${heal} HP навсегда → ${me.hp}/${me.maxHp}`,
      ...next.log,
    ].slice(0, 10);
    return next;
  }

  const target = me.slots[toSlot];
  if (!target) {
    next.log = ["Нужен союзник или оракул для благословения", ...next.log].slice(
      0,
      10,
    );
    return next;
  }

  target.permHealth += heal;
  target.health += heal;
  // ур.3: вторая цель — соседний союзник (если есть)
  const lv = hostUpgradeLevel(mage, mage.cardId);
  if (lv >= 3) {
    const neighbor = [toSlot - 1, toSlot + 1]
      .map((i) => (i >= 0 && i <= 4 ? me.slots[i] : null))
      .find((u) => u && u.uid !== target.uid);
    if (neighbor) {
      neighbor.permHealth += heal;
      neighbor.health += heal;
      next.log = [
        `${getCard(mage.cardId).name} также лечит ${getCard(neighbor.cardId).name} +${heal}`,
        ...next.log,
      ].slice(0, 10);
    }
  }
  mage.canAttack = false;
  next.selectedSlot = null;
  next.log = [
    `${getCard(mage.cardId).name} дарует ${getCard(target.cardId).name} +${heal} HP навсегда → ${target.attack}/${target.health}`,
    ...next.log,
  ].slice(0, 10);
  return next;
}

export function mageFlexReady(state: BattleState, fromSlot: number): boolean {
  const u = state.you.slots[fromSlot];
  return !!u && u.canAttack && abilityOf(u.cardId, u) === "mage_flex";
}

/** Валькирия / Акулит / Странник: можно переместиться на пустой свой слот. */
export function moveFlexReady(state: BattleState, fromSlot: number): boolean {
  const u = state.you.slots[fromSlot];
  if (!u || !u.canAttack) return false;
  return (
    hasAbility(u.cardId, "valkyrie_flex", u) ||
    hasAbility(u.cardId, "aquilite_swap", u)
  );
}

/** Перемещение на свободный свой слот (тратит действие хода). */
export function moveUnitToEmptySlot(
  state: BattleState,
  fromSlot: number,
  toSlot: number,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  if (fromSlot === toSlot) return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const unit = me.slots[fromSlot];
  if (!unit || !unit.canAttack) return state;
  if (
    !hasAbility(unit.cardId, "valkyrie_flex", unit) &&
    !hasAbility(unit.cardId, "aquilite_swap", unit)
  ) {
    return state;
  }
  if (toSlot < 0 || toSlot > 4 || me.slots[toSlot]) {
    next.log = ["Нужен свободный свой слот", ...next.log].slice(0, 10);
    return next;
  }
  me.slots[toSlot] = unit;
  me.slots[fromSlot] = null;
  const lv = hostUpgradeLevel(unit, unit.cardId);
  const free =
    (unit.cardId === "valkyrie" && valkyrieFreeMove(lv)) ||
    (unit.cardId === "aquilite" && aquiliteFreeMove(lv)) ||
    (unit.cardId === "wanderer" && wandererFreeMove(lv));
  if (!free) unit.canAttack = false;
  next.selectedSlot = free ? toSlot : null;
  next.selectedHand = null;
  syncBoardAuras(me, next.log);
  next.log = [
    free
      ? `${getCard(unit.cardId).name} перемещается в слот ${toSlot + 1} (может ещё ударить)`
      : `${getCard(unit.cardId).name} перемещается в слот ${toSlot + 1}`,
    ...next.log,
  ].slice(0, 10);
  return next;
}

/** Паладин: щит союзнику (−50% на 2 хода) вместо атаки. */
export function shieldWithPaladin(
  state: BattleState,
  fromSlot: number,
  toSlot: number,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const src = me.slots[fromSlot];
  const target = me.slots[toSlot];
  if (!src || !src.canAttack) return state;
  if (abilityOf(src.cardId, src) !== "paladin_flex") return state;
  const lv = hostUpgradeLevel(src, src.cardId);
  const turns = paladinShieldTurns(lv);
  if (paladinShieldsArmy(lv)) {
    let n = 0;
    for (const u of me.slots) {
      if (!u) continue;
      u.statuses = u.statuses.filter((st) => st.type !== "shield");
      u.statuses.push({ type: "shield", amount: turns });
      n += 1;
    }
    src.canAttack = false;
    next.selectedSlot = null;
    next.log = [
      `${getCard(src.cardId).name}: щит всей армии на ${turns} ход (${n})`,
      ...next.log,
    ].slice(0, 10);
    return next;
  }
  if (!target) {
    next.log = ["Нужен союзник для щита", ...next.log].slice(0, 10);
    return next;
  }
  target.statuses = target.statuses.filter((st) => st.type !== "shield");
  target.statuses.push({ type: "shield", amount: turns });
  src.canAttack = false;
  next.selectedSlot = null;
  next.log = [
    `${getCard(src.cardId).name} даёт щит ${getCard(target.cardId).name} (−50% урона, ${turns} хода)`,
    ...next.log,
  ].slice(0, 10);
  return next;
}

export function paladinFlexReady(state: BattleState, fromSlot: number): boolean {
  const u = state.you.slots[fromSlot];
  return !!u && u.canAttack && abilityOf(u.cardId, u) === "paladin_flex";
}

/** Последние N убитых существ из грейва (новые первые), с индексом в массиве. */
export function recentGraveCreatures(
  graveyard: string[],
  limit = 5,
): Array<{ index: number; cardId: string }> {
  const out: Array<{ index: number; cardId: string }> = [];
  for (let i = graveyard.length - 1; i >= 0 && out.length < limit; i--) {
    const id = graveyard[i]!;
    if (getCard(id).kind === "creature") {
      out.push({ index: i, cardId: id });
    }
  }
  return out;
}

/** Могильщик: поднять выбранное существо из грейва в пустой слот. */
export function reviveWithGravedigger(
  state: BattleState,
  fromSlot: number,
  toSlot: number,
  graveIndex: number,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const src = me.slots[fromSlot];
  if (!src || !src.canAttack) return state;
  if (abilityOf(src.cardId, src) !== "gravedigger_flex") return state;
  if (me.slots[toSlot]) {
    next.log = ["Слот занят", ...next.log].slice(0, 10);
    return next;
  }
  const visible = recentGraveCreatures(me.graveyard, 5);
  const pick = visible.find((e) => e.index === graveIndex);
  if (!pick) {
    next.log = ["Эта карта недоступна в грейве", ...next.log].slice(0, 10);
    return next;
  }
  const lv = hostUpgradeLevel(src, src.cardId);
  const limit = gravediggerReviveLimit(lv);
  const used = src.graveRevivesUsed ?? 0;
  if (limit != null && used >= limit) {
    next.log = [
      limit <= 0
        ? "Могильщик ур.1 не поднимает мёртвых"
        : "Могильщик уже поднимал в этом бою",
      ...next.log,
    ].slice(0, 10);
    return next;
  }
  const cardId = me.graveyard.splice(pick.index, 1)[0]!;
  const raised = spawnCreature(
    cardId,
    next.rules,
    battleUpgradeLevel(next, "you", cardId),
  );
  if (gravediggerReviveBuff(lv)) {
    raised.permAttack += 1;
    raised.permHealth += 1;
    raised.attack += 1;
    raised.health += 1;
    raised.baseAttack += 1;
    raised.baseHealth += 1;
  }
  me.slots[toSlot] = raised;
  src.graveRevivesUsed = used + 1;
  src.canAttack = false;
  next.selectedSlot = null;
  syncBoardAuras(me, next.log);
  next.log = [
    `${getCard(src.cardId).name} поднимает ${getCard(cardId).name} из грейва в слот ${toSlot + 1}${
      gravediggerReviveBuff(lv) ? " (+1/+1)" : ""
    }`,
    ...next.log,
  ].slice(0, 10);
  return next;
}

export function gravediggerFlexReady(
  state: BattleState,
  fromSlot: number,
): boolean {
  const u = state.you.slots[fromSlot];
  if (!u || !u.canAttack || abilityOf(u.cardId, u) !== "gravedigger_flex") {
    return false;
  }
  const limit = gravediggerReviveLimit(hostUpgradeLevel(u, u.cardId));
  const used = u.graveRevivesUsed ?? 0;
  if (limit != null && used >= limit) return false;
  return true;
}

/** Тритон: действие хода — призвать Акулита в свободный слот (вместо атаки). */
export function summonAquiliteWithTriton(
  state: BattleState,
  fromSlot: number,
  toSlot: number,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const triton = me.slots[fromSlot];
  if (!triton || !triton.canAttack) return state;
  if (abilityOf(triton.cardId, triton) !== "triton_flex") return state;
  if (toSlot < 0 || toSlot > 4 || me.slots[toSlot]) {
    next.log = ["Нужен свободный свой слот для Акулита", ...next.log].slice(
      0,
      10,
    );
    return next;
  }

  const aqua = spawnCreature(
    "aquilite",
    next.rules,
    battleUpgradeLevel(next, "you", "aquilite"),
  );
  // Призыв тритона: акулит всегда с rush
  aqua.canAttack = true;
  me.slots[toSlot] = aqua;
  triton.canAttack = false;
  next.selectedSlot = null;
  next.selectedHand = null;
  syncBoardAuras(me, next.log);
  next.log = [
    `${getCard(triton.cardId).name} призывает Акулита в слот ${toSlot + 1}`,
    ...next.log,
  ].slice(0, 10);
  return next;
}

export function tritonFlexReady(state: BattleState, fromSlot: number): boolean {
  const u = state.you.slots[fromSlot];
  return !!u && u.canAttack && abilityOf(u.cardId, u) === "triton_flex";
}

export function mermaidFlexReady(state: BattleState, fromSlot: number): boolean {
  const u = state.you.slots[fromSlot];
  return !!u && u.canAttack && abilityOf(u.cardId, u) === "mermaid_flex";
}

export function succubusFlexReady(
  state: BattleState,
  fromSlot: number,
): boolean {
  const u = state.you.slots[fromSlot];
  return !!u && u.canAttack && abilityOf(u.cardId, u) === "succubus_flex";
}

export function bansheeFlexReady(
  state: BattleState,
  fromSlot: number,
): boolean {
  const u = state.you.slots[fromSlot];
  return !!u && u.canAttack && abilityOf(u.cardId, u) === "banshee_flex";
}

export function balthazarFlexReady(
  state: BattleState,
  fromSlot: number,
): boolean {
  const u = state.you.slots[fromSlot];
  return !!u && u.canAttack && abilityOf(u.cardId, u) === "balthazar_flex";
}

export function necroFlexReady(state: BattleState, fromSlot: number): boolean {
  const u = state.you.slots[fromSlot];
  return !!u && u.canAttack && abilityOf(u.cardId, u) === "necro_flex";
}

export function hornetQueenFlexReady(
  state: BattleState,
  fromSlot: number,
): boolean {
  const u = state.you.slots[fromSlot];
  return !!u && u.canAttack && abilityOf(u.cardId, u) === "hornet_queen_flex";
}

export function leshyFlexReady(state: BattleState, fromSlot: number): boolean {
  const u = state.you.slots[fromSlot];
  return !!u && u.canAttack && abilityOf(u.cardId, u) === "leshy_flex";
}

export function leshyEnemySwapReady(
  state: BattleState,
  fromSlot: number,
): boolean {
  const u = state.you.slots[fromSlot];
  return (
    !!u &&
    u.canAttack &&
    abilityOf(u.cardId, u) === "leshy_flex" &&
    leshyCanTargetEnemy(hostUpgradeLevel(u, u.cardId))
  );
}

export function arbiterFlexReady(state: BattleState, fromSlot: number): boolean {
  const u = state.you.slots[fromSlot];
  return (
    !!u &&
    u.canAttack &&
    abilityOf(u.cardId, u) === "arbiter_flex" &&
    !u.arbiterVerdictUsed
  );
}

export function unicornFlexReady(state: BattleState, fromSlot: number): boolean {
  const u = state.you.slots[fromSlot];
  return !!u && u.canAttack && abilityOf(u.cardId, u) === "unicorn_flex";
}

export function infernoFlexReady(state: BattleState, fromSlot: number): boolean {
  const u = state.you.slots[fromSlot];
  return (
    !!u &&
    u.canAttack &&
    hasAbility(u.cardId, "inferno_flex", u) &&
    !u.infernoCleaveUsed
  );
}

/** Инферно ур.3: раз за бой — дыхание (cleave) вместо одного удара. */
export function cleaveBreathWithInferno(
  state: BattleState,
  fromSlot: number,
  centerSlot: number,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const foe = next.enemy;
  const src = me.slots[fromSlot];
  if (!src || !src.canAttack) return state;
  if (!hasAbility(src.cardId, "inferno_flex", src) || src.infernoCleaveUsed) {
    return state;
  }
  if (centerSlot < 0 || centerSlot > 4 || !foe.slots[centerSlot]) {
    next.log = ["Нужна цель для дыхания", ...next.log].slice(0, 10);
    return next;
  }
  cleaveHit(me, foe, fromSlot, centerSlot, next.log, next);
  const after = me.slots[fromSlot];
  if (after && after.uid === src.uid) {
    after.infernoCleaveUsed = true;
    after.canAttack = false;
  }
  next.selectedSlot = null;
  next.log = [
    `${getCard(src.cardId).name}: дыхание инферно!`,
    ...next.log,
  ].slice(0, 10);
  pruneLingering(next);
  next.log = next.log.slice(0, 10);
  checkWinner(next);
  return next;
}

/**
 * Единорог: разбить одно длящееся заклинание врага вместо атаки.
 */
export function breakSpellWithUnicorn(
  state: BattleState,
  fromSlot: number,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const foe = next.enemy;
  const src = me.slots[fromSlot];
  if (!src || !src.canAttack || abilityOf(src.cardId, src) !== "unicorn_flex") {
    return state;
  }
  const removed = breakOneEnemySpell(foe, next, next.log);
  if (!removed) {
    const echoOnly = countEnemySpellEchoes(foe, next) > 0;
    next.log = [
      echoOnly
        ? `${getCard(src.cardId).name}: у врага только серые следы — снять нельзя`
        : `${getCard(src.cardId).name}: у врага нет длящихся заклинаний`,
      ...next.log,
    ].slice(0, 10);
    return next;
  }
  const keep = unicornKeepAttackAfterBreak(
    hostUpgradeLevel(src, src.cardId),
  );
  if (!keep) src.canAttack = false;
  next.selectedSlot = null;
  next.log = [
    keep
      ? `${getCard(src.cardId).name} разбивает заклинание рогом — ещё может ударить`
      : `${getCard(src.cardId).name} разбивает заклинание рогом`,
    ...next.log,
  ].slice(0, 10);
  return next;
}

/** Сжать существо до 1/1 навсегда (базы и текущие статы). */
function smashToOneOne(c: CreatureInstance): void {
  c.baseAttack = 1;
  c.baseHealth = 1;
  c.permAttack = 0;
  c.permHealth = 0;
  c.packBonus = 0;
  c.swarmBonus = 0;
  c.auraHp = 0;
  c.attack = 1;
  c.health = 1;
}

/**
 * Арбитр — Вердикт: все существа на поле → 1/1, кроме самого Арбитра.
 * Тратит действие атаки.
 */
export function verdictWithArbiter(
  state: BattleState,
  fromSlot: number,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const foe = next.enemy;
  const src = me.slots[fromSlot];
  if (!src || !src.canAttack || abilityOf(src.cardId, src) !== "arbiter_flex") {
    return state;
  }
  if (src.arbiterVerdictUsed) {
    next.log = [
      `${getCard(src.cardId).name}: вердикт уже вынесен в этом бою`,
      ...next.log,
    ].slice(0, 10);
    return next;
  }

  const lv = hostUpgradeLevel(src, src.cardId);
  const spareLegends = arbiterSparesAllyLegend(lv);
  const skipUid = src.uid;
  let n = 0;
  for (const side of [me, foe]) {
    for (const u of side.slots) {
      if (!u || u.uid === skipUid) continue;
      if (
        spareLegends &&
        side === me &&
        getCard(u.cardId).rarity === "legendary"
      ) {
        continue;
      }
      smashToOneOne(u);
      n++;
    }
  }

  src.arbiterVerdictUsed = true;
  if (arbiterSelfBuff(lv)) {
    src.permAttack += 1;
    src.permHealth += 1;
    src.baseAttack += 1;
    src.baseHealth += 1;
    src.attack += 1;
    src.health += 1;
  }
  src.canAttack = false;
  next.selectedSlot = null;
  next.log = [
    n > 0
      ? `⚖ Вердикт ${getCard(src.cardId).name}: ${n} существ стали 1/1${
          arbiterSelfBuff(lv) ? " (+1/+1 себе)" : ""
        }`
      : `⚖ Вердикт: на поле некого уравнять`,
    ...next.log,
  ].slice(0, 10);
  return next;
}

/**
 * Леший: навсегда меняет местами базовые ATK и HP
 * (союзник с ур.2; враг — с ур.3).
 */
export function swapStatsWithLeshy(
  state: BattleState,
  fromSlot: number,
  side: "you" | "enemy",
  toSlot: number,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const src = me.slots[fromSlot];
  if (!src || !src.canAttack || abilityOf(src.cardId, src) !== "leshy_flex") {
    return state;
  }
  if (
    side === "enemy" &&
    !leshyCanTargetEnemy(hostUpgradeLevel(src, src.cardId))
  ) {
    next.log = ["Леший меняет статы врагу только с ур.3", ...next.log].slice(
      0,
      10,
    );
    return next;
  }
  if (side === "you" && toSlot === fromSlot) {
    next.log = ["Леший не меняет статы сам себе", ...next.log].slice(0, 10);
    return next;
  }
  const owner = side === "you" ? next.you : next.enemy;
  const target = owner.slots[toSlot];
  if (!target) {
    next.log = [
      side === "you"
        ? "Нужен союзник для обмена статов"
        : "Нужен враг для обмена статов",
      ...next.log,
    ].slice(0, 10);
    return next;
  }

  const before = `${target.attack}/${target.health}`;
  const ba = target.baseAttack;
  target.baseAttack = target.baseHealth;
  target.baseHealth = ba;
  const pa = target.permAttack;
  target.permAttack = target.permHealth;
  target.permHealth = pa;
  const base = effectiveBase(target);
  target.attack = base.atk;
  target.health = base.hp;
  src.canAttack = false;
  next.selectedSlot = null;
  next.log = [
    `${getCard(src.cardId).name} меняет статы ${getCard(target.cardId).name}: ${before} → ${target.attack}/${target.health}`,
    ...next.log,
  ].slice(0, 10);
  if (target.health <= 0) {
    removeIfDead(owner, toSlot, next.log, next);
  }
  checkWinner(next);
  return next;
}

/** Банши: оглушить любое существо врага на 1 ход. */
export function stunWithBanshee(
  state: BattleState,
  fromSlot: number,
  toSlot: number,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const foe = next.enemy;
  const src = me.slots[fromSlot];
  const tgt = foe.slots[toSlot];
  if (!src || !src.canAttack || abilityOf(src.cardId, src) !== "banshee_flex") {
    return state;
  }
  if (!tgt) {
    next.log = ["Нужна цель для оглушения", ...next.log].slice(0, 10);
    return next;
  }
  const turns = bansheeStunTurns(hostUpgradeLevel(src, src.cardId));
  tgt.canAttack = false;
  tgt.statuses = tgt.statuses.filter((st) => st.type !== "sleep");
  tgt.statuses.push({ type: "sleep", amount: turns });
  next.log = [
    `${getCard(src.cardId).name} оглушает ${getCard(tgt.cardId).name} на ${turns} ход.`,
    ...next.log,
  ].slice(0, 10);
  src.canAttack = false;
  next.selectedSlot = null;
  return next;
}

/** Бальтазар: поменять две карты врага местами. */
export function swapEnemyWithBalthazar(
  state: BattleState,
  fromSlot: number,
  slotA: number,
  slotB: number,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  if (slotA === slotB) return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const foe = next.enemy;
  const src = me.slots[fromSlot];
  if (!src || !src.canAttack || abilityOf(src.cardId, src) !== "balthazar_flex") {
    return state;
  }
  const a = foe.slots[slotA];
  const b = foe.slots[slotB];
  if (!a || !b) {
    next.log = ["Нужны две карты врага для обмена", ...next.log].slice(0, 10);
    return next;
  }
  foe.slots[slotA] = b;
  foe.slots[slotB] = a;
  const loss = balthazarSwapAtkLoss(hostUpgradeLevel(src, src.cardId));
  if (loss > 0) {
    for (const u of [a, b]) {
      u.permAttack -= loss;
      u.attack = Math.max(0, u.attack - loss);
    }
  }
  src.canAttack = false;
  next.selectedSlot = null;
  next.log = [
    loss > 0
      ? `${getCard(src.cardId).name}: обмен ${getCard(a.cardId).name} ↔ ${getCard(b.cardId).name} (−${loss} ATK)`
      : `${getCard(src.cardId).name}: обмен ${getCard(a.cardId).name} ↔ ${getCard(b.cardId).name}`,
    ...next.log,
  ].slice(0, 10);
  return next;
}

/** Некромант: призвать скелета. */
export function summonSkeletonWithNecro(
  state: BattleState,
  fromSlot: number,
  toSlot: number,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const necro = me.slots[fromSlot];
  if (!necro || !necro.canAttack) return state;
  if (abilityOf(necro.cardId, necro) !== "necro_flex") return state;
  if (me.slots[toSlot]) {
    next.log = ["Слот занят", ...next.log].slice(0, 10);
    return next;
  }
  const count = necroSummonCount(hostUpgradeLevel(necro, necro.cardId));
  const slots: number[] = [toSlot];
  if (count >= 2) {
    for (let i = 0; i < 5 && slots.length < count; i++) {
      if (!me.slots[i] && i !== toSlot) slots.push(i);
    }
  }
  for (const slot of slots) {
    me.slots[slot] = spawnCreature(
      "skeleton",
      next.rules,
      battleUpgradeLevel(next, "you", "skeleton"),
    );
  }
  necro.canAttack = false;
  next.selectedSlot = null;
  syncBoardAuras(me, next.log);
  next.log = [
    slots.length > 1
      ? `${getCard(necro.cardId).name} призывает ${slots.length} скелетов`
      : `${getCard(necro.cardId).name} призывает Скелета в слот ${toSlot + 1}`,
    ...next.log,
  ].slice(0, 10);
  return next;
}

/** Матка шершней: призвать Шершня-воина. */
export function summonHornetWithQueen(
  state: BattleState,
  fromSlot: number,
  toSlot: number,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const queen = me.slots[fromSlot];
  if (!queen || !queen.canAttack) return state;
  if (abilityOf(queen.cardId, queen) !== "hornet_queen_flex") return state;
  if (me.slots[toSlot]) {
    next.log = ["Слот занят", ...next.log].slice(0, 10);
    return next;
  }
  me.slots[toSlot] = spawnCreature("hornet_warrior", next.rules);
  queen.canAttack = false;
  next.selectedSlot = null;
  syncBoardAuras(me, next.log);
  next.log = [
    `${getCard(queen.cardId).name} создаёт Шершня-воина в слот ${toSlot + 1}`,
    ...next.log,
  ].slice(0, 10);
  return next;
}

/** Русалка: усыпить врага (не женщину-воина). */
export function sleepWithMermaid(
  state: BattleState,
  fromSlot: number,
  toSlot: number,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const foe = next.enemy;
  const src = me.slots[fromSlot];
  const tgt = foe.slots[toSlot];
  if (!src || !src.canAttack || abilityOf(src.cardId, src) !== "mermaid_flex") {
    return state;
  }
  if (!tgt) {
    next.log = ["Нужна цель для усыпления", ...next.log].slice(0, 10);
    return next;
  }
  if (isFemaleWarrior(tgt.cardId)) {
    next.log = [
      `Русалка не может усыпить ${getCard(tgt.cardId).name} (женщина)`,
      ...next.log,
    ].slice(0, 10);
    return next;
  }
  const turns = mermaidSleepTurns(hostUpgradeLevel(src, src.cardId));
  tgt.canAttack = false;
  tgt.statuses = tgt.statuses.filter((st) => st.type !== "sleep");
  tgt.statuses.push({ type: "sleep", amount: turns });
  next.log = [
    `${getCard(src.cardId).name} усыпляет ${getCard(tgt.cardId).name} на ${turns} ход.`,
    ...next.log,
  ].slice(0, 10);
  src.canAttack = false;
  next.selectedSlot = null;
  return next;
}

/** Сукуб: усыпить любую мужскую карту. */
export function sleepWithSuccubus(
  state: BattleState,
  fromSlot: number,
  toSlot: number,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const foe = next.enemy;
  const src = me.slots[fromSlot];
  const tgt = foe.slots[toSlot];
  if (!src || !src.canAttack || abilityOf(src.cardId, src) !== "succubus_flex") {
    return state;
  }
  if (!tgt) {
    next.log = ["Нужна цель для усыпления", ...next.log].slice(0, 10);
    return next;
  }
  if (creatureGender(tgt.cardId) !== "male") {
    next.log = [
      `Сукуб усыпляет только мужчин (не ${getCard(tgt.cardId).name})`,
      ...next.log,
    ].slice(0, 10);
    return next;
  }
  const turns = succubusSleepTurns(hostUpgradeLevel(src, src.cardId));
  tgt.canAttack = false;
  tgt.statuses = tgt.statuses.filter((st) => st.type !== "sleep");
  tgt.statuses.push({ type: "sleep", amount: turns });
  next.log = [
    `${getCard(src.cardId).name} усыпляет ${getCard(tgt.cardId).name} на ${turns} ход.`,
    ...next.log,
  ].slice(0, 10);
  src.canAttack = false;
  next.selectedSlot = null;
  return next;
}

/**
 * Цель «в лоб»: клетка напротив, иначе герой (если доступен).
 * Для кнопки «Атаковать всеми».
 */
export function forwardAttackTarget(
  state: BattleState,
  fromSlot: number,
): "hero" | number | null {
  const atk = state.you.slots[fromSlot];
  if (!atk?.canAttack) return null;
  const valid = validAttackTargets(state, fromSlot);
  if (state.enemy.slots[fromSlot] && valid.includes(fromSlot)) {
    return fromSlot;
  }
  if (valid.includes("hero")) return "hero";
  return null;
}

/** Все готовые существа бьют клетку напротив или героя. */
export function attackAllForward(state: BattleState): BattleState {
  if (state.winner || state.active !== "you") return state;
  let next = state;
  for (let i = 0; i < 5; i++) {
    const target = forwardAttackTarget(next, i);
    if (target == null) continue;
    next = attackWith(next, i, target);
    if (next.winner) break;
  }
  return next;
}

export function attackWith(
  state: BattleState,
  fromSlot: number,
  target: "hero" | number,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const foe = next.enemy;
  const atk = me.slots[fromSlot];
  if (!atk || !atk.canAttack) return state;

  const pattern = patternOf(atk.cardId, atk);
  const valid = validAttackTargets(state, fromSlot);
  if (!valid.includes(target)) {
    next.log = ["Эта цель недоступна для атаки", ...next.log].slice(0, 10);
    return next;
  }

  if (typeof target === "number") {
    const tUnit = foe.slots[target];
    if (tUnit && isAttackBanned(me, tUnit.cardId)) {
      next.log = [
        `Страх: нельзя бить школу «${me.attackBanSchool}»`,
        ...next.log,
      ].slice(0, 10);
      return next;
    }
  }

  if (target === "hero") {
    if (
      (pattern === "melee" || pattern === "melee_lane3") &&
      foe.slots[fromSlot]
    ) {
      next.log = ["Слот занят — бей существо", ...next.log].slice(0, 10);
      return next;
    }
    const hd = outgoingDamage(me, strikePower(atk));
    foe.hp -= hd;
    atk.canAttack = false;
    next.log = [
      `${getCard(atk.cardId).name} бьёт героя на ${hd}`,
      ...next.log,
    ].slice(0, 10);
    applyOnHitExtras(atk, null, me, foe, next.log);
    tryVampireGrow(me, fromSlot, next.log);
  } else if (pattern === "melee") {
    if (target !== fromSlot) {
      next.log = ["Обычный юнит бьёт только напротив", ...next.log].slice(
        0,
        10,
      );
      return next;
    }
    meleeStrike(me, foe, fromSlot, target, next.log, next);
  } else if (pattern === "melee_lane3") {
    if (!cleaveSlots(fromSlot).includes(target)) {
      next.log = ["Можно бить только напротив / слева / справа", ...next.log].slice(
        0,
        10,
      );
      return next;
    }
    meleeStrike(me, foe, fromSlot, target, next.log, next);
  } else if (pattern === "ranged") {
    rangedHit(me, foe, fromSlot, target, next.log, next);
  } else if (pattern === "lane_cleave3") {
    // Всегда клеов от СВОЕГО слота: напротив / слева / справа
    cleaveHit(me, foe, fromSlot, fromSlot, next.log, next);
  } else if (pattern === "cleave3") {
    cleaveHit(me, foe, fromSlot, target, next.log, next);
  } else if (pattern === "aoe_all") {
    const names: string[] = [];
    foe.slots.forEach((s) => {
      if (!s) return;
      if (!canPhysicallyAttack(atk.cardId, s.cardId, s)) return;
      dealToCreature(s, atk.attack, next.log);
      names.push(getCard(s.cardId).name);
    });
    atk.canAttack = false;
    next.log = [
      `${getCard(atk.cardId).name} бьёт всех [${names.join(", ") || "пусто"}] по ${atk.attack}`,
      ...next.log,
    ].slice(0, 10);
    foe.slots.forEach((_, i) => removeIfDead(foe, i, next.log, next));
    tryVampireGrow(me, fromSlot, next.log);
  }

  tryElfDoubleShot(me.slots[fromSlot]);
  next.selectedSlot = null;
  pruneLingering(next);
  next.log = next.log.slice(0, 10);
  checkWinner(next);
  return next;
}

/** Эльф ур.3: вторая стрела в том же ходу. */
function tryElfDoubleShot(atk: CreatureInstance | null | undefined): void {
  if (!atk || atk.cardId !== "elf") return;
  if (!elfDoubleShot(hostUpgradeLevel(atk, atk.cardId))) return;
  if (atk.elfExtraUsed) return;
  atk.elfExtraUsed = true;
  atk.canAttack = true;
}

function refreshCanAttack(p: PlayerState): void {
  p.slots.forEach((s) => {
    if (!s) return;
    s.elfExtraUsed = false;
    if (s.statuses.some((st) => st.type === "traitor")) {
      s.canAttack = false;
      return;
    }
    if (s.statuses.some((st) => st.type === "bunker")) {
      s.canAttack = false;
      return;
    }
    if (p.muteRangedTurns > 0) {
      const pat = patternOf(s.cardId);
      if (
        pat === "ranged" ||
        hasAbility(s.cardId, "mage_flex", s) ||
        hasAbility(s.cardId, "arbiter_flex", s)
      ) {
        s.canAttack = false;
        return;
      }
    }
    const sleep = s.statuses.find((st) => st.type === "sleep");
    if (sleep) {
      s.canAttack = false;
      sleep.amount -= 1;
      if (sleep.amount <= 0) {
        s.statuses = s.statuses.filter((st) => st.type !== "sleep");
      }
    } else {
      s.canAttack = true;
    }
  });
}

function tickUnitStatuses(p: PlayerState, log: string[]): void {
  for (let i = 0; i < p.slots.length; i++) {
    const s = p.slots[i];
    if (!s) continue;
    const bunker = s.statuses.find((st) => st.type === "bunker");
    if (bunker) {
      bunker.amount -= 1;
      if (bunker.amount <= 0) {
        s.statuses = s.statuses.filter((st) => st.type !== "bunker");
        log.unshift(`${getCard(s.cardId).name}: вышел из «домика»`);
        p.activeSpells = p.activeSpells.filter((sp) => {
          if (sp.kind === "bunker" && sp.targetUid === s.uid) {
            // бункер висит на своей стороне = кастер
            p.graveyard.push(sp.cardId);
            return false;
          }
          return true;
        });
      }
    }
    const sniper = s.statuses.find((st) => st.type === "sniper");
    if (sniper) {
      sniper.amount -= 1;
      if (sniper.amount <= 0) {
        const bonus = 2;
        s.attack = Math.max(0, s.attack - bonus);
        s.permAttack = Math.max(0, s.permAttack - bonus);
        s.statuses = s.statuses.filter((st) => st.type !== "sniper");
        log.unshift(`${getCard(s.cardId).name}: снайперский прицел спал`);
      }
    }
  }
  if (p.attackBanTurns > 0) {
    p.attackBanTurns -= 1;
    if (p.attackBanTurns <= 0) {
      p.attackBanSchool = null;
      log.unshift(`${p.name}: страх спал — можно бить все школы`);
    }
  }
}

/** Изменник бьёт случайного своего (слева/справа или по паттерну), без способностей. */
function resolveTraitorStrikes(
  state: BattleState,
  caster: PlayerState,
  log: string[],
): void {
  const traitors = [
    ...state.you.activeSpells,
    ...state.enemy.activeSpells,
  ].filter(
    (sp) =>
      sp.kind === "traitor" &&
      sp.targetUid &&
      (sp.casterSide ?? caster.id) === caster.id,
  );
  for (const sp of traitors) {
    if (sp.kind !== "traitor" || !sp.targetUid) continue;
    const live = findUnitByUid(state, sp.targetUid);
    if (!live) continue;
    const owner = state[live.side];
    const fromSlot = live.slot;
    const atk = live.unit;
    const pattern = patternOf(atk.cardId);
    const candidates: number[] = [];
    if (pattern === "ranged" || pattern === "aoe_all" || pattern === "cleave3") {
      owner.slots.forEach((s, i) => {
        if (s && i !== fromSlot) candidates.push(i);
      });
    } else {
      if (fromSlot - 1 >= 0 && owner.slots[fromSlot - 1]) {
        candidates.push(fromSlot - 1);
      }
      if (fromSlot + 1 <= 4 && owner.slots[fromSlot + 1]) {
        candidates.push(fromSlot + 1);
      }
      // lane patterns: соседи + напротив своего ряда уже свои
      if (pattern === "melee_lane3" || pattern === "lane_cleave3") {
        for (const i of cleaveSlots(fromSlot)) {
          if (i !== fromSlot && owner.slots[i]) candidates.push(i);
        }
      }
    }
    const uniq = [...new Set(candidates)];
    if (!uniq.length) {
      log.unshift(
        `Изменник ${getCard(atk.cardId).name}: нет цели среди своих`,
      );
      continue;
    }
    const toSlot = uniq[Math.floor(Math.random() * uniq.length)]!;
    const def = owner.slots[toSlot]!;
    const dmg = dealToCreature(def, atk.attack, log, owner.slots);
    log.unshift(
      `⚔ Изменник ${getCard(atk.cardId).name} бьёт своего ${getCard(def.cardId).name} на ${dmg}`,
    );
    for (let i = 0; i < owner.slots.length; i++) {
      removeIfDead(owner, i, log, state);
    }
  }
}

/** Тик изменника в конце хода кастера. */
function tickTraitorAfterCasterTurn(
  state: BattleState,
  caster: PlayerState,
  log: string[],
): void {
  resolveTraitorStrikes(state, caster, log);
  for (const side of ["you", "enemy"] as const) {
    const p = state[side];
    const keep: LingeringSpell[] = [];
    for (const sp of p.activeSpells) {
      if (sp.kind !== "traitor" || (sp.casterSide ?? "") !== caster.id) {
        keep.push(sp);
        continue;
      }
      if (sp.turnsLeft != null) sp.turnsLeft -= 1;
      if (sp.turnsLeft != null && sp.turnsLeft <= 0) {
        clearSpellEffectsOnBoard(state, sp);
        caster.graveyard.push(sp.cardId);
        log.unshift(`Изменник (${getCard(sp.cardId).name}) спал`);
        continue;
      }
      keep.push(sp);
    }
    p.activeSpells = keep;
  }
}

function putToSleep(
  target: CreatureInstance,
  log: string[],
  byName: string,
): void {
  target.canAttack = false;
  target.statuses = target.statuses.filter((st) => st.type !== "sleep");
  target.statuses.push({ type: "sleep", amount: 1 });
  log.unshift(
    `${byName} усыпляет ${getCard(target.cardId).name} на следующий ход`,
  );
}

/** Снять сон и дать шанс атаковать снова (после удара / призыва). */
function grantReadyAttack(u: CreatureInstance): boolean {
  u.statuses = u.statuses.filter((st) => st.type !== "sleep");
  if (
    u.statuses.some((st) => st.type === "traitor" || st.type === "bunker")
  ) {
    u.canAttack = false;
    return false;
  }
  u.canAttack = true;
  return true;
}

function tickLeprechaun(p: PlayerState, log: string[]): void {
  let heroHeal = 0;
  let allyHeal = 0;
  for (const s of p.slots) {
    if (!s || !hasAbility(s.cardId, "leprechaun_aura", s)) continue;
    const lv = hostUpgradeLevel(s, s.cardId);
    heroHeal += leprechaunHeroHeal(lv);
    allyHeal += leprechaunAllyHeal(lv);
  }
  if (heroHeal > 0) {
    p.hp = Math.min(p.maxHp, p.hp + heroHeal);
    log.unshift(`Леприконы: герой +${heroHeal} HP`);
  }
  if (allyHeal > 0) {
    let n = 0;
    for (const u of p.slots) {
      if (!u || u.health <= 0) continue;
      const cap = effectiveBase(u).hp;
      if (u.health >= cap) continue;
      u.health = Math.min(cap, u.health + allyHeal);
      n += 1;
    }
    if (n > 0) {
      log.unshift(`Леприконы: союзники +${allyHeal} HP (${n})`);
    }
  }
}

function tickVelesAura(p: PlayerState, log: string[]): void {
  let heal = 0;
  for (const s of p.slots) {
    if (!s || s.cardId !== "veles") continue;
    heal += velesNatureAuraHeal(hostUpgradeLevel(s, s.cardId));
  }
  if (heal <= 0) return;
  let n = 0;
  for (const u of p.slots) {
    if (!u || u.health <= 0) continue;
    if (getCard(u.cardId).school !== "nature") continue;
    const cap = effectiveBase(u).hp;
    if (u.health >= cap) continue;
    u.health = Math.min(cap, u.health + heal);
    n += 1;
  }
  if (n > 0) {
    log.unshift(`Велес: природа +${heal} HP (${n})`);
  }
}

function tickTrollRegen(p: PlayerState, log: string[]): void {
  for (const s of p.slots) {
    if (!s || s.cardId !== "troll") continue;
    const regen = trollRegen(hostUpgradeLevel(s, s.cardId));
    if (regen <= 0) continue;
    const cap = effectiveBase(s).hp;
    const before = s.health;
    s.health = Math.min(cap, s.health + regen);
    const g = s.health - before;
    if (g > 0) {
      log.unshift(`${getCard(s.cardId).name}: реген +${g} HP`);
    }
  }
}

function tickRogueSteal(
  p: PlayerState,
  foe: PlayerState | null,
  log: string[],
): void {
  if (!foe) return;
  for (const s of p.slots) {
    if (!s || s.cardId !== "rogue") continue;
    if (!hasAbility(s.cardId, "mana_steal", s)) continue;
    const every = rogueStealEvery(hostUpgradeLevel(s, s.cardId));
    if (every == null) continue;
    s.rogueTurns = (s.rogueTurns ?? 0) + 1;
    if (s.rogueTurns % every !== 0) continue;
    tryStealMana(p, foe, log);
  }
}

function tickBerserk(
  p: PlayerState,
  log: string[],
  state?: BattleState,
): void {
  for (let i = 0; i < p.slots.length; i++) {
    const s = p.slots[i];
    if (!s || !hasAbility(s.cardId, "berserk_decay", s)) continue;
    const decay = berserkDecayAmount(hostUpgradeLevel(s, s.cardId));
    s.baseHealth = Math.max(1, s.baseHealth - decay);
    s.health = Math.max(1, s.health - decay);
    log.unshift(
      `${getCard(s.cardId).name}: ярость −${decay} HP (база ${s.baseHealth})`,
    );
    if (s.health <= 0) removeIfDead(p, i, log, state);
  }
}

function beginTurn(
  p: PlayerState,
  turn: number,
  log: string[],
  opts?: { skipPoison?: boolean; calm?: boolean; state?: BattleState },
): void {
  if (!opts?.skipPoison) tickPoison(p, log, opts?.state);
  tickBurn(p, log, opts?.state);
  tickHeroBurn(p, log);
  tickBerserk(p, log, opts?.state);
  tickUnitStatuses(p, log);
  growMana(p, turn);
  tickLeprechaun(p, log);
  tickVelesAura(p, log);
  tickTrollRegen(p, log);
  {
    const foe =
      opts?.state == null
        ? null
        : p.id === "you"
          ? opts.state.enemy
          : opts.state.you;
    tickRogueSteal(p, foe, log);
  }
  tickSchoolManaAura(p, log);
  draw(p, 1, opts?.state);
  if (p.bonusDrawTurns > 0) {
    draw(p, 1, opts?.state);
    p.bonusDrawTurns -= 1;
    log.unshift(
      `${p.name}: доп. карта (+1). Осталось ходов: ${p.bonusDrawTurns}`,
    );
  }
  if (opts?.calm) {
    p.slots.forEach((s) => {
      if (s) s.canAttack = false;
    });
  } else {
  refreshCanAttack(p);
  }
}

/** Движение атаки: ближний укол / стрела / магический болт. */
export type BattleFxMotion = "melee" | "ranged" | "bolt";

/** Визуальный эффект попадания / снаряда. */
export type BattleFxVfx =
  | "poison"
  | "magic"
  | "burn"
  | "water"
  | "arrow"
  | "shock"
  | "slash";

/** Визуальный эффект для анимации в UI */
export type BattleFx = {
  side: "you" | "enemy";
  kind: "lunge" | "play" | "heal" | "spell";
  fromSlot?: number;
  toSlot?: number;
  hitSlots?: number[];
  hitHero?: boolean;
  /** Карта, которую показали (заклинание / призыв) */
  cardId?: string;
  /** Для kind=lunge: чем бьют. */
  motion?: BattleFxMotion;
  /** Для kind=spell / удара: тема эффекта. */
  vfx?: BattleFxVfx;
  school?: Faction;
};

const BOLT_ATTACK_IDS = new Set([
  "mage",
  "necro_mage",
  "lich",
  "arbiter",
  "water_spirit",
  "fire_gopnik",
  "inferno",
]);
const ARROW_ATTACK_IDS = new Set(["elf", "crossbowman", "archer"]);

export function attackMotionFor(cardId: string): BattleFxMotion {
  if (BOLT_ATTACK_IDS.has(cardId)) return "bolt";
  if (ARROW_ATTACK_IDS.has(cardId)) return "ranged";
  try {
    if (patternOf(cardId) === "ranged") return "ranged";
  } catch {
    /* ignore */
  }
  return "melee";
}

function isOffensiveSpell(effects: SpellEffect[]): boolean {
  return effects.some(
    (e) =>
      e.type === "poison" ||
      e.type === "poison_all" ||
      e.type === "damage_hero" ||
      e.type === "damage_enemy" ||
      e.type === "damage_all_enemies" ||
      e.type === "damage_undead" ||
      e.type === "damage_unit" ||
      e.type === "banish_unit",
  );
}

/** Клинок / физический удар — не огненный болт. */
const SLASH_SPELL_IDS = new Set(["strike"]);

/** Явный огонь (не «любая карта школы ада»). */
const FIRE_SPELL_IDS = new Set(["fire_aura"]);

/** Тема снаряда/попадания по id карты и школе. */
function spellProjectileVfx(
  cardId: string,
  effects: SpellEffect[],
  school?: Faction | "neutral",
): BattleFxVfx | undefined {
  if (SLASH_SPELL_IDS.has(cardId)) return "slash";
  if (cardId === "arrow_cloud" || cardId === "sniper") return "arrow";
  if (cardId === "wave") return "water";
  if (effects.some((e) => e.type === "poison" || e.type === "poison_all")) {
    return "poison";
  }
  if (!isOffensiveSpell(effects)) return undefined;
  if (FIRE_SPELL_IDS.has(cardId)) return "burn";
  // Школа ада ≠ автоогонь: «Атака» (меч) не плюётся пламенем.
  if (school === "water") return "water";
  if (school === "nature" && cardId !== "arrow_cloud") return "shock";
  if (school === "death") return "magic";
  if (school === "hell") return "shock";
  if (school === "life") return "shock";
  const need = spellNeedsTarget(effects);
  if (need === "enemy") return "shock";
  return "shock";
}

function occupiedSlots(
  side: BattleState["you"] | BattleState["enemy"],
): number[] {
  return side.slots
    .map((s, i) => (s ? i : -1))
    .filter((i): i is number => i >= 0);
}

/**
 * Дополнить FX: school/vfx + hitSlots для массовых заклинаний
 * (по состоянию стола ДО применения урона).
 */
export function enrichSpellFx(fx: BattleFx, state: BattleState): BattleFx {
  const next = normalizeBattleFx(fx);
  if (next.kind !== "spell" || !next.cardId) return next;
  try {
    const card = getCard(next.cardId);
    const effects = card.spellEffects ?? [];
    const foe = next.side === "you" ? state.enemy : state.you;
    if (
      !next.hitSlots?.length &&
      effects.some(
        (e) => e.type === "damage_all_enemies" || e.type === "poison_all",
      )
    ) {
      next.hitSlots = occupiedSlots(foe);
    }
  } catch {
    /* ignore */
  }
  return next;
}

/** Дополнить FX по cardId (motion / school / poison). */
export function normalizeBattleFx(fx: BattleFx): BattleFx {
  const next: BattleFx = { ...fx };
  if (fx.kind === "lunge" && fx.cardId && !fx.motion) {
    next.motion = attackMotionFor(fx.cardId);
  }
  if (fx.cardId && (!next.school || fx.kind === "spell")) {
    try {
      const card = getCard(fx.cardId);
      if (!next.school && card.school && card.school !== "neutral") {
        next.school = card.school;
      }
      if (fx.kind === "spell" && !next.vfx) {
        const vfx = spellProjectileVfx(
          fx.cardId,
          card.spellEffects ?? [],
          card.school,
        );
        if (vfx) next.vfx = vfx;
      }
    } catch {
      /* ignore */
    }
  }
  return next;
}

/** Конец твоего хода → старт хода врага (без действий ИИ). */
export function endPlayerTurn(state: BattleState): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  tickTraitorAfterCasterTurn(next, next.you, next.log);
  tickEndOwnerEffects(next.you, next.log);
  if (next.you.revealEnemyHandTurns > 0) next.you.revealEnemyHandTurns -= 1;
  clearEchoSpells(next);
  pruneLingering(next);
  // Твои slow уже отыграли твой ход; у врага slow должен дожить до его атак
  expireSlow(next.you);
  // ATK к базе; HP не лечим. Яд кусает того, чей ход начинается.
  restoreSurvivors(next.you);
  restoreSurvivors(next.enemy);
  tickPoison(next.enemy, next.log, next);
  pruneLingering(next);
  next.log = [
    "Конец хода: ATK к базе; раны остаются; яд у того, чей ход",
    ...next.log,
  ].slice(0, 10);
  next.active = "enemy";
  next.selectedHand = null;
  next.selectedSlot = null;
  const calmEnemy = next.calmTurnsLeft > 0;
  if (calmEnemy) next.calmTurnsLeft -= 1;
  // poison уже тикнул выше — beginTurn без повторного яда
  beginTurn(next.enemy, next.turn, next.log, {
    skipPoison: true,
    calm: calmEnemy,
    state: next,
  });
  // Ранний старт буйства, если колоды кончились в ход врага (тик уже внутри arm)
  if (next.bloodFrenzy === 0 && shouldStartBloodFrenzy(next)) {
    armBloodFrenzy(next, "колоды иссякли");
  }
  next.log = [
    calmEnemy ? "Ход соперника (затишье)…" : "Ход соперника…",
    ...next.log,
  ].slice(0, 10);
  checkWinner(next);
  return next;
}

/** Конец хода врага → твой ход. */
export function endEnemyTurn(state: BattleState): BattleState {
  if (state.winner || state.active !== "enemy") return state;
  const next = structuredClone(state) as BattleState;
  tickTraitorAfterCasterTurn(next, next.enemy, next.log);
  tickEndOwnerEffects(next.enemy, next.log);
  if (next.enemy.revealEnemyHandTurns > 0) next.enemy.revealEnemyHandTurns -= 1;
  // Эхо врага НЕ снимаем здесь — игрок должен видеть серые карты весь свой ход
  pruneLingering(next);
  expireSlow(next.enemy);
  restoreSurvivors(next.you);
  restoreSurvivors(next.enemy);
  tickPoison(next.you, next.log, next);
  pruneLingering(next);
  next.active = "you";
  next.turn += 1;
  const calmYou = next.calmTurnsLeft > 0;
  if (calmYou) next.calmTurnsLeft -= 1;
  const frenzyWasOn = next.bloodFrenzy > 0;
  beginTurn(next.you, next.turn, next.log, {
    skipPoison: true,
    calm: calmYou,
    state: next,
  });
  // Новый цикл: буйство после 20 ходов / пустых колод, далее −1/−2/−3…
  if (!frenzyWasOn && shouldStartBloodFrenzy(next)) {
    const reason =
      next.turn > bloodFrenzyThreshold(next)
        ? `прошло ${bloodFrenzyThreshold(next)} циклов`
        : "колоды иссякли";
    armBloodFrenzy(next, reason);
  } else if (frenzyWasOn) {
    tickBloodFrenzy(next);
  }
  next.log = [
    calmYou ? `Твой ход ${next.turn} (затишье)` : `Твой ход ${next.turn}`,
    ...next.log,
  ].slice(0, 10);
  checkWinner(next);
  return next;
}

/**
 * Один шаг ИИ: сыграть карту ИЛИ одну атаку/хил.
 * null = больше нечего делать.
 */
/** ИИ: ценность заклинания и лучшая цель. score ≤ 0 = не кастовать. */
function aiScoreSpell(
  cardId: string,
  me: PlayerState,
  foe: PlayerState,
): { score: number; target: number | null } {
  const card = getCard(cardId);
  const effects = card.spellEffects ?? [];
  if (effects.length === 0) return { score: -1, target: null };
  if (effects.some((e) => e.type === "guardian_bond")) {
    return { score: -1, target: null };
  }

  const need = spellNeedsTarget(effects);
  let score = 0;
  let target: number | null = null;

  const foeUnits = foe.slots
    .map((s, i) => (s ? { s, i } : null))
    .filter((x): x is { s: CreatureInstance; i: number } => !!x);
  const myUnits = me.slots
    .map((s, i) => (s ? { s, i } : null))
    .filter((x): x is { s: CreatureInstance; i: number } => !!x);

  const canHit = (s: CreatureInstance) =>
    !hasAbility(s.cardId, "immune_spells", s) &&
    !spellBlockedByImmunity(card.school, s.cardId, s);

  for (const eff of effects) {
    switch (eff.type) {
      case "damage_hero":
        score += foe.hp <= eff.amount ? 100 : 8 + eff.amount * 2;
        break;
      case "damage_enemy": {
        const face = foe.hp <= eff.amount ? 100 : 8 + eff.amount * 2;
        const cands = foeUnits
          .filter(({ s }) => canHit(s))
          .map(({ s, i }) => ({
            i,
            kill: s.health <= eff.amount,
            overkill: Math.max(0, eff.amount - s.health),
            threat: s.attack * 2 + s.health,
            chip: Math.min(eff.amount, s.health) * 2,
          }))
          .sort(
            (a, b) =>
              Number(b.kill) - Number(a.kill) ||
              a.overkill - b.overkill ||
              b.threat - a.threat,
          );
        const bestUnit = cands[0];
        const unitScore = bestUnit
          ? bestUnit.kill
            ? 22 + (foe.slots[bestUnit.i]?.attack ?? 0)
            : 6 + bestUnit.chip
          : -30;
        if (unitScore > face && bestUnit) {
          target = bestUnit.i;
          score += unitScore;
        } else {
          target = null;
          score += face;
        }
        break;
      }
      case "heal_hero": {
        const miss = me.maxHp - me.hp;
        if (miss <= 0) score -= 20;
        else score += Math.min(miss, eff.amount) * 3;
        break;
      }
      case "damage_all_enemies": {
        const hits = foeUnits.filter((u) => canHit(u.s));
        if (hits.length === 0) score -= 30;
        else {
          let kills = 0;
          let dmg = 0;
          for (const { s } of hits) {
            const dealt = Math.min(s.health, eff.amount);
            dmg += dealt;
            if (s.health <= eff.amount) kills += 1;
          }
          score += dmg * 2 + kills * 12;
        }
        break;
      }
      case "damage_undead": {
        let n = 0;
        for (const side of [me, foe]) {
          for (const s of side.slots) {
            if (s && getCard(s.cardId).school === "death") n += 1;
          }
        }
        if (n === 0) score -= 40;
        else score += n * 6 + eff.amount;
        break;
      }
      case "draw":
        score += me.hand.length >= MAX_HAND_SIZE - 1 ? 1 : 5 + eff.amount * 3;
        break;
      case "refresh_hand": {
        const n = me.hand.length;
        if (n <= 0) score -= 30;
        else if (me.deck.length === 0 && me.graveyard.length === 0) score -= 20;
        else score += 4 + Math.min(n, 5);
        break;
      }
      case "gain_mana":
        // Рамп — только через шаг 0 при нехватке маны; здесь не конкурирует с боевыми спеллами
        score -= 8;
        break;
      case "gain_mana_all":
        score -= 6;
        break;
      case "buff_permanent": {
        const pool = eff.onlySchool
          ? myUnits.filter(
              ({ s }) => getCard(s.cardId).school === eff.onlySchool,
            )
          : myUnits;
        if (pool.length === 0) score -= 30;
        else {
          const best = [...pool].sort(
            (a, b) => b.s.attack + b.s.health - (a.s.attack + a.s.health),
          )[0]!;
          target = best.i;
          score += 10 + eff.attack * 4 + eff.health * 4;
        }
        break;
      }
      case "heal_unit": {
        const hurt = myUnits
          .map(({ s, i }) => {
            const miss = effectiveBase(s).hp - s.health;
            const poison = s.statuses.some((st) => st.type === "poison");
            return { i, miss, poison, threat: s.attack };
          })
          .filter((u) => u.miss > 0 || u.poison)
          .sort(
            (a, b) =>
              Number(b.poison) - Number(a.poison) ||
              b.miss - a.miss ||
              b.threat - a.threat,
          );
        if (hurt.length === 0) score -= 30;
        else {
          target = hurt[0]!.i;
          score += 8 + hurt[0]!.miss * 2 + (hurt[0]!.poison ? 10 : 0);
        }
        break;
      }
      case "poison": {
        const cands = foeUnits
          .filter(({ s }) => canHit(s) && !hasAbility(s.cardId, "immune_hell_death", s))
          .filter(({ s }) => !s.statuses.some((st) => st.type === "poison"))
          .sort((a, b) => b.s.health + b.s.attack - (a.s.health + a.s.attack));
        if (cands.length === 0) score -= 30;
        else {
          target = cands[0]!.i;
          score += 9 + Math.min(6, cands[0]!.s.health);
        }
        break;
      }
      case "damage_unit": {
        const cands = foeUnits
          .filter(({ s }) => canHit(s))
          .map(({ s, i }) => ({
            i,
            s,
            kill: s.health <= eff.amount,
            overkill: Math.max(0, eff.amount - s.health),
            threat: s.attack * 2 + s.health,
          }))
          .sort(
            (a, b) =>
              Number(b.kill) - Number(a.kill) ||
              a.overkill - b.overkill ||
              b.threat - a.threat,
          );
        if (cands.length === 0) score -= 30;
        else {
          target = cands[0]!.i;
          score += cands[0]!.kill
            ? 22 + cands[0]!.s.attack
            : 6 + Math.min(eff.amount, cands[0]!.s.health) * 2;
        }
        break;
      }
      case "slow_enemy": {
        const cands = foeUnits
          .filter(({ s }) => canHit(s) && s.attack > 0 && s.canAttack)
          .sort((a, b) => b.s.attack - a.s.attack);
        if (cands.length === 0) score -= 25;
        else {
          target = cands[0]!.i;
          score += 6 + Math.min(eff.amount, cands[0]!.s.attack) * 3;
        }
        break;
      }
      case "shield_ally": {
        const cands = myUnits
          .filter(({ s }) => !s.statuses.some((st) => st.type === "shield"))
          .sort((a, b) => b.s.health + b.s.attack - (a.s.health + a.s.attack));
        if (cands.length === 0) score -= 25;
        else {
          target = cands[0]!.i;
          score += 8 + eff.turns;
        }
        break;
      }
      case "skip_combat": {
        const myAtk = myUnits.reduce((n, u) => n + (u.s.canAttack ? u.s.attack : 0), 0);
        const foeAtk = foeUnits.reduce(
          (n, u) => n + (u.s.canAttack ? u.s.attack : 0),
          0,
        );
        if (foeAtk <= myAtk && me.hp > foeAtk) score -= 20;
        else score += 5 + (foeAtk - myAtk);
        break;
      }
      case "shuffle_board":
        score -= myUnits.length < 2 ? 40 : 8;
        break;
      case "extra_draw_turns":
        score += 6 + eff.turns * 2;
        break;
      case "buff_army_attack":
        if (myUnits.length === 0) score -= 30;
        else score += myUnits.length * (3 + eff.amount * 2);
        break;
      case "banish_unit": {
        const cands = foeUnits
          .filter(({ s }) => canHit(s))
          .sort((a, b) => b.s.attack + b.s.health - (a.s.attack + a.s.health));
        if (cands.length === 0) score -= 30;
        else {
          target = cands[0]!.i;
          score += 18 + cands[0]!.s.attack + cands[0]!.s.health;
        }
        break;
      }
      case "cure_poison": {
        const poisoned = myUnits.filter(({ s }) =>
          s.statuses.some((st) => st.type === "poison"),
        );
        if (poisoned.length === 0) score -= 35;
        else {
          target = poisoned.sort((a, b) => b.s.attack - a.s.attack)[0]!.i;
          score += 14;
        }
        break;
      }
      case "cure_poison_all": {
        const n = myUnits.filter(({ s }) =>
          s.statuses.some((st) => st.type === "poison"),
        ).length;
        if (n === 0) score -= 35;
        else score += 8 + n * 8;
        break;
      }
      case "bounce_enemy_hand": {
        const cands = foeUnits
          .filter(({ s }) => canHit(s))
          .sort((a, b) => b.s.attack + b.s.health - (a.s.attack + a.s.health));
        if (cands.length === 0) score -= 30;
        else {
          target = cands[0]!.i;
          score += 12 + cands[0]!.s.attack;
        }
        break;
      }
      case "reveal_enemy_hand":
        score += 2;
        break;
      case "break_enemy_spell":
      case "break_all_enemy_spells": {
        const n = foe.activeSpells.filter(
          (sp) => sp.mode === "active" && sp.kind !== "echo",
        ).length;
        if (n === 0) score -= 35;
        else score += eff.type === "break_all_enemy_spells" ? 8 + n * 6 : 10;
        break;
      }
      case "traitor":
      case "freeze_enemy": {
        const cands = foeUnits
          .filter(({ s }) => canHit(s) && s.canAttack)
          .sort((a, b) => b.s.attack - a.s.attack);
        if (cands.length === 0) score -= 25;
        else {
          target = cands[0]!.i;
          score += 10 + cands[0]!.s.attack * 2;
        }
        break;
      }
      case "discard_enemy_hand":
        score += foe.hand.length >= 2 ? 8 + eff.amount * 2 : foe.hand.length === 1 ? 3 : -20;
        break;
      case "wake_ally": {
        const asleep = myUnits.filter(({ s }) =>
          s.statuses.some((st) => st.type === "sleep"),
        );
        const spent = myUnits.filter(({ s }) => !s.canAttack);
        if (asleep.length) {
          const best = [...asleep].sort((a, b) => b.s.attack - a.s.attack)[0]!;
          target = best.i;
          score += 18 + best.s.attack * 3;
        } else if (spent.length) {
          const best = [...spent].sort((a, b) => b.s.attack - a.s.attack)[0]!;
          target = best.i;
          score += 10 + best.s.attack * 2;
        } else score -= 20;
        break;
      }
      case "wake_all_allies": {
        const nSleep = myUnits.filter(({ s }) =>
          s.statuses.some((st) => st.type === "sleep"),
        ).length;
        const nSpent = myUnits.filter(({ s }) => !s.canAttack).length;
        if (nSleep + nSpent === 0) score -= 25;
        else score += 12 + nSleep * 10 + nSpent * 4;
        break;
      }
      default:
        score += 1;
        break;
    }
  }

  if (need === "enemy" && target == null) {
    const any = foeUnits.find(({ s }) => canHit(s));
    if (!any) return { score: -1, target: null };
    target = any.i;
  }
  if (need === "ally" && target == null) {
    if (myUnits.length === 0) return { score: -1, target: null };
    target = myUnits[0]!.i;
  }

  return { score, target };
}

/** Миссия ИИ: защитить своего оракула, убить вражеского. */
type AiMission = {
  faceNow: number;
  incoming: number;
  openLanes: number[];
  canLethal: boolean;
  mustDefend: boolean;
  /** Суммарная «угроза» доски игрока — снимать сильные карты. */
  foeBoardThreat: number;
};

/** Плавный скилл бота по уровню (не читы по HP/урону) + уклон персоны. */
function aiSkill(
  level: number,
  persona: BattleState["aiPersona"] = "midrange",
) {
  const lv = Math.max(1, Math.min(50, level || 1));
  // Раньше бот «учился» слишком медленно — из‑за этого не давил.
  let developUntil = lv <= 2 ? 2 : lv <= 5 ? 3 : 4;
  let multiDrop = lv <= 3 ? 28 : lv <= 8 ? 40 : 52;
  let tradeMul = lv <= 3 ? 0.95 : lv <= 7 ? 1.15 : lv <= 14 ? 1.35 : 1.5;
  let flexMul = lv <= 3 ? 0.55 : lv <= 6 ? 0.85 : lv <= 11 ? 1.1 : 1.3;
  let faceBias = 4;
  let rampBias = 4;
  let spellBias = 6;
  if (persona === "aggro") {
    developUntil = Math.min(developUntil, 3);
    multiDrop += 12;
    tradeMul *= 0.9;
    faceBias = 22;
  } else if (persona === "swarm") {
    developUntil = 4;
    multiDrop += 18;
    faceBias = 10;
  } else if (persona === "control") {
    tradeMul *= 1.25;
    flexMul *= 1.15;
    spellBias = 20;
    faceBias = -2;
  } else if (persona === "ramp") {
    rampBias = 22;
    developUntil = Math.max(2, developUntil - 1);
    multiDrop -= 4;
  }
  return {
    level: lv,
    developUntil,
    multiDrop,
    tradeMul,
    flexMul,
    faceBias,
    rampBias,
    spellBias,
    /** Сложные флексы раньше — бот пользуется умениями. */
    advancedFlex: lv >= 5,
    verdictOk: lv >= 8,
    /**
     * Узкий разброс: разнообразие без тупых ходов.
     * Раньше slack 14–22 делал бота «безопасным».
     */
    choiceSlack: lv <= 3 ? 8 : lv <= 8 ? 5 : lv <= 16 ? 3 : 2,
    /** Softmax-температура: ниже = чаще лучший ход. */
    choiceTemp: lv <= 3 ? 5 : lv <= 10 ? 3.2 : 2.2,
  };
}

/** Дешёвый LCG от seed боя + хода — стабильный разброс внутри матча. */
function aiStepRng(seed: number, turn: number, nChoices: number): () => number {
  let s =
    ((seed >>> 0) ^ Math.imul(turn + 1, 9973) ^ Math.imul(nChoices + 1, 7919)) >>>
    0;
  if (!s) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function aiThreatOf(u: CreatureInstance): number {
  let t = u.attack * 3 + u.health;
  if (abilityOf(u.cardId, u) === "vampire_grow") t += 18;
  const pat = patternOf(u.cardId);
  if (pat === "melee" || pat === "melee_lane3" || pat === "lane_cleave3") t += 8;
  if (pat === "aoe_all" || pat === "cleave3") t += 10;
  if (u.attack >= 4) t += 8;
  return t;
}

function aiComputeMission(me: PlayerState, foe: PlayerState): AiMission {
  const openLanes: number[] = [];
  let incoming = 0;
  let foeBoardThreat = 0;
  for (let i = 0; i < 5; i++) {
    const e = foe.slots[i];
    if (!e) continue;
    foeBoardThreat += aiThreatOf(e);
    const pat = patternOf(e.cardId);
    if (
      (pat === "melee" ||
        pat === "melee_lane3" ||
        pat === "lane_cleave3") &&
      !me.slots[i]
    ) {
      openLanes.push(i);
      incoming += e.attack;
      if (abilityOf(e.cardId, e) === "vampire_grow") incoming += 5;
    } else if (pat === "ranged" || pat === "aoe_all" || pat === "cleave3") {
      incoming += Math.ceil(e.attack * 0.4);
    }
  }

  let faceNow = 0;
  for (let i = 0; i < 5; i++) {
    const a = me.slots[i];
    if (!a || !a.canAttack) continue;
    if (a.statuses.some((st) => st.type === "traitor")) continue;
    const pat = patternOf(a.cardId);
    if (pat === "melee") {
      const b = foe.slots[i];
      if (!b || !canPhysicallyAttack(a.cardId, b.cardId, b)) {
        faceNow += a.attack;
      }
    } else if (pat === "melee_lane3") {
      const blocked = cleaveSlots(i).some(
        (j) =>
          foe.slots[j] &&
          canPhysicallyAttack(a.cardId, foe.slots[j]!.cardId, foe.slots[j]),
      );
      if (!blocked) faceNow += a.attack;
    } else if (pat === "lane_cleave3") {
      const hits = cleaveSlots(i).some(
        (j) =>
          foe.slots[j] &&
          canPhysicallyAttack(a.cardId, foe.slots[j]!.cardId, foe.slots[j]),
      );
      if (!hits) faceNow += a.attack;
    } else {
      // ranged / aoe / cleave — могут бить в оракула
      faceNow += a.attack;
    }
  }

  const canLethal = faceNow >= foe.hp;
  const mustDefend =
    openLanes.length > 0 &&
    (incoming >= me.hp || me.hp - incoming <= 6 || incoming >= 5);

  return { faceNow, incoming, openLanes, canLethal, mustDefend, foeBoardThreat };
}

/** Насколько выгодно поставить карту в этот слот. */
function aiScoreCreatureSlot(
  me: PlayerState,
  foe: PlayerState,
  cardId: string,
  slot: number,
  mission: AiMission,
): number {
  if (me.slots[slot]) return -1e9;
  const card = getCard(cardId);
  const myAtk = card.attack ?? 0;
  const myHp = card.health ?? 0;
  const pat = patternOf(cardId);
  const enemy = foe.slots[slot];
  let score = 0;

  if (pat === "melee_lane3" || pat === "lane_cleave3" || pat === "cleave3") {
    score += [1, 3, 5, 3, 1][slot] ?? 0;
  } else {
    score += [0, 1, 2, 1, 0][slot] ?? 0;
  }

  // Директива: закрыть линию, через которую бьют нашего оракула
  if (mission.openLanes.includes(slot)) {
    score += 45 + (mission.mustDefend ? 40 : 0);
    score += (foe.slots[slot]?.attack ?? 0) * 3;
  }

  if (enemy) {
    const eAtk = enemy.attack;
    const eHp = enemy.health;
    const ePat = patternOf(enemy.cardId);
    const eVamp = abilityOf(enemy.cardId, enemy) === "vampire_grow";
    const weKill = myAtk >= eHp;
    const theyKill = eAtk >= myHp;

    if (ePat === "melee" || ePat === "melee_lane3") score += 20;
    if (eAtk >= 3) score += 10;
    if (eVamp) score += 32;

    if (weKill && !theyKill) score += 28;
    else if (weKill && theyKill) score += 14;
    else if (!weKill && !theyKill) score += 8;
    else score -= 4;

    if (theyKill && myHp <= 2 && eAtk >= 4 && !eVamp) score -= 8;
    if (myHp >= 4 && eAtk >= 3) score += 8;
  } else {
    // Давление на оракула врага
    if (pat === "melee" || pat === "melee_lane3" || pat === "lane_cleave3") {
      score += 14 + myAtk * 3;
      if (foe.hp <= myAtk) score += 50;
      else if (foe.hp <= myAtk * 2) score += 18;
      if (mission.faceNow + myAtk >= foe.hp) score += 25;
    }
    if (pat === "ranged" && mission.openLanes.length > 0) score -= 12;
  }

  for (const lane of mission.openLanes) {
    if (lane !== slot) score -= 8;
  }

  return score;
}

function aiPickStrikeTarget(
  me: PlayerState,
  foe: PlayerState,
  atk: CreatureInstance,
  allowHero: boolean,
  mission: AiMission,
  tradeMul = 1,
): number | "hero" | null {
  type Cand = { t: number | "hero"; sc: number };
  const cands: Cand[] = [];

  if (allowHero) {
    let sc = atk.attack * 5;
    if (foe.hp <= atk.attack) sc += 200;
    else if (foe.hp <= atk.attack * 2) sc += 40;
    if (mission.canLethal) sc += 80;
    if (!foe.slots.some(Boolean)) sc += 20;
    // Убиваем оракула важнее мелкого трейда
    sc += Math.max(0, 12 - foe.hp);
    // Если на доске сильные угрозы — не чипать лицо мелочью
    if (!mission.canLethal && mission.foeBoardThreat >= 18 && atk.attack < 3) {
      sc -= 25;
    }
    cands.push({ t: "hero", sc });
  }

  for (let i = 0; i < 5; i++) {
    const t = foe.slots[i];
    if (!t || !canPhysicallyAttack(atk.cardId, t.cardId, t)) continue;
    let sc = 0;
    const kill = atk.attack >= t.health;
    const threat = aiThreatOf(t);
    if (kill) sc += (18 + t.attack * 6 + t.health + threat * 0.5) * tradeMul;
    else sc += (Math.min(atk.attack, t.health) + t.attack * 2.5 + threat * 0.25) * tradeMul;

    if (abilityOf(t.cardId, t) === "vampire_grow") sc += 30;
    const tPat = patternOf(t.cardId);
    if (tPat === "melee" || tPat === "melee_lane3") {
      // Снять угрозу с нашего оракула
      sc += me.slots[i] ? 10 : 22;
    }
    if (t.attack >= 4) sc += 14 * tradeMul;
    if (mission.canLethal) sc -= 50; // при летали — в лицо
    if (foe.hp <= atk.attack && kill && t.attack <= 2) sc -= 15;
    cands.push({ t: i, sc });
  }

  if (!cands.length) return null;
  cands.sort((a, b) => b.sc - a.sc);
  return cands[0]!.t;
}

function aiScoreCombatUnit(
  me: PlayerState,
  foe: PlayerState,
  fromSlot: number,
  mission: AiMission,
  tradeMul = 1,
): number {
  const atk = me.slots[fromSlot];
  if (!atk || !atk.canAttack) return -1e9;
  if (atk.statuses.some((st) => st.type === "traitor")) return -1e9;

  const pat = patternOf(atk.cardId);
  let score = 0;

  if (pat === "melee") {
    const block = foe.slots[fromSlot];
    if (!block || !canPhysicallyAttack(atk.cardId, block.cardId, block)) {
      score = 55 + atk.attack * 5;
      if (foe.hp <= atk.attack) score += 200;
      else if (mission.canLethal) score += 120;
      else if (foe.hp <= atk.attack * 2) score += 35;
      // Чип в лицо слабее, чем снятие жирной угрозы другим юнитом
      if (!mission.canLethal && mission.foeBoardThreat >= 20 && atk.attack <= 2) {
        score -= 18;
      }
    } else {
      const kill = atk.attack >= block.health;
      score = (kill ? 34 + block.attack * 5 + aiThreatOf(block) * 0.4 : 8 + atk.attack) * tradeMul;
      if (abilityOf(block.cardId, block) === "vampire_grow") score += 25;
      if (mission.openLanes.includes(fromSlot)) score += 15;
    }
  } else if (pat === "melee_lane3") {
    const lane = cleaveSlots(fromSlot).find(
      (j) =>
        foe.slots[j] &&
        canPhysicallyAttack(atk.cardId, foe.slots[j]!.cardId, foe.slots[j]),
    );
    if (lane == null) {
      score = 55 + atk.attack * 5 + (foe.hp <= atk.attack ? 200 : 0);
    } else {
      const t = foe.slots[lane]!;
      score =
        (atk.attack >= t.health ? 32 + t.attack * 5 + aiThreatOf(t) * 0.35 : 10 + atk.attack) *
          tradeMul +
        (abilityOf(t.cardId, t) === "vampire_grow" ? 25 : 0);
    }
  } else if (pat === "ranged" || pat === "cleave3" || pat === "aoe_all") {
    const pick = aiPickStrikeTarget(me, foe, atk, true, mission, tradeMul);
    if (pick === "hero" || pick == null) {
      score = 55 + atk.attack * 5 + (foe.hp <= atk.attack ? 200 : 0);
      if (mission.canLethal) score += 100;
    } else {
      const t = foe.slots[pick]!;
      score =
        (atk.attack >= t.health ? 30 + t.attack * 5 + aiThreatOf(t) * 0.4 : 10 + atk.attack) *
          tradeMul +
        (abilityOf(t.cardId, t) === "vampire_grow" ? 25 : 0);
      if (mission.canLethal) score -= 40;
    }
  } else {
    score = 40 + atk.attack * 3;
  }

  // Хилы/флексы не важнее летали или блока
  if (mission.canLethal) score += 30;
  if (mission.mustDefend && score < 40) score -= 10;

  return score;
}

export function takeAiStep(
  state: BattleState,
): { state: BattleState; fx: BattleFx } | null {
  if (state.winner || state.active !== "enemy") return null;
  const next = structuredClone(state) as BattleState;
  const me = next.enemy;
  const foe = next.you;
  const skill = aiSkill(next.aiLevel ?? 1, next.aiPersona);

  const boardCount = me.slots.filter(Boolean).length;
  const emptySlots = 5 - boardCount;
  const mission = aiComputeMission(me, foe);
  const costOf = (cardId: string) => battleManaCost(next, cardId);

  const canAffordCreature = () => {
    for (let hi = 0; hi < me.hand.length; hi++) {
      const c = getCard(me.hand[hi]!);
      if (c.kind === "creature" && canPay(me.mana, c.manaCost ?? {})) {
        return true;
      }
    }
    return false;
  };

  type AiFlex =
    | { type: "angel_buff"; toSlot: number }
    | { type: "mage_buff"; toSlot: number }
    | { type: "mage_oracle" }
    | { type: "sleep"; toSlot: number }
    | { type: "summon"; toSlot: number; cardId: string }
    | { type: "paladin_shield"; toSlot: number }
    | { type: "gravedigger"; toSlot: number; graveIndex: number }
    | { type: "leshy"; side: "ally" | "foe"; toSlot: number }
    | { type: "arbiter" }
    | { type: "balthazar"; a: number; b: number };

  type AiChoice =
    | { kind: "ramp"; hi: number; score: number }
    | { kind: "creature"; hi: number; slot: number; score: number }
    | { kind: "spell"; hi: number; target: number | null; score: number }
    | { kind: "combat"; slot: number; score: number }
    | { kind: "flex"; slot: number; score: number; flex: AiFlex };

  const choices: AiChoice[] = [];

  // --- Рамп: не когда можно убить оракула или срочно закрыть линию ---
  if (
    emptySlots > 0 &&
    !mission.canLethal &&
    !(mission.mustDefend && canAffordCreature())
  ) {
    const thin = boardCount < skill.developUntil;
    const needRamp = thin || !canAffordCreature();
    if (needRamp) {
      for (let hi = 0; hi < me.hand.length; hi++) {
        const id = me.hand[hi]!;
        const card = getCard(id);
        if (card.kind !== "spell") continue;
        const cost = costOf(id);
        if (!canPay(me.mana, cost)) continue;
        const effects = card.spellEffects ?? [];
        if (!isManaRampSpell(effects)) continue;
        const costN = Object.values(cost).reduce(
          (s, n) => s + (n ?? 0),
          0,
        );
        const sc =
          (effects.some((e) => e.type === "gain_mana_all") ? 35 : 18) -
          costN -
          (mission.mustDefend ? 25 : 0) +
          skill.rampBias;
        choices.push({ kind: "ramp", hi, score: sc });
      }
    }
  }

  // --- Существа: развиваем доску / блок / давление ---
  if (!mission.canLethal || mission.mustDefend) {
    const develop = boardCount < skill.developUntil && !mission.mustDefend;
    for (let hi = 0; hi < me.hand.length; hi++) {
      const card = getCard(me.hand[hi]!);
      if (card.kind !== "creature") continue;
      if (!canPay(me.mana, card.manaCost ?? {})) continue;
      const cost = card.manaCost ?? {};
      const costN = Object.values(cost).reduce((s, n) => s + (n ?? 0), 0);
      const power =
        (card.attack ?? 0) * 3 +
        (card.health ?? 0) * 2 +
        (card.unitLevel ?? 1) * 4 +
        (card.onPlayHealHero ?? 0);
      let leftAfford = 0;
      const trial: Record<Faction, number> = { ...me.mana };
      for (const f of ["water", "hell", "death", "life", "nature"] as const) {
        const need = cost[f] ?? 0;
        if (need) trial[f] = (trial[f] ?? 0) - need;
      }
      for (let j = 0; j < me.hand.length; j++) {
        if (j === hi) continue;
        const c2 = getCard(me.hand[j]!);
        if (c2.kind !== "creature") continue;
        if (canPay(trial, c2.manaCost ?? {})) leftAfford += 1;
      }
      const multi =
        leftAfford > 0 && emptySlots > 1
          ? skill.multiDrop + leftAfford * 8
          : 0;
      const thinBonus =
        boardCount < skill.developUntil
          ? (skill.developUntil - boardCount) * 16
          : 0;
      const base = develop
        ? multi + thinBonus + power * 0.45 - costN * 3
        : power - costN + 10 + multi * 0.55 + thinBonus * 0.5;
      for (let slot = 0; slot < 5; slot++) {
        if (me.slots[slot]) continue;
        const pos = aiScoreCreatureSlot(me, foe, me.hand[hi]!, slot, mission);
        let sc = base + pos * (develop ? 0.85 : 1.25);
        if (mission.mustDefend && mission.openLanes.includes(slot)) sc += 55;
        if (mission.canLethal) sc -= 100;
        // Пока доска жидкая — существо важнее слабого чипа в лицо
        if (develop && !mission.canLethal) sc += 12;
        choices.push({ kind: "creature", hi, slot, score: sc });
      }
    }
  }

  // --- Заклинания ---
  {
    for (let hi = 0; hi < me.hand.length; hi++) {
      const id = me.hand[hi]!;
      const card = getCard(id);
      if (card.kind !== "spell") continue;
      if (!canPay(me.mana, costOf(id))) continue;
      if (isManaRampSpell(card.spellEffects ?? [])) continue;
      const ev = aiScoreSpell(id, me, foe);
      const need = spellNeedsTarget(card.spellEffects ?? []);
      if (need === "enemy" && (ev.target == null || !foe.slots[ev.target])) {
        continue;
      }
      if (
        need === "enemy_or_hero" &&
        ev.target != null &&
        !foe.slots[ev.target]
      ) {
        continue;
      }
      if (need === "ally" && (ev.target == null || !me.slots[ev.target])) {
        continue;
      }
      let sc = ev.score + skill.spellBias;
      const effects = card.spellEffects ?? [];
      if (
        effects.some(
          (e) => e.type === "damage_hero" || e.type === "damage_enemy",
        )
      ) {
        sc +=
          (mission.canLethal || foe.hp <= 8 ? 40 : 10) + skill.faceBias * 0.5;
      }
      if (effects.some((e) => e.type === "heal_hero") && mission.mustDefend) {
        sc += 20;
      }
      // Снятие сильных карт спеллом
      if (
        effects.some(
          (e) =>
            e.type === "damage_unit" ||
            e.type === "damage_enemy" ||
            e.type === "banish_unit" ||
            e.type === "bounce_enemy_hand" ||
            e.type === "poison",
        )
      ) {
        sc += Math.min(18, mission.foeBoardThreat * 0.15) * skill.tradeMul;
      }
      if (
        mission.canLethal &&
        !effects.some(
          (e) => e.type === "damage_hero" || e.type === "damage_enemy",
        )
      ) {
        sc -= 25;
      }
      const spellFloor = boardCount < 2 ? 12 : 6;
      if (sc >= spellFloor) {
        choices.push({
          kind: "spell",
          hi,
          target: ev.target,
          score: sc,
        });
      }
    }
  }

  // --- Бой ---
  for (let i = 0; i < 5; i++) {
    let sc = aiScoreCombatUnit(me, foe, i, mission, skill.tradeMul);
    if (sc > -1e8) {
      // Агро чаще бьёт в лицо, контроль — чаще трейдит
      if (skill.faceBias) sc += skill.faceBias * 0.35;
      choices.push({ kind: "combat", slot: i, score: sc });
    }
  }

  // --- Умения юнитов (очки, не рандом) ---
  if (!mission.canLethal) {
    const fm = skill.flexMul;
    for (let i = 0; i < 5; i++) {
      const atk = me.slots[i];
      if (!atk || !atk.canAttack) continue;
      if (atk.statuses.some((st) => st.type === "traitor")) continue;
      const ab = abilityOf(atk.cardId, atk);

      if (ab === "angel_heal") {
        let best = -1;
        let bestMiss = 0;
        for (let j = 0; j < 5; j++) {
          if (j === i || !me.slots[j]) continue;
          const t = me.slots[j]!;
          const miss = effectiveBase(t).hp - t.health;
          const want = miss > 0 ? miss + t.attack : t.attack * 0.3;
          if (want > bestMiss) {
            bestMiss = want;
            best = j;
          }
        }
        if (best >= 0) {
          choices.push({
            kind: "flex",
            slot: i,
            score: (14 + bestMiss * 2 + (me.hp <= 12 ? 8 : 0)) * fm,
            flex: { type: "angel_buff", toSlot: best },
          });
        }
      }

      if (ab === "mage_flex") {
        let best = -1;
        let bestSc = -1;
        for (let j = 0; j < 5; j++) {
          if (j === i || !me.slots[j]) continue;
          const t = me.slots[j]!;
          const sc =
            t.attack * 2 +
            (t.health < effectiveBase(t).hp ? 8 : 0) +
            (mission.openLanes.includes(j) ? 6 : 0);
          if (sc > bestSc) {
            bestSc = sc;
            best = j;
          }
        }
        if (best >= 0) {
          choices.push({
            kind: "flex",
            slot: i,
            score: (12 + bestSc) * fm,
            flex: { type: "mage_buff", toSlot: best },
          });
        }
        if (mission.mustDefend || me.hp <= 12) {
          choices.push({
            kind: "flex",
            slot: i,
            score: (16 + (14 - Math.min(14, me.hp))) * fm,
            flex: { type: "mage_oracle" },
          });
        }
      }

      if (ab === "banshee_flex" || ab === "mermaid_flex" || ab === "succubus_flex") {
        let sleepT = -1;
        let sleepSc = -1;
        for (let j = 0; j < 5; j++) {
          const s = foe.slots[j];
          if (!s) continue;
          if (ab === "mermaid_flex" && isFemaleWarrior(s.cardId)) continue;
          if (ab === "succubus_flex" && creatureGender(s.cardId) !== "male") {
            continue;
          }
          let sc = aiThreatOf(s);
          if (abilityOf(s.cardId, s) === "vampire_grow") sc += 16;
          if (mission.openLanes.includes(j)) sc += 14;
          if (s.canAttack) sc += 8;
          if (sc > sleepSc) {
            sleepSc = sc;
            sleepT = j;
          }
        }
        if (sleepT >= 0) {
          choices.push({
            kind: "flex",
            slot: i,
            score: (18 + sleepSc * 0.85) * fm * skill.tradeMul,
            flex: { type: "sleep", toSlot: sleepT },
          });
        }
      }

      if (ab === "triton_flex" || ab === "necro_flex" || ab === "hornet_queen_flex") {
        const cardId =
          ab === "triton_flex"
            ? "aquilite"
            : ab === "necro_flex"
              ? "skeleton"
              : "hornet_warrior";
        const empty =
          mission.openLanes.find((s) => !me.slots[s]) ??
          me.slots.findIndex((s) => !s);
        if (empty >= 0 && !me.slots[empty]) {
          const sc =
            (22 +
              (mission.openLanes.includes(empty) ? 28 : 0) +
              (boardCount < skill.developUntil ? 14 : 0)) *
            fm;
          choices.push({
            kind: "flex",
            slot: i,
            score: sc,
            flex: { type: "summon", toSlot: empty, cardId },
          });
        }
      }

      if (ab === "paladin_flex" && skill.advancedFlex) {
        let best = -1;
        let bestSc = -1;
        for (let j = 0; j < 5; j++) {
          if (j === i || !me.slots[j]) continue;
          const t = me.slots[j]!;
          if (t.statuses.some((st) => st.type === "shield")) continue;
          const sc = aiThreatOf(t) + (mission.openLanes.includes(j) ? 10 : 0);
          if (sc > bestSc) {
            bestSc = sc;
            best = j;
          }
        }
        if (best >= 0) {
          choices.push({
            kind: "flex",
            slot: i,
            score: (14 + bestSc * 0.5) * fm,
            flex: { type: "paladin_shield", toSlot: best },
          });
        }
      }

      if (ab === "gravedigger_flex" && skill.advancedFlex) {
        const empty =
          mission.openLanes.find((s) => !me.slots[s]) ??
          me.slots.findIndex((s) => !s);
        const graves = recentGraveCreatures(me.graveyard, 5);
        if (empty >= 0 && !me.slots[empty] && graves.length) {
          const pick = [...graves].sort(
            (a, b) =>
              manaCostTotal(getCard(b.cardId).manaCost ?? {}) -
              manaCostTotal(getCard(a.cardId).manaCost ?? {}),
          )[0]!;
          choices.push({
            kind: "flex",
            slot: i,
            score: (24 + (mission.openLanes.includes(empty) ? 20 : 8)) * fm,
            flex: {
              type: "gravedigger",
              toSlot: empty,
              graveIndex: pick.index,
            },
          });
        }
      }

      if (ab === "leshy_flex" && skill.advancedFlex) {
        for (let j = 0; j < 5; j++) {
          if (j === i || !me.slots[j]) continue;
          const t = me.slots[j]!;
          // Свой танк (много HP) → ударная сила
          if (t.health >= t.attack + 3 && t.health >= 4) {
            choices.push({
              kind: "flex",
              slot: i,
              score: (18 + t.health * 2) * fm,
              flex: { type: "leshy", side: "ally", toSlot: j },
            });
          }
        }
      }

      if (ab === "arbiter_flex" && skill.verdictOk) {
        let foePow = 0;
        let myPow = 0;
        let foeN = 0;
        for (const s of foe.slots) {
          if (!s) continue;
          foeN++;
          foePow += s.attack + s.health;
        }
        for (const s of me.slots) {
          if (!s) continue;
          myPow += s.attack + s.health;
        }
        if (foeN >= 3 && foePow > myPow + 4) {
          choices.push({
            kind: "flex",
            slot: i,
            score: (20 + (foePow - myPow)) * fm,
            flex: { type: "arbiter" },
          });
        }
      }

      if (ab === "balthazar_flex" && skill.advancedFlex) {
        // Вытащить угрозу на открытую линию / убрать с опасной
        for (let a = 0; a < 5; a++) {
          for (let b = a + 1; b < 5; b++) {
            if (!foe.slots[a] || !foe.slots[b]) continue;
            const ua = foe.slots[a]!;
            const ub = foe.slots[b]!;
            let sc = 0;
            // Сильный милишник в закрытой линии ↔ слабый в открытой
            if (
              mission.openLanes.includes(a) &&
              ub.attack > ua.attack &&
              (patternOf(ub.cardId) === "melee" ||
                patternOf(ub.cardId) === "melee_lane3")
            ) {
              sc += ub.attack * 3;
            }
            if (
              mission.openLanes.includes(b) &&
              ua.attack > ub.attack &&
              (patternOf(ua.cardId) === "melee" ||
                patternOf(ua.cardId) === "melee_lane3")
            ) {
              sc += ua.attack * 3;
            }
            if (sc >= 9) {
              choices.push({
                kind: "flex",
                slot: i,
                score: (10 + sc) * fm,
                flex: { type: "balthazar", a, b },
              });
            }
          }
        }
      }
    }
  }

  if (!choices.length) return null;
  choices.sort((a, b) => b.score - a.score);
  // Среди почти равных — softmax к лучшему (не равномерный рандом)
  const top = choices[0]!.score;
  const near = choices.filter((c) => c.score >= top - skill.choiceSlack);
  const rng = aiStepRng(
    next.aiSeed ?? ((next.aiLevel ?? 1) * 1009 + next.turn),
    next.turn,
    near.length,
  );
  // Летал / срочный блок линии — без лотереи
  let forced: (typeof choices)[number] | undefined;
  if (mission.canLethal) {
    forced = choices.find((c) => {
      if (c.kind === "combat") return true;
      if (c.kind !== "spell") return false;
      const id = me.hand[c.hi];
      if (!id) return false;
      return (getCard(id).spellEffects ?? []).some(
        (e) => e.type === "damage_hero" || e.type === "damage_enemy",
      );
    });
  } else if (mission.mustDefend) {
    forced = choices.find(
      (c) =>
        c.kind === "creature" && mission.openLanes.includes(c.slot),
    );
  }
  let best = forced ?? near[0]!;
  if (!forced && near.length > 1) {
    const temp = Math.max(0.8, skill.choiceTemp);
    let sum = 0;
    const weights = near.map((c) => {
      const w = Math.exp((c.score - top) / temp);
      sum += w;
      return w;
    });
    let r = rng() * sum;
    for (let i = 0; i < near.length; i++) {
      r -= weights[i]!;
      if (r <= 0) {
        best = near[i]!;
        break;
      }
    }
  }

  // ===== Исполнение =====
  if (best.kind === "ramp") {
    const id = me.hand[best.hi]!;
    const card = getCard(id);
    const effects = resolveSpellEffects(
      id,
      card.spellEffects ?? [],
      battleUpgradeLevel(next, "enemy", id),
    );
    payMana(me.mana, costOf(id));
    me.hand.splice(best.hi, 1);
    applySpellEffects(next, me, foe, effects, null, next.log);
    addSpellEcho(next, me, foe, id, effects);
    next.log.unshift(`Соперник: ${card.name}`);
    next.log = next.log.slice(0, 10);
    return {
      state: next,
      fx: normalizeBattleFx({ side: "enemy", kind: "spell", cardId: id }),
    };
  }

  if (best.kind === "creature") {
    const card = getCard(me.hand[best.hi]!);
    const cost = card.manaCost ?? {};
    payMana(me.mana, cost);
    const id = me.hand.splice(best.hi, 1)[0]!;
    const spawned = spawnCreature(
      id,
      next.rules,
      battleUpgradeLevel(next, "enemy", id),
    );
    spawned.paidMana = { ...cost };
    me.slots[best.slot] = spawned;
    syncBoardAuras(me, next.log);
    const up = hostUpgradeLevel(spawned, id);
    if (card.school === "nature") {
      me.natureSummonHpTotal =
        (me.natureSummonHpTotal ?? 0) + Math.max(1, card.health ?? 1);
    }
    if (id === "ent") {
      let hp = Math.max(1, spawned.baseHealth);
      if (entUsesBoardHp(up)) {
        let sum = 0;
        for (const u of me.slots) {
          if (!u || u.uid === spawned.uid) continue;
          sum += Math.max(0, u.health);
        }
        hp = Math.max(1, sum || spawned.baseHealth);
      } else {
        hp = Math.max(1, me.natureSummonHpTotal ?? spawned.baseHealth);
      }
      spawned.baseHealth = hp;
      spawned.health = hp;
    }
    if (id === "spider" && spiderShieldOnPlay(up)) {
      spawned.statuses = spawned.statuses.filter((st) => st.type !== "shield");
      spawned.statuses.push({ type: "shield", amount: 3 });
    }
    if (id === "unicorn" && unicornManaOnPlay(up)) {
      addMana(me.mana, "nature", 1);
    }
    if (id === "goblin" && goblinStealOnPlay(up)) {
      tryStealMana(me, foe, next.log);
    }
    if (id === "tank" && tankSelfShieldOnPlay(up)) {
      spawned.statuses = spawned.statuses.filter((st) => st.type !== "shield");
      spawned.statuses.push({ type: "shield", amount: 2 });
    }
    if (id === "colossus" && colossusManaOnPlay(up)) {
      addMana(me.mana, "life", 1);
    }
    if (id === "colossus" && colossusArmyShieldOnPlay(up)) {
      for (const s of me.slots) {
        if (!s) continue;
        s.statuses = s.statuses.filter((st) => st.type !== "shield");
        s.statuses.push({ type: "shield", amount: 1 });
      }
    }
    if (id === "kraken" && krakenWaterHpBonus(up)) {
      let waters = 0;
      for (const side of [me, foe]) {
        for (const u of side.slots) {
          if (u && getCard(u.cardId).school === "water") waters += 1;
        }
      }
      if (waters > 0) {
        spawned.baseHealth += waters;
        spawned.health += waters;
      }
    }
    if (id === "veles") {
      const heal = velesHealOnPlay(up);
      if (heal > 0) me.hp = Math.min(me.maxHp, me.hp + heal);
    } else if (card.onPlayHealHero) {
      me.hp = Math.min(me.maxHp, me.hp + card.onPlayHealHero);
    }
    next.log.unshift(`Соперник ставит ${card.name}`);
    next.log = next.log.slice(0, 10);
    checkWinner(next);
    return {
      state: next,
      fx: { side: "enemy", kind: "play", toSlot: best.slot, cardId: id },
    };
  }

  if (best.kind === "spell") {
    const id = me.hand[best.hi]!;
    const card = getCard(id);
    const need = spellNeedsTarget(card.spellEffects ?? []);
    const target = best.target;
    payMana(me.mana, costOf(id));
    me.hand.splice(best.hi, 1);
    const linger = isLingeringSpell(id);
    const effects = resolveSpellEffects(
      id,
      card.spellEffects ?? [],
      battleUpgradeLevel(next, "enemy", id),
    );
    const massHits = effects.some(
      (e) => e.type === "damage_all_enemies" || e.type === "poison_all",
    )
      ? occupiedSlots(foe)
      : undefined;
    applySpellEffects(
      next,
      me,
      foe,
      effects,
      target,
      next.log,
      linger ? { cardId: id } : undefined,
    );
    if (!linger) addSpellEcho(next, me, foe, id, effects);
    next.log.unshift(`Соперник: ${card.name}`);
    next.log = next.log.slice(0, 10);
    checkWinner(next);
    return {
      state: next,
      fx: normalizeBattleFx({
        side: "enemy",
        kind: "spell",
        cardId: id,
        toSlot: target ?? undefined,
        hitSlots:
          massHits ??
          ((need === "enemy" || need === "enemy_or_hero") &&
          target != null
            ? [target]
            : undefined),
        hitHero:
          (need == null &&
            effects.some((e) => e.type === "damage_hero")) ||
          (need === "enemy_or_hero" && target == null),
      }),
    };
  }

  if (best.kind === "flex") {
    const i = best.slot;
    const atk = me.slots[i];
    if (!atk || !atk.canAttack) return null;
    const flex = best.flex;
    const name = getCard(atk.cardId).name;

    if (flex.type === "angel_buff") {
      const t = me.slots[flex.toSlot];
      if (!t) return null;
      t.permAttack += 2;
      t.permHealth += 2;
      t.attack += 2;
      t.health += 2;
      atk.canAttack = false;
      next.log.unshift(
        `Соперник: ${name} +2/+2 на ${getCard(t.cardId).name}`,
      );
      next.log = next.log.slice(0, 10);
      return {
        state: next,
        fx: {
          side: "enemy",
          kind: "heal",
          fromSlot: i,
          toSlot: flex.toSlot,
        },
      };
    }

    if (flex.type === "mage_buff") {
      const t = me.slots[flex.toSlot];
      if (!t) return null;
      t.permHealth += 3;
      t.health += 3;
      atk.canAttack = false;
      next.log.unshift(
        `Соперник: ${name} +3 HP на ${getCard(t.cardId).name}`,
      );
      next.log = next.log.slice(0, 10);
      return {
        state: next,
        fx: {
          side: "enemy",
          kind: "heal",
          fromSlot: i,
          toSlot: flex.toSlot,
        },
      };
    }

    if (flex.type === "mage_oracle") {
      me.maxHp += 3;
      me.hp += 3;
      atk.canAttack = false;
      next.log.unshift(
        `Соперник: ${name} +3 HP оракулу → ${me.hp}/${me.maxHp}`,
      );
      next.log = next.log.slice(0, 10);
      return {
        state: next,
        fx: {
          side: "enemy",
          kind: "heal",
          fromSlot: i,
          hitHero: true,
        },
      };
    }

    if (flex.type === "sleep") {
      const t = foe.slots[flex.toSlot];
      if (!t) return null;
      putToSleep(t, next.log, name);
      atk.canAttack = false;
      next.log = next.log.slice(0, 10);
      return {
        state: next,
        fx: {
          side: "enemy",
          kind: "spell",
          fromSlot: i,
          toSlot: flex.toSlot,
          cardId: atk.cardId,
        },
      };
    }

    if (flex.type === "summon") {
      if (me.slots[flex.toSlot]) return null;
      me.slots[flex.toSlot] = spawnCreature(
        flex.cardId,
        next.rules,
        battleUpgradeLevel(next, "enemy", flex.cardId),
      );
      atk.canAttack = false;
      syncBoardAuras(me, next.log);
      next.log.unshift(
        `Соперник: ${name} призывает ${getCard(flex.cardId).name}`,
      );
      next.log = next.log.slice(0, 10);
      return {
        state: next,
        fx: {
          side: "enemy",
          kind: "play",
          fromSlot: i,
          toSlot: flex.toSlot,
          cardId: flex.cardId,
        },
      };
    }

    if (flex.type === "paladin_shield") {
      const t = me.slots[flex.toSlot];
      if (!t) return null;
      t.statuses = t.statuses.filter((st) => st.type !== "shield");
      t.statuses.push({ type: "shield", amount: 2 });
      atk.canAttack = false;
      next.log.unshift(
        `Соперник: ${name} даёт щит ${getCard(t.cardId).name}`,
      );
      next.log = next.log.slice(0, 10);
      return {
        state: next,
        fx: {
          side: "enemy",
          kind: "heal",
          fromSlot: i,
          toSlot: flex.toSlot,
        },
      };
    }

    if (flex.type === "gravedigger") {
      if (me.slots[flex.toSlot]) return null;
      const visible = recentGraveCreatures(me.graveyard, 5);
      const pick = visible.find((e) => e.index === flex.graveIndex);
      if (!pick) return null;
      const cardId = me.graveyard.splice(pick.index, 1)[0]!;
      me.slots[flex.toSlot] = spawnCreature(
        cardId,
        next.rules,
        battleUpgradeLevel(next, "enemy", cardId),
      );
      atk.canAttack = false;
      syncBoardAuras(me, next.log);
      next.log.unshift(
        `Соперник: ${name} поднимает ${getCard(cardId).name}`,
      );
      next.log = next.log.slice(0, 10);
      return {
        state: next,
        fx: {
          side: "enemy",
          kind: "play",
          fromSlot: i,
          toSlot: flex.toSlot,
          cardId,
        },
      };
    }

    if (flex.type === "leshy") {
      // Только союзники бота
      if (flex.side !== "ally") return null;
      const owner = me;
      const target = owner.slots[flex.toSlot];
      if (!target || flex.toSlot === i) return null;
      const before = `${target.attack}/${target.health}`;
      const ba = target.baseAttack;
      target.baseAttack = target.baseHealth;
      target.baseHealth = ba;
      const pa = target.permAttack;
      target.permAttack = target.permHealth;
      target.permHealth = pa;
      const base = effectiveBase(target);
      target.attack = base.atk;
      target.health = base.hp;
      atk.canAttack = false;
      next.log.unshift(
        `Соперник: ${name} меняет статы ${getCard(target.cardId).name}: ${before} → ${target.attack}/${target.health}`,
      );
      next.log = next.log.slice(0, 10);
      if (target.health <= 0) {
        removeIfDead(owner, flex.toSlot, next.log, next);
      }
      checkWinner(next);
      return {
        state: next,
        fx: {
          side: "enemy",
          kind: "spell",
          fromSlot: i,
          toSlot: flex.toSlot,
          cardId: atk.cardId,
        },
      };
    }

    if (flex.type === "arbiter") {
      const skipUid = atk.uid;
      let n = 0;
      for (const side of [me, foe]) {
        for (const u of side.slots) {
          if (!u || u.uid === skipUid) continue;
          smashToOneOne(u);
          n++;
        }
      }
      atk.canAttack = false;
      next.log.unshift(
        n > 0
          ? `Соперник: Вердикт ${name} — ${n} существ стали 1/1`
          : `Соперник: Вердикт ${name}`,
      );
      next.log = next.log.slice(0, 10);
      return {
        state: next,
        fx: {
          side: "enemy",
          kind: "spell",
          fromSlot: i,
          cardId: atk.cardId,
        },
      };
    }

    if (flex.type === "balthazar") {
      const a = foe.slots[flex.a];
      const b = foe.slots[flex.b];
      if (!a || !b) return null;
      foe.slots[flex.a] = b;
      foe.slots[flex.b] = a;
      atk.canAttack = false;
      next.log.unshift(
        `Соперник: ${name} меняет ${getCard(a.cardId).name} ↔ ${getCard(b.cardId).name}`,
      );
      next.log = next.log.slice(0, 10);
      return {
        state: next,
        fx: {
          side: "enemy",
          kind: "spell",
          fromSlot: i,
          cardId: atk.cardId,
        },
      };
    }

    return null;
  }

  // combat
  {
    const i = best.slot;
    const atk = me.slots[i];
    if (!atk || !atk.canAttack) return null;
    const lethalFocus = mission.canLethal;

    const pattern = patternOf(atk.cardId);
    let hitSlots: number[] = [];
    let hitHero = false;

    if (pattern === "melee") {
      const block = foe.slots[i];
      if (block && canPhysicallyAttack(atk.cardId, block.cardId, block)) {
        meleeStrike(me, foe, i, i, next.log, next);
        hitSlots = [i];
      } else if (!block) {
        foe.hp -= atk.attack;
        atk.canAttack = false;
        next.log.unshift(
          `Соперник: ${getCard(atk.cardId).name} бьёт тебя на ${atk.attack}`,
        );
        tryVampireGrow(me, i, next.log);
        hitHero = true;
      } else {
        foe.hp -= atk.attack;
        atk.canAttack = false;
        next.log.unshift(
          `Соперник: ${getCard(atk.cardId).name} не может бить ${getCard(block.cardId).name} — удар в героя`,
        );
        tryVampireGrow(me, i, next.log);
        hitHero = true;
      }
    } else if (pattern === "melee_lane3") {
      const lane = cleaveSlots(i).find(
        (j) =>
          foe.slots[j] &&
          canPhysicallyAttack(atk.cardId, foe.slots[j]!.cardId, foe.slots[j]!),
      );
      if (lane != null && !(lethalFocus && foe.hp <= atk.attack)) {
        meleeStrike(me, foe, i, lane, next.log, next);
        hitSlots = [lane];
      } else {
        foe.hp -= atk.attack;
        atk.canAttack = false;
        next.log.unshift(
          `Соперник: ${getCard(atk.cardId).name} бьёт тебя на ${atk.attack}`,
        );
        tryVampireGrow(me, i, next.log);
        hitHero = true;
      }
    } else if (pattern === "ranged") {
      const pick = aiPickStrikeTarget(
        me,
        foe,
        atk,
        true,
        mission,
        skill.tradeMul,
      );
      if (pick === "hero" || pick == null) {
        foe.hp -= atk.attack;
        atk.canAttack = false;
        next.log.unshift(`Соперник: лучник бьёт героя на ${atk.attack}`);
        tryVampireGrow(me, i, next.log);
        hitHero = true;
      } else {
        rangedHit(me, foe, i, pick, next.log, next);
        hitSlots = [pick];
      }
    } else if (pattern === "aoe_all") {
      const names: string[] = [];
      foe.slots.forEach((s, idx) => {
        if (!s || !canPhysicallyAttack(atk.cardId, s.cardId, s)) return;
        dealToCreature(s, atk.attack, next.log);
        names.push(getCard(s.cardId).name);
        hitSlots.push(idx);
      });
      if (hitSlots.length && !(lethalFocus && foe.hp <= atk.attack)) {
        atk.canAttack = false;
        next.log.unshift(
          `Соперник: ${getCard(atk.cardId).name} бьёт всех [${names.join(", ")}]`,
        );
        foe.slots.forEach((_, idx) => removeIfDead(foe, idx, next.log, next));
        tryVampireGrow(me, i, next.log);
      } else {
        foe.hp -= atk.attack;
        atk.canAttack = false;
        next.log.unshift(
          `Соперник: ${getCard(atk.cardId).name} бьёт героя на ${atk.attack}`,
        );
        tryVampireGrow(me, i, next.log);
        hitHero = true;
      }
    } else if (pattern === "lane_cleave3") {
      const laneHits = cleaveSlots(i).filter(
        (j) =>
          foe.slots[j] &&
          canPhysicallyAttack(atk.cardId, foe.slots[j]!.cardId, foe.slots[j]!),
      );
      if (laneHits.length && !(lethalFocus && foe.hp <= atk.attack)) {
        cleaveHit(me, foe, i, i, next.log, next);
        hitSlots = laneHits;
      } else {
        foe.hp -= atk.attack;
        atk.canAttack = false;
        next.log.unshift(
          `Соперник: ${getCard(atk.cardId).name} бьёт героя на ${atk.attack}`,
        );
        tryVampireGrow(me, i, next.log);
        hitHero = true;
      }
    } else {
      let bestCenter: number | null = null;
      let bestCleave = -1e9;
      for (let j = 0; j < 5; j++) {
        const mid = foe.slots[j];
        if (!mid || !canPhysicallyAttack(atk.cardId, mid.cardId, mid)) continue;
        let sc = 0;
        for (const k of cleaveSlots(j)) {
          const u = foe.slots[k];
          if (!u || !canPhysicallyAttack(atk.cardId, u.cardId, u)) continue;
          sc +=
            (atk.attack >= u.health ? 18 + u.attack * 3 : atk.attack) +
            (abilityOf(u.cardId, u) === "vampire_grow" ? 20 : 0);
        }
        if (sc > bestCleave) {
          bestCleave = sc;
          bestCenter = j;
        }
      }
      const faceSc =
        (foe.hp <= atk.attack ? 200 : foe.hp <= atk.attack * 2 ? 40 : 0) +
        atk.attack * 5 +
        (lethalFocus ? 80 : 0);
      if (bestCenter != null && bestCleave >= faceSc) {
        cleaveHit(me, foe, i, bestCenter, next.log, next);
        hitSlots = cleaveSlots(bestCenter);
      } else {
        foe.hp -= atk.attack;
        atk.canAttack = false;
        next.log.unshift(`Соперник: клеов по герою ${atk.attack}`);
        tryVampireGrow(me, i, next.log);
        hitHero = true;
      }
    }

    pruneLingering(next);
    next.log = next.log.slice(0, 10);
    checkWinner(next);
    return {
      state: next,
      fx: normalizeBattleFx({
        side: "enemy",
        kind: "lunge",
        fromSlot: i,
        hitSlots,
        hitHero,
        cardId: atk.cardId,
        motion: attackMotionFor(atk.cardId),
      }),
    };
  }
}

/** Подсказка для UI: куда бить / кого подсветить при своей атаке */
export function attackFxPreview(
  state: BattleState,
  fromSlot: number,
  target: "hero" | number,
): BattleFx {
  const atk = state.you.slots[fromSlot];
  const pattern = atk ? patternOf(atk.cardId, atk) : "melee";
  const cardId = atk?.cardId;
  const motion = cardId ? attackMotionFor(cardId) : "melee";
  if (target === "hero") {
    return normalizeBattleFx({
      side: "you",
      kind: "lunge",
      fromSlot,
      hitHero: true,
      cardId,
      motion,
    });
  }
  if (pattern === "lane_cleave3") {
    return normalizeBattleFx({
      side: "you",
      kind: "lunge",
      fromSlot,
      hitSlots: cleaveSlots(fromSlot),
      cardId,
      motion,
    });
  }
  if (pattern === "cleave3") {
    const fx = normalizeBattleFx({
      side: "you",
      kind: "lunge",
      fromSlot,
      hitSlots: cleaveSlots(target),
      cardId,
      motion,
    });
    if (cardId && hasAbility(cardId, "flame_burn", atk)) fx.vfx = "burn";
    return fx;
  }
  if (pattern === "aoe_all") {
    return normalizeBattleFx({
      side: "you",
      kind: "lunge",
      fromSlot,
      hitSlots: state.enemy.slots
        .map((s, i) => (s ? i : -1))
        .filter((i) => i >= 0),
      cardId,
      motion,
    });
  }
  const fx = normalizeBattleFx({
    side: "you",
    kind: "lunge",
    fromSlot,
    hitSlots: [target],
    cardId,
    motion,
  });
  if (cardId && hasAbility(cardId, "flame_burn", atk)) {
    fx.vfx = "burn";
  }
  return fx;
}

export function selectHand(state: BattleState, index: number | null): BattleState {
  return { ...state, selectedHand: index, selectedSlot: null };
}

export function selectSlot(state: BattleState, index: number | null): BattleState {
  return { ...state, selectedSlot: index, selectedHand: null };
}

export function spellTargetMode(
  state: BattleState,
): "ally" | "enemy" | "enemy_or_hero" | "ally_pair" | "marionette" | null {
  if (state.selectedHand == null) return null;
  const id = state.you.hand[state.selectedHand];
  if (!id) return null;
  const card = getCard(id);
  if (card.kind !== "spell") return null;
  return spellNeedsTarget(card.spellEffects ?? []);
}

/** Союзник подходит под фильтр заклинания (напр. бонус нежити → только death). */
export function allyValidForSpell(
  spellCardId: string,
  targetCardId: string,
): boolean {
  const effects = getCard(spellCardId).spellEffects ?? [];
  for (const e of effects) {
    if (e.type === "buff_permanent" && e.onlySchool) {
      if (getCard(targetCardId).school !== e.onlySchool) return false;
    }
  }
  return true;
}

export type MarionetteTarget =
  | { kind: "enemy_unit"; slot: number }
  | { kind: "enemy_hero" }
  | { kind: "ally_unit"; slot: number }
  | { kind: "ally_hero" };

/** Дальник / маг / арбитр — гибкая марионетка; остальное ближний бой. */
export function marionetteIsRanged(
  cardId: string,
  host?: CreatureInstance | null,
): boolean {
  const pat = patternOf(cardId);
  return (
    pat === "ranged" ||
    pat === "aoe_all" ||
    pat === "cleave3" ||
    hasAbility(cardId, "mage_flex", host) ||
    hasAbility(cardId, "arbiter_flex", host)
  );
}

/** Допустима ли цель для уже выбранной куклы. */
export function marionetteTargetOk(
  state: BattleState,
  puppetSlot: number,
  target: MarionetteTarget,
): boolean {
  const puppet = state.enemy.slots[puppetSlot];
  if (!puppet) return false;
  const ranged = marionetteIsRanged(puppet.cardId, puppet);
  if (target.kind === "enemy_unit") {
    if (!state.enemy.slots[target.slot]) return false;
    if (target.slot === puppetSlot) return false;
    if (!ranged && Math.abs(target.slot - puppetSlot) !== 1) return false;
    return true;
  }
  if (target.kind === "enemy_hero") {
    // Ближник бьёт «на тебя», не своего героя
    return ranged;
  }
  if (target.kind === "ally_hero") {
    // Дальник лечит; ближник бьёт твоего оракула
    return true;
  }
  // ally_unit
  if (!state.you.slots[target.slot]) return false;
  // Дальник лечит любого; ближник бьёт напротив (тот же индекс) или любого твоего
  if (ranged) return true;
  return true;
}

/** Марионетка: кукла врага бьёт цель (или дальник лечит твоего), затем спит. */
export function playMarionette(
  state: BattleState,
  handIndex: number,
  puppetSlot: number,
  target: MarionetteTarget,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const foe = next.enemy;
  const cardId = me.hand[handIndex];
  if (!cardId) return state;
  const card = getCard(cardId);
  if (
    card.kind !== "spell" ||
    !(card.spellEffects ?? []).some((e) => e.type === "marionette")
  ) {
    return state;
  }
  const cost = battleManaCost(next, cardId);
  if (!canPay(me.mana, cost)) {
    next.log = [
      `Недостаточно маны (нужно ${formatManaCost(cost)})`,
      ...next.log,
    ].slice(0, 10);
    return next;
  }
  const puppet = foe.slots[puppetSlot];
  if (!puppet) {
    next.log = ["Нет существа-марионетки", ...next.log].slice(0, 10);
    return next;
  }
  if (hasAbility(puppet.cardId, "immune_spells", puppet)) {
    next.log = [
      `${getCard(puppet.cardId).name} невосприимчив к заклинаниям`,
      ...next.log,
    ].slice(0, 10);
    return next;
  }

  const isRanged = marionetteIsRanged(puppet.cardId, puppet);

  if (!marionetteTargetOk(next, puppetSlot, target)) {
    next.log = [
      isRanged
        ? "Марионетка: кликни врага, героя врага или своего (лечение)"
        : "Ближник-марионетка: сосед врага слева/справа, или удар по твоему существу/оракулу",
      ...next.log,
    ].slice(0, 10);
    return next;
  }

  payMana(me.mana, cost);
  me.hand.splice(handIndex, 1);
  const dmg = outgoingDamage(foe, puppet.attack);

  if (target.kind === "enemy_hero") {
    foe.hp -= dmg;
    next.log = [
      `Марионетка ${getCard(puppet.cardId).name} бьёт героя врага на ${dmg}`,
      ...next.log,
    ].slice(0, 10);
  } else if (target.kind === "enemy_unit") {
    const def = foe.slots[target.slot]!;
    const dealt = dealToCreature(def, dmg, next.log, foe.slots);
    next.log = [
      `Марионетка ${getCard(puppet.cardId).name} бьёт ${getCard(def.cardId).name} на ${dealt}`,
      ...next.log,
    ].slice(0, 10);
    for (let i = 0; i < foe.slots.length; i++) {
      removeIfDead(foe, i, next.log, next);
    }
  } else if (target.kind === "ally_hero") {
    if (isRanged) {
      me.hp = Math.min(me.maxHp, me.hp + dmg);
      next.log = [
        `Марионетка ${getCard(puppet.cardId).name}: сила ${dmg} лечит твоего оракула`,
        ...next.log,
      ].slice(0, 10);
    } else {
      me.hp -= dmg;
      next.log = [
        `Марионетка ${getCard(puppet.cardId).name} бьёт твоего оракула на ${dmg}`,
        ...next.log,
      ].slice(0, 10);
    }
  } else {
    const ally = me.slots[target.slot]!;
    if (isRanged) {
      const base = effectiveBase(ally);
      ally.health = Math.min(base.hp, ally.health + dmg);
      next.log = [
        `Марионетка ${getCard(puppet.cardId).name}: +${dmg} HP союзнику ${getCard(ally.cardId).name}`,
        ...next.log,
      ].slice(0, 10);
    } else {
      const dealt = dealToCreature(ally, dmg, next.log, me.slots);
      next.log = [
        `Марионетка ${getCard(puppet.cardId).name} бьёт твоего ${getCard(ally.cardId).name} на ${dealt}`,
        ...next.log,
      ].slice(0, 10);
      for (let i = 0; i < me.slots.length; i++) {
        removeIfDead(me, i, next.log, next);
      }
    }
  }

  putToSleep(puppet, next.log, me.name);
  next.selectedHand = null;
  next.selectedSlot = null;
  next.log = next.log.slice(0, 12);
  checkWinner(next);
  return next;
}

/** Страж + подопечный: tankSlot принимает урон за wardSlot. */
export function playGuardianBond(
  state: BattleState,
  handIndex: number,
  tankSlot: number,
  wardSlot: number,
): BattleState {
  if (state.winner || state.active !== "you") return state;
  if (tankSlot === wardSlot) return state;
  const next = structuredClone(state) as BattleState;
  const me = next.you;
  const cardId = me.hand[handIndex];
  if (!cardId) return state;
  const card = getCard(cardId);
  if (
    card.kind !== "spell" ||
    !(card.spellEffects ?? []).some((e) => e.type === "guardian_bond")
  ) {
    return state;
  }
  const tank = me.slots[tankSlot];
  const ward = me.slots[wardSlot];
  if (!tank || !ward) {
    next.log = ["Нужны два своих существа", ...next.log].slice(0, 10);
    return next;
  }
  const cost = battleManaCost(next, cardId);
  if (!canPay(me.mana, cost)) {
    next.log = [
      `Недостаточно маны (нужно ${formatManaCost(cost)})`,
      ...next.log,
    ].slice(0, 10);
    return next;
  }
  payMana(me.mana, cost);
  me.hand.splice(handIndex, 1);
  ward.guardedByUid = tank.uid;
  pushBoardSpell(me, {
    cardId,
    turnsLeft: null,
    targetUid: ward.uid,
    guardianUid: tank.uid,
    targetSide: "you",
    casterSide: "you",
    kind: "guardian",
    mode: "active",
  });
  next.selectedHand = null;
  next.selectedSlot = null;
  next.log = [
    `${me.name}: ${getCard(tank.cardId).name} берёт урон за ${getCard(ward.cardId).name}`,
    ...next.log,
  ].slice(0, 10);
  return next;
}
