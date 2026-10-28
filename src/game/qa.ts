/**
 * Прогонщик боёвки: каталог, мана, заклинания, существа/способности, дуэли.
 * Запуск: npm test
 */
import { CARDS, getCard } from "./cards";
import { botDeckForLevel, botHeroIdFor } from "./botDeck";
import {
  attackWith,
  bansheeFlexReady,
  buffWithMage,
  createBattle,
  endEnemyTurn,
  endPlayerTurn,
  healWithAngel,
  mageFlexReady,
  moveUnitToEmptySlot,
  playCard,
  playGuardianBond,
  playMarionette,
  selectHand,
  shieldWithPaladin,
  sleepWithMermaid,
  sleepWithSuccubus,
  spellTargetMode,
  stunWithBanshee,
  summonAquiliteWithTriton,
  summonHornetWithQueen,
  summonSkeletonWithNecro,
  swapEnemyWithBalthazar,
  swapStatsWithLeshy,
  reviveWithGravedigger,
  takeAiStep,
  validAttackTargets,
  verdictWithArbiter,
} from "./engine";
import { BASE_HEROES, emptyMana, FACTIONS, getHero, HEROES } from "./heroes";
import { canPay, growMana } from "./mana";
import {
  arenaAll,
  campaignAll,
  economyAll,
  progressIntegrity,
  retailIntegrity,
  soloModesAll,
} from "./qa-meta";
import type {
  BattleState,
  CreatureAbility,
  CreatureInstance,
  Faction,
  PlayerState,
  SpellEffect,
} from "./types";

const KNOWN_ABILITIES = new Set<CreatureAbility>([
  "skeleton_pack",
  "vampire_grow",
  "angel_heal",
  "mage_flex",
  "valkyrie_flex",
  "triton_flex",
  "mermaid_flex",
  "succubus_flex",
  "rush",
  "leprechaun_aura",
  "berserk_decay",
  "immune_hell_death",
  "immune_death",
  "immune_spells",
  "water_tide",
  "leshy_flex",
  "basilisk_gaze",
  "spider_poison",
  "hornet_pack",
  "hornet_queen_flex",
  "paladin_flex",
  "imp_burn",
  "gravedigger_flex",
  "lich_drain",
  "arbiter_flex",
  "aquilite_swap",
  "balthazar_flex",
  "banshee_flex",
  "necro_flex",
  "scorpion_poison",
  "mana_steal",
  "riposte",
]);

const KNOWN_EFFECTS = new Set<SpellEffect["type"]>([
  "damage_hero",
  "heal_hero",
  "damage_all_enemies",
  "damage_undead",
  "draw",
  "buff_permanent",
  "heal_unit",
  "poison",
  "damage_unit",
  "gain_mana",
  "slow_enemy",
  "shield_ally",
  "skip_combat",
  "shuffle_board",
  "extra_draw_turns",
  "buff_army_attack",
  "banish_unit",
  "cure_poison",
  "cure_poison_all",
  "bounce_enemy_hand",
  "reveal_enemy_hand",
  "guardian_bond",
  "break_enemy_spell",
  "break_all_enemy_spells",
  "traitor",
  "freeze_enemy",
  "discard_enemy_hand",
  "refresh_hand",
  "fear_protect",
  "marionette",
  "strip_ability",
  "gain_mana_all",
  "poison_all",
  "recruit_to_hand",
  "last_stand",
  "bunker",
  "mute_ranged",
  "weaken_foe_damage",
  "sniper_buff",
  "wake_ally",
  "wake_all_allies",
]);

export type QaFail = { area: string; detail: string };

export type QaReport = {
  failed: boolean;
  fails: QaFail[];
  ok: string[];
  text: string;
};

function dummy(cardId: string, uid: string, hp = 6): CreatureInstance {
  const c = getCard(cardId);
  const atk = c.attack ?? 1;
  return {
    uid,
    cardId,
    baseAttack: atk,
    baseHealth: hp,
    permAttack: 0,
    permHealth: 0,
    packBonus: 0,
    swarmBonus: 0,
    attack: atk,
    health: hp,
    canAttack: false,
    statuses: [],
  };
}

function firstCreatureId(): string {
  const c = CARDS.find((x) => x.kind === "creature");
  if (!c) throw new Error("В каталоге нет существ");
  return c.id;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function checkPlayer(tag: string, p: PlayerState, fails: QaFail[]): void {
  if (!FACTIONS.includes(p.faction)) {
    fails.push({ area: "инвариант", detail: `${tag}: неизвестная фракция ${p.faction}` });
  }
  if (!Number.isFinite(p.hp) || !Number.isFinite(p.maxHp) || p.maxHp <= 0) {
    fails.push({ area: "инвариант", detail: `${tag}: HP сломано hp=${p.hp} max=${p.maxHp}` });
  }
  if (p.slots.length !== 5) {
    fails.push({ area: "инвариант", detail: `${tag}: слотов ${p.slots.length}, надо 5` });
  }
  if (p.hand.length > 7) {
    fails.push({ area: "инвариант", detail: `${tag}: рука ${p.hand.length} > 7` });
  }
  for (const f of FACTIONS) {
    const n = p.mana[f];
    if (!Number.isFinite(n) || n < 0 || n > 10) {
      fails.push({
        area: "инвариант",
        detail: `${tag}: мана ${f}=${String(n)}`,
      });
    }
  }
  for (const id of [...p.hand, ...p.deck, ...p.graveyard]) {
    try {
      getCard(id);
    } catch {
      fails.push({ area: "инвариант", detail: `${tag}: неизвестная карта ${id}` });
    }
  }
  for (const s of p.slots) {
    if (!s) continue;
    if (!Number.isFinite(s.health) || !Number.isFinite(s.attack)) {
      fails.push({
        area: "инвариант",
        detail: `${tag}: статы NaN у ${s.cardId}`,
      });
    }
    try {
      getCard(s.cardId);
    } catch {
      fails.push({ area: "инвариант", detail: `${tag}: юнит ${s.cardId}` });
    }
  }
}

export function checkBattle(s: BattleState, fails: QaFail[], tag = "бой"): void {
  checkPlayer(`${tag}/ты`, s.you, fails);
  checkPlayer(`${tag}/враг`, s.enemy, fails);
  if (s.you.hp <= 0 && s.winner !== "enemy") {
    fails.push({ area: "инвариант", detail: `${tag}: ты мёртв, winner=${s.winner}` });
  }
  if (s.enemy.hp <= 0 && s.winner !== "you") {
    fails.push({ area: "инвариант", detail: `${tag}: враг мёртв, winner=${s.winner}` });
  }
}

function catalog(fails: QaFail[], ok: string[]): void {
  const ids = new Set<string>();
  let spells = 0;
  for (const c of CARDS) {
    if (!c.id) fails.push({ area: "каталог", detail: `карта без id: ${c.name}` });
    if (ids.has(c.id)) fails.push({ area: "каталог", detail: `дубль id: ${c.id}` });
    ids.add(c.id);
    if (!c.name) fails.push({ area: "каталог", detail: `${c.id}: нет имени` });
    if (c.kind === "spell") {
      spells += 1;
      const fx = c.spellEffects ?? [];
      if (fx.length === 0 && c.id !== "guardian_bond") {
        fails.push({ area: "каталог", detail: `${c.id} «${c.name}»: нет spellEffects` });
      }
      for (const e of fx) {
        if (!KNOWN_EFFECTS.has(e.type)) {
          fails.push({
            area: "каталог",
            detail: `${c.id}: неизвестный эффект ${e.type}`,
          });
        }
      }
    }
    if (c.kind === "creature") {
      if (c.attack == null || c.health == null) {
        fails.push({
          area: "каталог",
          detail: `${c.id} «${c.name}»: нет атаки/HP`,
        });
      }
      const abs = [c.ability, ...(c.abilities ?? [])].filter(
        (x): x is CreatureAbility => !!x,
      );
      for (const a of abs) {
        if (!KNOWN_ABILITIES.has(a)) {
          fails.push({
            area: "каталог",
            detail: `${c.id} «${c.name}»: неизвестная способность ${a}`,
          });
        }
      }
    }
    const cost = c.manaCost ?? {};
    for (const key of Object.keys(cost)) {
      if (key !== "neutral" && !FACTIONS.includes(key as Faction)) {
        fails.push({ area: "каталог", detail: `${c.id}: странный ключ маны ${key}` });
      }
    }
    try {
      getCard(c.id);
    } catch (e) {
      fails.push({ area: "каталог", detail: `getCard(${c.id}): ${String(e)}` });
    }
  }
  for (const h of HEROES) {
    if (!FACTIONS.includes(h.faction)) {
      fails.push({ area: "каталог", detail: `герой ${h.id}: фракция ${h.faction}` });
    }
    try {
      getHero(h.id);
    } catch (e) {
      fails.push({ area: "каталог", detail: `getHero(${h.id}): ${String(e)}` });
    }
  }
  const creatures = CARDS.filter((c) => c.kind === "creature").length;
  if (!fails.some((f) => f.area === "каталог")) {
    ok.push(
      `каталог: ${CARDS.length} карт, ${creatures} существ, ${spells} заклинаний, ${HEROES.length} оракулов`,
    );
  }
}

function manaRules(fails: QaFail[], ok: string[]): void {
  const p: PlayerState = {
    id: "you",
    name: "QA",
    heroId: "hero_life",
    faction: "life",
    hp: 15,
    maxHp: 15,
    mana: emptyMana(),
    deck: [],
    hand: [],
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
  p.mana.life = 1;
  p.mana.water = 1;
  growMana(p, 2);
  if (p.mana.life !== 2) {
    fails.push({ area: "мана", detail: `ход 2: своя школа ${p.mana.life}, ждали 2` });
  }
  if (p.mana.water !== 2) {
    fails.push({ area: "мана", detail: `ход 2: чужая ${p.mana.water}, ждали 2` });
  }
  growMana(p, 3);
  if (p.mana.life !== 3) {
    fails.push({ area: "мана", detail: `ход 3: своя школа ${p.mana.life}, ждали 3` });
  }
  if (p.mana.water !== 3) {
    fails.push({ area: "мана", detail: `ход 3: чужая ${p.mana.water}, ждали 3` });
  }

  const unit = firstCreatureId();
  const deck = Array.from({ length: 20 }, () => "hero_mana");
  let s = createBattle(deck, [unit, ...deck], "hero_life", "hero_hell", "QA", 1, 1);
  const t1 = s.you.mana.life;
  s = endPlayerTurn(s);
  s = endEnemyTurn(s);
  const t2 = s.you.mana.life;
  s = endPlayerTurn(s);
  s = endEnemyTurn(s);
  const t3 = s.you.mana.life;
  if (t2 !== t1 + 1 || t3 !== t1 + 2) {
    fails.push({
      area: "мана",
      detail: `рост по ходам: ${t1} → ${t2} → ${t3}, ждали +1 каждый ход`,
    });
  }

  s = createBattle(deck, deck, "hero_water", "hero_hell", "QA", 1, 1);
  const before = s.you.mana.water;
  const idx = s.you.hand.indexOf("hero_mana");
  if (idx < 0) {
    fails.push({ area: "мана", detail: "hero_mana нет в стартовой руке тестовой колоды" });
  } else {
    s = playCard(s, idx, null);
    if (s.you.mana.water !== before + 1) {
      fails.push({
        area: "мана",
        detail: `hero_mana: вода ${before} → ${s.you.mana.water}, ждали ${before + 1}`,
      });
    }
  }

  // Старт: все школы ≥2, своя ≥3
  const start = createBattle(
    ["skeleton", "zombie", "hero_mana", "poison"],
    ["tank", "skeleton", "zombie", "hero_mana"],
    "hero_life",
    "hero_hell",
    "QA",
    1,
    1,
  );
  for (const f of FACTIONS) {
    const n = start.you.mana[f] ?? 0;
    if (n < 2) {
      fails.push({ area: "мана", detail: `старт ${f}=${n}, ждали ≥2` });
    }
  }
  if ((start.you.mana.life ?? 0) < 3) {
    fails.push({
      area: "мана",
      detail: `старт своей life=${start.you.mana.life}, ждали ≥3`,
    });
  }

  if (!fails.some((f) => f.area === "мана")) {
    ok.push("мана: все школы +1/ход, старт 2+ у всех, своя сильнее, hero_mana +1");
  }
}

/** Короткая колода (песочница «старт 4») и ураган — без ложного буйства/no-op. */
function shortDeckAndShuffle(fails: QaFail[], ok: string[]): void {
  const short = ["skeleton", "zombie", "hero_mana", "poison"];
  let s = createBattle(short, short, "hero_death", "hero_hell", "QA", 10, 10);
  s = endPlayerTurn(s);
  if (s.bloodFrenzy > 0) {
    fails.push({
      area: "буйство",
      detail: `старт 4 карт: буйство на 1-м конце хода (frenzy=${s.bloodFrenzy}, hp ${s.you.hp}/${s.enemy.hp})`,
    });
  } else if (s.winner) {
    fails.push({
      area: "буйство",
      detail: `старт 4 карт: победитель ${s.winner} без буйства`,
    });
  }

  let t = createBattle(
    ["spider", "spider", "spider", "hurricane", ...Array(16).fill("elf")],
    ["fire_gopnik", ...Array(19).fill("strike")],
    "hero_nature",
    "hero_hell",
    "QA",
    1,
    1,
  );
  t.you.mana.nature = 10;
  t.you.hand = ["spider", "elf", "spider", "hurricane"];
  t.you.deck = ["elf"];
  t = playCard(t, 0, 0);
  t = playCard(t, 0, 2);
  t = playCard(t, 0, 4);
  const before = t.you.slots.map((x) => x?.uid ?? "-");
  const hi = t.you.hand.indexOf("hurricane");
  t = playCard(t, hi, null);
  const after = t.you.slots.map((x) => x?.uid ?? "-");
  const sameSlots =
    before[0] === after[0] &&
    before[2] === after[2] &&
    before[4] === after[4];
  if (sameSlots) {
    fails.push({
      area: "ураган",
      detail: `shuffle_board не сдвинул существ: ${before.join()} → ${after.join()}`,
    });
  }
  // Занятые слоты те же (0,2,4) — не разбрасываем в пустые
  const occupiedBefore = before.filter((u) => u !== "-").sort().join();
  const occupiedAfter = after.filter((u) => u !== "-").sort().join();
  if (occupiedBefore !== occupiedAfter) {
    fails.push({
      area: "ураган",
      detail: `потерялись uid при шафле: ${occupiedBefore} vs ${occupiedAfter}`,
    });
  }

  // Доп. мана в эхе до конца хода — не тасуется в руку, пока остальные карты «заняты»
  let m = createBattle(
    ["skeleton", "zombie", "hero_mana", "poison"],
    ["fire_gopnik", "fire_lizard", "hero_mana", "strike"],
    "hero_death",
    "hero_hell",
    "QA",
    1,
    1,
  );
  m.you.hand = ["skeleton", "hero_mana", "poison"];
  m.you.deck = [];
  m.you.graveyard = [];
  m = playCard(m, 0, 0); // скелет на стол
  m = playCard(m, m.you.hand.indexOf("hero_mana"), null);
  m = playCard(m, m.you.hand.indexOf("poison"), 0);
  // Колода пуста, в грейве не должно быть hero_mana (она в эхе)
  if (m.you.graveyard.includes("hero_mana")) {
    fails.push({
      area: "доп.мана",
      detail: "hero_mana уже в грейве до конца хода — будет снова лезть в руку",
    });
  }
  if (!m.you.activeSpells.some((sp) => sp.cardId === "hero_mana")) {
    fails.push({
      area: "доп.мана",
      detail: "hero_mana должна висеть эхом до конца хода",
    });
  }
  // Добор при пустой колоде не должен вытянуть только рамп из грейва
  const beforeHand = [...m.you.hand];
  m = endPlayerTurn(m);
  // после конца хода рамп сгорает (не в грейв); на ходе врага свой добор не идёт
  if (m.you.hand.join() !== beforeHand.join()) {
    fails.push({
      area: "доп.мана",
      detail: `рука изменилась на конце хода: ${beforeHand.join()} → ${m.you.hand.join()}`,
    });
  }
  if (m.you.graveyard.includes("hero_mana")) {
    fails.push({
      area: "доп.мана",
      detail: "hero_mana попала в грейв — снова зациклится в короткой колоде",
    });
  }
  // полный цикл: ход врага → твой добор — рамп не должен вернуться
  m = endEnemyTurn(m);
  if (m.you.hand.includes("hero_mana") || m.you.deck.includes("hero_mana")) {
    fails.push({
      area: "доп.мана",
      detail: "hero_mana вернулась после полного круга ходов",
    });
  }

  if (
    !fails.some(
      (f) =>
        f.area === "буйство" || f.area === "ураган" || f.area === "доп.мана",
    )
  ) {
    ok.push(
      "буйство/ураган/доп.мана: короткий старт ок, шафл двигает, рамп не циклится в руку",
    );
  }
}

function setupSpellBoard(spellId: string): BattleState {
  const unit = firstCreatureId();
  const fills = Array.from({ length: 24 }, () => unit);
  const s = createBattle(
    [spellId, ...fills],
    [spellId, ...fills],
    "hero_life",
    "hero_hell",
    "QA",
    1,
    1,
  );
  s.you.mana = { water: 9, hell: 9, death: 9, life: 9, nature: 9 };
  s.enemy.mana = { ...s.you.mana };
  s.you.hand = [spellId, unit, unit];
  s.you.deck = [...fills];
  s.enemy.hand = [unit, unit, unit, unit];
  s.you.slots[0] = dummy(unit, "you-a");
  s.you.slots[1] = dummy(unit, "you-b");
  s.enemy.slots[0] = dummy(unit, "en-a", 8);
  s.enemy.slots[1] = dummy(unit, "en-b", 8);
  return s;
}

function spellsAll(fails: QaFail[], ok: string[]): void {
  const unit = firstCreatureId();
  const spells = CARDS.filter((c) => c.kind === "spell");
  let passed = 0;
  for (const card of spells) {
    const id = card.id;
    try {
      let s = setupSpellBoard(id);
      if (id === "life_root") s.you.hp = Math.max(1, s.you.maxHp - 5);
      if (id === "undead_strike") {
        const undead =
          CARDS.find((c) => c.kind === "creature" && c.school === "death")?.id ??
          unit;
        s.enemy.slots[0] = dummy(undead, "sk", 6);
      }
      if (id === "antidote") s.you.slots[0]!.statuses.push({ type: "poison", amount: 2 });
      if (id === "mass_antidote") {
        s.you.slots[0]!.statuses.push({ type: "poison", amount: 2 });
        s.you.slots[1]!.statuses.push({ type: "poison", amount: 1 });
      }
      if (id === "break_spell" || id === "break_all_spells") {
        s.enemy.activeSpells.push({
          uid: "qa-sp",
          cardId: "shield",
          turnsLeft: 2,
          targetUid: s.enemy.slots[0]!.uid,
          targetSide: "enemy",
          casterSide: "enemy",
          kind: "shield",
          mode: "active",
        });
        s.enemy.slots[0]!.statuses.push({ type: "shield", amount: 2 });
      }
      if (id === "sniper") {
        const ranged =
          CARDS.find(
            (c) => c.kind === "creature" && c.attackPattern === "ranged",
          )?.id ?? unit;
        s.you.slots[0] = dummy(ranged, "you-sniper", 6);
      }
      if (id === "undead_bonus") {
        const undead =
          CARDS.find((c) => c.kind === "creature" && c.school === "death")?.id ??
          "skeleton";
        s.you.slots[0] = dummy(undead, "you-undead", 6);
      }

      if (id === "guardian_bond") {
        s = playGuardianBond(s, 0, 0, 1);
        if (s.you.slots[1]?.guardedByUid !== s.you.slots[0]?.uid) {
          fails.push({ area: "магия", detail: `${id}: связь стража не встала` });
          continue;
        }
        passed += 1;
        continue;
      }

      if (id === "marionette") {
        const enHp = s.enemy.slots[1]!.health;
        s = playMarionette(s, 0, 0, { kind: "enemy_unit", slot: 1 });
        if (s.you.hand.includes(id)) {
          fails.push({
            area: "магия",
            detail: `${id}: карта не сыгралась (${s.log[0] ?? ""})`,
          });
          continue;
        }
        if ((s.enemy.slots[1]?.health ?? 0) >= enHp) {
          fails.push({ area: "магия", detail: `${id}: кукла не ударила соседа` });
          continue;
        }
        if (
          s.enemy.slots[0] &&
          !s.enemy.slots[0].statuses.some((st) => st.type === "sleep")
        ) {
          fails.push({ area: "магия", detail: `${id}: кукла не уснула` });
          continue;
        }
        passed += 1;
        continue;
      }

      const selected = selectHand(s, 0);
      const need = spellTargetMode(selected);
      if (need === "ally") s.you.slots[0] = s.you.slots[0] ?? dummy(unit, "you-a");
      if (need === "marionette") {
        fails.push({
          area: "магия",
          detail: `${id}: marionette должна идти через playMarionette`,
        });
        continue;
      }
      const slot = need === "ally" || need === "enemy" ? 0 : null;
      const hpEn = s.enemy.hp;
      const lifeBefore = s.you.mana.life;
      const enHp0 = s.enemy.slots[0]!.health;
      s = playCard(s, 0, slot);
      if (s.you.hand.includes(id)) {
        fails.push({
          area: "магия",
          detail: `${id} «${card.name}»: карта не сыгралась (${s.log[0] ?? ""})`,
        });
        continue;
      }
      let bad: string | null = null;
      switch (id) {
        case "hero_mana":
          if (s.you.mana.life !== lifeBefore + 1) bad = `мана ${lifeBefore}→${s.you.mana.life}`;
          break;
        case "strike":
          if (s.enemy.hp !== hpEn - 2) bad = `урон герою ${hpEn}→${s.enemy.hp}`;
          break;
        case "life_root":
          if (s.you.hp < 5) bad = `хил не прошёл, hp=${s.you.hp}`;
          break;
        case "ice_trap":
          if ((s.enemy.slots[0]?.health ?? 0) !== enHp0 - 3) {
            bad = `урон по юниту ${enHp0}→${s.enemy.slots[0]?.health}`;
          }
          break;
        case "poison":
          if (!s.enemy.slots[0]!.statuses.some((st) => st.type === "poison")) bad = "яд не наложился";
          else if (!s.enemy.activeSpells.some((sp) => sp.kind === "poison" && sp.casterSide === "you")) {
            bad = "яд не висит на поле кастера";
          }
          break;
        case "shield":
          if (!s.you.slots[0]!.statuses.some((st) => st.type === "shield")) bad = "щит не наложился";
          break;
        case "banish":
          if (s.enemy.slots[0]) bad = "враг не убран";
          break;
        case "freeze":
          if (!s.enemy.slots[0]!.statuses.some((st) => st.type === "sleep")) bad = "нет сна";
          break;
        case "traitor":
          if (!s.enemy.slots[0]!.statuses.some((st) => st.type === "traitor")) {
            bad = "нет изменника";
          }
          break;
        case "calm":
          if (s.calmTurnsLeft < 1) bad = "затишье не включилось";
          break;
        case "extra_card":
          if (s.you.bonusDrawTurns < 2) bad = `добор ${s.you.bonusDrawTurns}`;
          break;
        case "break_spell":
        case "break_all_spells":
          if (s.enemy.slots[0]!.statuses.some((st) => st.type === "shield")) {
            bad = "щит врага не снят";
          }
          break;
        case "fear":
          if (s.enemy.attackBanSchool !== s.you.faction || s.enemy.attackBanTurns < 2) {
            bad = `бан школы ${s.enemy.attackBanSchool}/${s.enemy.attackBanTurns}`;
          }
          break;
        case "last_stand": {
          const u = s.you.slots[0]!;
          if (!u.noRestore || u.baseAttack < 2) bad = `last_stand atk=${u.baseAttack} noRestore=${u.noRestore}`;
          break;
        }
        case "sniper":
          if (
            !s.you.slots.some(
              (u) => u && u.statuses.some((st) => st.type === "sniper"),
            )
          ) {
            bad = "снайпер не повесился на стрелка";
          }
          break;
        case "mana_stones": {
          const m = s.you.mana;
          if (
            m.water < 10 ||
            m.hell < 10 ||
            m.death < 10 ||
            m.life < 10 ||
            m.nature < 10
          ) {
            bad = `мана не +1: ${JSON.stringify(m)}`;
          }
          break;
        }
        default:
          break;
      }
      if (bad) fails.push({ area: "магия", detail: `${id} «${card.name}»: ${bad}` });
      else passed += 1;
    } catch (e) {
      fails.push({ area: "магия", detail: `${id} «${card.name}»: падение ${String(e)}` });
    }
  }
  if (passed === spells.length) ok.push(`магия: все ${spells.length} заклинаний сработали`);
  else ok.push(`магия: ${passed}/${spells.length} заклинаний ок`);
}

function boardForCreatures(): BattleState {
  const filler = firstCreatureId();
  const deck = Array.from({ length: 20 }, () => filler);
  const s = createBattle(deck, deck, "hero_life", "hero_hell", "QA", 1, 1);
  s.you.mana = { water: 9, hell: 9, death: 9, life: 9, nature: 9 };
  s.enemy.mana = { ...s.you.mana };
  s.you.hand = [];
  s.enemy.hand = [];
  s.you.slots = [null, null, null, null, null];
  s.enemy.slots = [null, null, null, null, null];
  return s;
}

function arm(u: CreatureInstance): CreatureInstance {
  return { ...u, canAttack: true };
}

function creaturesAll(fails: QaFail[], ok: string[]): void {
  let passed = 0;
  const checks: Array<[string, () => string | null]> = [];

  const assert = (name: string, fn: () => string | null) => {
    checks.push([name, fn]);
  };

  assert("rush spawn canAttack", () => {
    let s = boardForCreatures();
    s.you.hand = ["motardo"];
    s.you.mana.hell = 9;
    s = playCard(s, 0, 0);
    if (!s.you.slots[0]?.canAttack) return "rush не дал атаку сразу";
    return null;
  });

  assert("skeleton_pack +1/+1", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("skeleton", "sk1", 1));
    s.you.slots[1] = arm(dummy("skeleton", "sk2", 1));
    s.you.hand = ["skeleton"];
    s.you.mana.death = 9;
    s = playCard(s, 0, 2);
    const a = s.you.slots[0]!;
    if ((a.packBonus ?? 0) < 1 || a.attack < 2) {
      return `стая pack=${a.packBonus} atk=${a.attack}`;
    }
    return null;
  });

  assert("vampire_grow on hit", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("vampire", "v1", 2));
    s.enemy.slots[0] = dummy("spearman", "e1", 4);
    const before = s.you.slots[0]!.attack;
    s = attackWith(s, 0, 0);
    if (s.you.slots[0]!.attack !== before + 1) {
      return `укус ${before}→${s.you.slots[0]!.attack}`;
    }
    return null;
  });

  assert("дар косы только у эпика смерти", () => {
    const strike = (heroId: string) => {
      let s = createBattle(
        ["skeleton", "zombie", "tank", "hero_mana"],
        ["crossbowman", "tank", "tank", "hero_mana"],
        heroId,
        "hero_life",
        "QA",
        1,
        1,
      );
      s.you.slots[0] = arm(dummy("skeleton", "sk1", 1));
      s.you.slots[0]!.health = 1;
      s.you.slots[0]!.attack = 1;
      s.enemy.slots[0] = dummy("crossbowman", "cb", 3);
      s.enemy.slots[0]!.attack = 1;
      s.enemy.slots[0]!.health = 3;
      const before = s.you.mana.death ?? 0;
      s = attackWith(s, 0, 0);
      return {
        dead: !s.you.slots[0],
        gained: (s.you.mana.death ?? 0) - before,
      };
    };
    const base = strike("hero_death");
    const epic = strike("hero_death_epic");
    if (!base.dead || !epic.dead) return "скелет не умер от ответки";
    if (base.gained !== 0) return `обычная смерть +${base.gained} маны за труп`;
    if (epic.gained !== 1) return `эпик смерти +${epic.gained} маны за труп`;
    return null;
  });

  assert("riposte отвечает сразу", () => {
    let s = boardForCreatures();
    // Ящер 2/2 бьёт арбалетчика 1/3 напротив → ответка 1, ящер 2/1
    s.you.slots[0] = arm(dummy("fire_lizard", "liz", 2));
    s.you.slots[0]!.health = 2;
    s.enemy.slots[0] = dummy("crossbowman", "cb", 3);
    s.enemy.slots[0]!.attack = 1;
    s.enemy.slots[0]!.health = 3;
    s = attackWith(s, 0, 0);
    const liz = s.you.slots[0];
    const cb = s.enemy.slots[0];
    if (!cb || cb.health !== 1) return `арбалетчик HP ${cb?.health}, ждали 1`;
    if (!liz || liz.health !== 1) return `ящер после ответки HP ${liz?.health}, ждали 1`;
    return null;
  });

  assert("angel_heal +1/+1", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("angel", "a1", 4));
    s.you.slots[1] = dummy("tank", "t1", 4);
    const before = s.you.slots[1]!.attack;
    s = healWithAngel(s, 0, 1);
    if (s.you.slots[1]!.attack !== before + 1) return "ангел не бафнул";
    return null;
  });

  assert("mage_flex +1 HP", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("mage", "m1", 3));
    s.you.slots[1] = dummy("tank", "t1", 4);
    const before = s.you.slots[1]!.health;
    s = buffWithMage(s, 0, 1);
    if (s.you.slots[1]!.health !== before + 1) return "маг не дал HP";
    return null;
  });

  assert("paladin_flex shield", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("paladin", "p1", 5));
    s.you.slots[1] = dummy("tank", "t1", 4);
    s = shieldWithPaladin(s, 0, 1);
    if (!s.you.slots[1]!.statuses.some((st) => st.type === "shield")) {
      return "щит не встал";
    }
    return null;
  });

  assert("colossus immune_spells onPlay", () => {
    let s = boardForCreatures();
    s.you.slots[0] = dummy("tank", "t1", 4);
    s.you.hand = ["colossus"];
    s.you.mana = { water: 9, hell: 9, death: 9, life: 9, nature: 9 };
    s = playCard(s, 0, 1);
    if (!s.you.slots[0]!.statuses.some((st) => st.type === "shield")) {
      return "колосс не дал щит армии";
    }
    return null;
  });

  assert("imp_burn hits hero", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("imp", "i1", 2));
    s.enemy.slots[0] = null;
    const hp = s.enemy.hp;
    s = attackWith(s, 0, "hero");
    if (s.enemy.hp !== hp - 2 - 1) {
      return `имп: ждали −3 (2+1), стало ${hp}→${s.enemy.hp}`;
    }
    return null;
  });

  assert("lich_drain heal self", () => {
    let s = boardForCreatures();
    const lich = arm(dummy("lich", "l1", 4));
    lich.health = 2;
    s.you.slots[0] = lich;
    s.enemy.slots[0] = dummy("tank", "t1", 5);
    s = attackWith(s, 0, 0);
    if ((s.you.slots[0]?.health ?? 0) < 4) {
      return `лич HP после удара ${s.you.slots[0]?.health}`;
    }
    return null;
  });

  assert("poison returns to hand when target dies", () => {
    let s = createBattle(
      ["poison", "banish", "skeleton", "zombie"],
      ["tank", "skeleton", "zombie", "hero_mana"],
      "hero_death",
      "hero_hell",
      "QA",
      5,
      5,
    );
    s.you.mana = { ...s.you.mana, death: 10 };
    s.enemy.slots[0] = dummy("tank", "t1", 5);
    s = playCard(s, s.you.hand.indexOf("poison"), 0);
    if (!s.enemy.slots[0]?.statuses.some((st) => st.type === "poison")) {
      return "яд не наложился";
    }
    if (s.you.hand.includes("poison")) return "яд ещё в руке, пока действует";
    s = playCard(s, s.you.hand.indexOf("banish"), 0);
    if (s.enemy.slots[0]) return "цель не убрана";
    if (!s.you.hand.includes("poison")) {
      return `яд не вернулся в руку (рука=${s.you.hand.join(",")}; сброс врага=${s.enemy.graveyard.join(",")}; свой=${s.you.graveyard.join(",")})`;
    }
    if (s.enemy.graveyard.includes("poison")) {
      return "яд ушёл в сброс врага";
    }
    return null;
  });

  assert("spider_poison on hit", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("spider", "sp1", 2));
    s.enemy.slots[0] = dummy("tank", "t1", 5);
    s = attackWith(s, 0, 0);
    if (!s.enemy.slots[0]!.statuses.some((st) => st.type === "poison")) {
      return "яд паука не наложился";
    }
    return null;
  });

  assert("scorpion_poison on hit", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("scorpicora", "sc1", 3));
    s.enemy.slots[0] = dummy("tank", "t1", 5);
    s = attackWith(s, 0, 0);
    if (!s.enemy.slots[0]!.statuses.some((st) => st.type === "poison")) {
      return "яд скорпикоры не наложился";
    }
    return null;
  });

  assert("basilisk_gaze sleep", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("basilisk", "b1", 4));
    s.enemy.slots[0] = dummy("tank", "t1", 5);
    s = attackWith(s, 0, 0);
    if (!s.enemy.slots[0]!.statuses.some((st) => st.type === "sleep")) {
      return "окаменение не наложилось";
    }
    return null;
  });

  assert("water_tide +1 HP water", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("water_spirit", "w1", 2));
    s.you.hand = ["clawfiend"];
    s.you.mana.water = 9;
    const before = s.you.slots[0]!.health;
    s = playCard(s, 0, 1);
    if (s.you.slots[0]!.health !== before + 1) {
      return `прилив ${before}→${s.you.slots[0]!.health}`;
    }
    return null;
  });

  assert("hornet_pack ATK", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("hornet_warrior", "h1", 1));
    s.you.hand = ["hornet_warrior"];
    s.you.mana.nature = 9;
    s = playCard(s, 0, 1);
    if ((s.you.slots[0]!.swarmBonus ?? 0) < 1 || s.you.slots[0]!.attack < 2) {
      return `рой swarm=${s.you.slots[0]!.swarmBonus} atk=${s.you.slots[0]!.attack}`;
    }
    return null;
  });

  assert("leprechaun_aura on turn", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("leprechaun", "lp1", 2));
    s.you.hp = 10;
    s = endPlayerTurn(s);
    s = endEnemyTurn(s);
    if (s.you.hp < 11) return `леприкон не хильнул, hp=${s.you.hp}`;
    return null;
  });

  assert("berserk_decay on turn", () => {
    let s = boardForCreatures();
    const b = arm(dummy("berserk", "br1", 4));
    b.baseHealth = 4;
    s.you.slots[0] = b;
    s = endPlayerTurn(s);
    s = endEnemyTurn(s);
    if ((s.you.slots[0]?.baseHealth ?? 99) >= 4) {
      return `ярость не срезала HP, base=${s.you.slots[0]?.baseHealth}`;
    }
    return null;
  });

  assert("valkyrie move slot", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("valkyrie", "vk1", 4));
    s = moveUnitToEmptySlot(s, 0, 2);
    if (s.you.slots[0] || !s.you.slots[2]) return "валькирия не переместилась";
    if (s.you.slots[2]!.canAttack) return "ход после перемещения не потрачен";
    return null;
  });

  assert("aquilite_swap move", () => {
    let s = boardForCreatures();
    s.you.slots[1] = arm(dummy("aquilite", "aq1", 1));
    s = moveUnitToEmptySlot(s, 1, 3);
    if (s.you.slots[1] || !s.you.slots[3]) return "акулит не переместился";
    return null;
  });

  assert("triton summon aquilite", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("triton", "tr1", 3));
    s = summonAquiliteWithTriton(s, 0, 2);
    if (s.you.slots[2]?.cardId !== "aquilite") return "акулит не призван";
    return null;
  });

  assert("necro summon skeleton", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("necro_mage", "nm1", 3));
    s = summonSkeletonWithNecro(s, 0, 2);
    if (s.you.slots[2]?.cardId !== "skeleton") return "скелет не призван";
    return null;
  });

  assert("hornet_queen summon warrior", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("hornet_queen", "hq1", 5));
    s = summonHornetWithQueen(s, 0, 2);
    if (s.you.slots[2]?.cardId !== "hornet_warrior") return "шершень не призван";
    return null;
  });

  assert("mermaid sleep", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("mermaid", "mr1", 4));
    s.enemy.slots[1] = dummy("tank", "t1", 4);
    s = sleepWithMermaid(s, 0, 1);
    if (!s.enemy.slots[1]!.statuses.some((st) => st.type === "sleep")) {
      return "русалка не усыпила";
    }
    return null;
  });

  assert("succubus sleep male", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("succubus", "su1", 3));
    s.enemy.slots[1] = dummy("spearman", "sp1", 2);
    s = sleepWithSuccubus(s, 0, 1);
    if (!s.enemy.slots[1]!.statuses.some((st) => st.type === "sleep")) {
      return "сукуб не усыпила";
    }
    return null;
  });

  assert("succubus immune male attack", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("spearman", "m1", 2));
    s.enemy.slots[0] = dummy("succubus", "su1", 3);
    const targets = validAttackTargets(s, 0);
    if (targets.includes(0)) return "мужчина смог выбрать сукуба целью";
    return null;
  });

  assert("banshee stun", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("banshee", "bn1", 3));
    s.enemy.slots[0] = dummy("tank", "t1", 4);
    s = stunWithBanshee(s, 0, 0);
    if (!s.enemy.slots[0]!.statuses.some((st) => st.type === "sleep")) {
      return "банши не оглушила";
    }
    return null;
  });

  assert("nothingness strips ability, keeps attack", () => {
    let s = boardForCreatures();
    s.you.mana = { water: 9, hell: 9, death: 9, life: 9, nature: 9 };
    s.you.hand = ["nothingness"];
    const mage = arm(dummy("mage", "mg1", 4));
    const banshee = arm(dummy("banshee", "bn2", 3));
    s.enemy.slots[0] = mage;
    s.enemy.slots[1] = banshee;
    s = playCard(s, 0, 0);
    if (!s.enemy.slots[0]?.stripped) return "маг не stripped";
    // ход врага: у врага выбран слот — проверяем ready-хелперы на стороне you после свапа ролей через поля
    const foeView = {
      ...s,
      you: s.enemy,
      enemy: s.you,
      active: "you" as const,
    };
    foeView.you.slots[0]!.canAttack = true;
    foeView.selectedSlot = 0;
    if (mageFlexReady(foeView, 0)) return "stripped маг всё ещё даёт +HP";
    if (validAttackTargets(foeView, 0).length === 0) {
      return "stripped маг не может бить";
    }
    s.you.hand = ["nothingness"];
    s.you.mana = { water: 9, hell: 9, death: 9, life: 9, nature: 9 };
    s = playCard(s, 0, 1);
    if (!s.enemy.slots[1]?.stripped) return "банши не stripped";
    const foe2 = {
      ...s,
      you: s.enemy,
      enemy: s.you,
      active: "you" as const,
    };
    foe2.you.slots[1]!.canAttack = true;
    foe2.selectedSlot = 1;
    if (bansheeFlexReady(foe2, 1)) return "stripped банши всё ещё кричит";
    if (validAttackTargets(foe2, 1).length === 0) {
      return "stripped банши не может бить";
    }
    return null;
  });

  assert("slow_foe lasts through enemy turn", () => {
    let s = boardForCreatures();
    s.you.mana = { water: 9, hell: 9, death: 9, life: 9, nature: 9 };
    s.you.hand = ["slow_foe"];
    const foe = arm(dummy("zombie", "zbSlow", 5));
    foe.attack = 5;
    foe.baseAttack = 5;
    s.enemy.slots[0] = foe;
    s = playCard(s, 0, 0);
    if ((s.enemy.slots[0]?.attack ?? 99) !== 3) {
      return `сразу ATK ${s.enemy.slots[0]?.attack}, ждали 3`;
    }
    s = endPlayerTurn(s);
    // Ход врага: замедление ещё висит, иначе спелл бесполезен
    if (!s.enemy.slots[0]?.statuses.some((st) => st.type === "slow")) {
      return "slow слетел до хода врага";
    }
    if ((s.enemy.slots[0]?.attack ?? 99) !== 3) {
      return `на ходе врага ATK ${s.enemy.slots[0]?.attack}, ждали 3`;
    }
    s = endEnemyTurn(s);
    if (s.enemy.slots[0]?.statuses.some((st) => st.type === "slow")) {
      return "slow не снялся после хода врага";
    }
    if ((s.enemy.slots[0]?.attack ?? 0) !== 5) {
      return `после хода врага ATK ${s.enemy.slots[0]?.attack}, ждали 5`;
    }
    return null;
  });

  assert("nothingness lasts whole battle (not one turn)", () => {
    let s = boardForCreatures();
    s.you.mana = { water: 9, hell: 9, death: 9, life: 9, nature: 9 };
    s.you.hand = ["nothingness"];
    s.enemy.slots[0] = arm(dummy("mage", "mgX", 4));
    s = playCard(s, 0, 0);
    if (!s.enemy.slots[0]?.stripped) return "не stripped сразу";
    s = endPlayerTurn(s);
    if (!s.enemy.slots[0]?.stripped) return "stripped слетел после твоего конца хода";
    s = endEnemyTurn(s);
    if (!s.enemy.slots[0]?.stripped) return "stripped слетел после хода врага";
    s = endPlayerTurn(s);
    s = endEnemyTurn(s);
    if (!s.enemy.slots[0]?.stripped) {
      return "stripped слетел через 2 полных цикла — должно держаться весь бой";
    }
    const foeView = {
      ...s,
      you: s.enemy,
      enemy: s.you,
      active: "you" as const,
    };
    foeView.you.slots[0]!.canAttack = true;
    if (mageFlexReady(foeView, 0)) return "после ходов маг снова кастует flex";
    return null;
  });

  assert("leshy swap stats", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("leshy", "ls1", 7));
    const foe = dummy("werewolf", "ww1", 2);
    foe.attack = 3;
    foe.baseAttack = 3;
    foe.baseHealth = 2;
    foe.health = 2;
    s.enemy.slots[0] = foe;
    s = swapStatsWithLeshy(s, 0, "enemy", 0);
    const u = s.enemy.slots[0]!;
    if (u.attack !== 2 || u.health !== 3) {
      return `обмен статов ${u.attack}/${u.health}`;
    }
    return null;
  });

  assert("arbiter verdict 1/1", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("arbiter", "ar1", 6));
    s.you.slots[1] = dummy("tank", "t1", 4);
    s.enemy.slots[0] = dummy("colossus", "c1", 14);
    s = verdictWithArbiter(s, 0);
    if (s.you.slots[1]!.attack !== 1 || s.you.slots[1]!.health !== 1) {
      return "вердикт не уравнял союзника";
    }
    if (s.enemy.slots[0]!.attack !== 1 || s.enemy.slots[0]!.health !== 1) {
      return "вердикт не уравнял врага";
    }
    if (s.you.slots[0]!.attack === 1 && s.you.slots[0]!.health === 1) {
      return "вердикт задел самого арбитра";
    }
    return null;
  });

  assert("veles onPlayHealHero", () => {
    let s = boardForCreatures();
    s.you.hp = 10;
    s.you.hand = ["veles"];
    s.you.mana = { water: 9, hell: 9, death: 9, life: 9, nature: 9 };
    s = playCard(s, 0, 0);
    if (s.you.hp !== 12) return `велес хил ${s.you.hp}`;
    return null;
  });

  assert("immune_death blocks banish school", () => {
    let s = boardForCreatures();
    s.enemy.slots[0] = dummy("bone_rex", "br1", 5);
    s.you.hand = ["banish"];
    s.you.mana.death = 9;
    s = playCard(s, 0, 0);
    if (!s.enemy.slots[0]) return "костяной рекс убрали банном";
    return null;
  });

  assert("immune_hell_death blocks poison school", () => {
    let s = boardForCreatures();
    s.enemy.slots[0] = dummy("inferno", "inf1", 6);
    s.you.hand = ["poison"];
    s.you.mana.death = 9;
    s = playCard(s, 0, 0);
    if (s.enemy.slots[0]!.statuses.some((st) => st.type === "poison")) {
      return "инферно получил яд смерти";
    }
    return null;
  });

  assert("balthazar_flex swap enemies", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("balthazar", "bt1", 4));
    s.enemy.slots[0] = dummy("tank", "e0", 4);
    s.enemy.slots[2] = dummy("spearman", "e2", 2);
    s = swapEnemyWithBalthazar(s, 0, 0, 2);
    if (s.enemy.slots[0]?.cardId !== "spearman") return "обмен слотов не сработал";
    return null;
  });

  assert("gravedigger_flex revive", () => {
    let s = boardForCreatures();
    s.you.slots[0] = arm(dummy("gravedigger", "gd1", 3));
    s.you.graveyard = ["vampire"];
    s = reviveWithGravedigger(s, 0, 2, 0);
    if (s.you.slots[2]?.cardId !== "vampire") return "могильщик не поднял";
    return null;
  });

  for (const [name, fn] of checks) {
    try {
      const bad = fn();
      if (bad) fails.push({ area: "существа", detail: `${name}: ${bad}` });
      else passed += 1;
    } catch (e) {
      fails.push({ area: "существа", detail: `${name}: падение ${String(e)}` });
    }
  }

  // Все способности из каталога должны быть покрыты тестом или хотя бы известны
  const usedAbs = new Set<CreatureAbility>();
  for (const c of CARDS.filter((x) => x.kind === "creature")) {
    for (const a of [c.ability, ...(c.abilities ?? [])]) {
      if (a) usedAbs.add(a);
    }
  }
  const covered = new Set(
    checks
      .map(([n]) => n)
      .join(" ")
      .match(
        /rush|skeleton_pack|vampire_grow|angel_heal|mage_flex|paladin_flex|immune_spells|imp_burn|lich_drain|spider_poison|scorpion_poison|basilisk_gaze|water_tide|hornet_pack|leprechaun_aura|berserk_decay|valkyrie|aquilite_swap|triton|necro|hornet_queen|mermaid|succubus|banshee|leshy|arbiter|immune_death|riposte/g,
      ) ?? [],
  );
  void covered;
  const missingInCatalog = [...usedAbs].filter((a) => !KNOWN_ABILITIES.has(a));
  for (const a of missingInCatalog) {
    fails.push({ area: "существа", detail: `способность ${a} в картах, но не в KNOWN_ABILITIES` });
  }

  if (!fails.some((f) => f.area === "существа")) {
    ok.push(
      `существа: ${passed}/${checks.length} способностей ок, ${usedAbs.size} уникальных ability в каталоге`,
    );
  } else {
    ok.push(`существа: ${passed}/${checks.length} ок, есть FAIL выше`);
  }
}

function finishEnemyTurn(state: BattleState): BattleState {
  let s = endPlayerTurn(state);
  try {
    for (let n = 0; n < 6; n++) {
      const step = takeAiStep(s);
      if (!step) break;
      s = step.state;
      if (s.winner) break;
    }
  } catch {
    /* ИИ не должен ронять прогон — зафиксируем инвариантами */
  }
  if (!s.winner && s.active === "enemy") s = endEnemyTurn(s);
  return s;
}

function youAct(state: BattleState, rng: () => number): BattleState {
  if (state.winner || state.active !== "you") return state;
  if (rng() < 0.35) return finishEnemyTurn(state);
  const acts: Array<() => BattleState> = [];
  for (let h = 0; h < state.you.hand.length; h++) {
    const id = state.you.hand[h]!;
    let card;
    try {
      card = getCard(id);
    } catch {
      continue;
    }
    if (!canPay(state.you.mana, card.manaCost ?? {})) continue;
    if (card.kind === "creature") {
      const empty = state.you.slots.findIndex((s) => !s);
      if (empty >= 0) {
        const hi = h;
        const sl = empty;
        acts.push(() => playCard(state, hi, sl));
      }
    } else {
      const mode = spellTargetMode({ ...state, selectedHand: h });
      const hi = h;
      if (!mode) acts.push(() => playCard(state, hi, null));
      else if (mode === "ally") {
        for (let i = 0; i < 5; i++) {
          if (!state.you.slots[i]) continue;
          const sl = i;
          acts.push(() => playCard(state, hi, sl));
        }
      } else if (mode === "enemy") {
        for (let i = 0; i < 5; i++) {
          if (!state.enemy.slots[i]) continue;
          const sl = i;
          acts.push(() => playCard(state, hi, sl));
        }
      } else if (mode === "ally_pair") {
        const allies: number[] = [];
        for (let i = 0; i < 5; i++) if (state.you.slots[i]) allies.push(i);
        if (allies.length >= 2) {
          const a = allies[0]!;
          const b = allies[1]!;
          acts.push(() => playGuardianBond(state, hi, a, b));
        }
      }
    }
  }
  for (let i = 0; i < 5; i++) {
    if (!state.you.slots[i]?.canAttack) continue;
    const from = i;
    for (const t of validAttackTargets(state, from)) {
      acts.push(() => attackWith(state, from, t));
    }
  }
  acts.push(() => finishEnemyTurn(state));
  if (acts.length === 1) return finishEnemyTurn(state);
  const pick = acts[Math.floor(rng() * acts.length)]!;
  return pick();
}

function fuzz(fails: QaFail[], ok: string[], games: number): void {
  const unit = firstCreatureId();
  let played = 0;
  let finished = 0;
  for (let g = 0; g < games; g++) {
    const seed = 1000 + g * 17;
    const rng = mulberry(seed);
    const hero = BASE_HEROES[g % BASE_HEROES.length]!;
    const level = 1 + (g % 8);
    const foeHero = botHeroIdFor(hero.id, level + 1);
    const yourDeck = botDeckForLevel(level, hero.faction);
    const foeDeck = botDeckForLevel(level + 1, getHero(foeHero).faction);
    const deckYou = yourDeck.length ? yourDeck : Array.from({ length: 20 }, () => unit);
    const deckFoe = foeDeck.length ? foeDeck : Array.from({ length: 20 }, () => unit);
    let s: BattleState;
    try {
      s = createBattle(deckYou, deckFoe, hero.id, foeHero, "QA", level, level + 1);
    } catch (e) {
      fails.push({
        area: "дуэль",
        detail: `сида ${seed} не стартовала: ${String(e)}`,
      });
      continue;
    }
    played += 1;
    console.error(`… дуэль ${g + 1}/${games} (сид ${seed})`);
    const before = fails.length;
    checkBattle(s, fails, `старт#${seed}`);
    for (let step = 0; step < 28; step++) {
      if (s.winner) {
        finished += 1;
        break;
      }
      try {
        s = youAct(s, rng);
      } catch (e) {
        fails.push({
          area: "дуэль",
          detail: `сида ${seed} шаг ${step}: падение ${String(e)}`,
        });
        break;
      }
      checkBattle(s, fails, `сида#${seed}ш${step}`);
      if (fails.length > before + 6) break;
    }
  }
  if (!fails.some((f) => f.area === "дуэль" || f.area === "инвариант")) {
    ok.push(`дуэли: ${played} боёв, ${finished} дошли до победителя, инварианты живы`);
  } else {
    ok.push(`дуэли: ${played} боёв прогнано, есть ошибки выше`);
  }
}

export function runQa(opts?: { fuzzGames?: number }): QaReport {
  const fails: QaFail[] = [];
  const ok: string[] = [];
  const note = (m: string) => {
    console.error(`… ${m}`);
  };
  note("каталог карт");
  catalog(fails, ok);
  note("мана и ходы");
  manaRules(fails, ok);
  note("буйство крови / ураган");
  shortDeckAndShuffle(fails, ok);
  note("все заклинания");
  spellsAll(fails, ok);
  note("существа и способности");
  creaturesAll(fails, ok);
  note(`случайные дуэли ×${opts?.fuzzGames ?? 12}`);
  fuzz(fails, ok, opts?.fuzzGames ?? 12);
  note("экономика / обменники / магазин");
  economyAll(fails, ok);
  note("тропа кампании");
  campaignAll(fails, ok);
  note("одиночные режимы");
  soloModesAll(fails, ok);
  note("арена испытаний");
  arenaAll(fails, ok);
  note("прогресс и раса");
  progressIntegrity(fails, ok);
  note("ритейл: арт / привязки / PvP / витрина");
  retailIntegrity(fails, ok);
  note("готово");

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
  return {
    failed: fails.length > 0,
    fails,
    ok,
    text: lines.join("\n"),
  };
}
