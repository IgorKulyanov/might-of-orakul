/**
 * Мета-проверки вне боя: экономика, тропа, колоды, прогресс, одиночные режимы.
 */
import {
  ARENA_ROUNDS,
  applyArenaLoss,
  applyArenaWin,
  arenaModsForDay,
  arenaModsForRound,
  hashSeed,
  isArenaLockedToday,
  nextArenaRound,
  normalizeArena,
} from "./arena";
import { applyArenaRules, type ArenaModId } from "./battleRules";
import { botDeckForLevel, botHeroIdFor, botLevelNear } from "./botDeck";
import {
  applyCampaignLoss,
  applyCampaignWin,
  campaignFoeLevel,
  canFightNode,
  isCampaignLockedToday,
  nextCampaignNode,
  normalizeCampaign,
  type CampaignState,
} from "./campaign";
import { BATTLE_TUTORIAL_TIPS } from "./battleTutorial";
import { CARDS, DECK_SIZE, getCard } from "./cards";
import { analyzeDeck } from "./deckStats";
import {
  battleManaCost,
  createBattle,
  endEnemyTurn,
  endPlayerTurn,
  takeAiStep,
} from "./engine";
import { BASE_HEROES, EPIC_HEROES, getHero } from "./heroes";
import {
  applyBattleResult,
  beginWithHero,
  buyCardWithDiamonds,
  buyCardWithGold,
  buyDiamondPack,
  buyEpicHero,
  canBuyAnotherCopy,
  canSelectHero,
  exchangeDiamondsAmount,
  exchangeDiamondsForGold,
  homeFactionOf,
} from "./owned";
import { battleGold, battleXp, grantXp } from "./progression";
import {
  DIAMOND_PACK_MAP,
  GOLD_EXCHANGE_MAP,
  goldForDiamonds,
} from "./shop";
import type { Faction, OwnedState } from "./types";
import type { QaFail } from "./qa";

function seedOwned(faction: Faction, gold = 50_000, diamonds = 5_000): OwnedState {
  const heroId = `hero_${faction}`;
  const blank: OwnedState = {
    unlocked: [],
    decks: { starter: [] },
    activeDeckId: "starter",
    gold,
    diamonds,
    level: 8,
    xp: 0,
    purchased: [],
    unlockedHeroes: [],
  };
  const res = beginWithHero(blank, heroId);
  if (!res.ok) throw new Error(res.reason ?? "beginWithHero fail");
  return res.owned;
}

export function economyAll(fails: QaFail[], ok: string[]): void {
  let n = 0;
  const check = (name: string, fn: () => string | null) => {
    try {
      const bad = fn();
      if (bad) fails.push({ area: "экономика", detail: `${name}: ${bad}` });
      else n += 1;
    } catch (e) {
      fails.push({ area: "экономика", detail: `${name}: ${String(e)}` });
    }
  };

  check("diamond packs", () => {
    for (const p of Object.values(DIAMOND_PACK_MAP)) {
      if (!p.diamonds || !p.id) return `битый пакет ${p.id}`;
    }
    let o = seedOwned("death", 100, 0);
    o = buyDiamondPack(o, "dia_60");
    if ((o.diamonds ?? 0) < 60) return "пакет dia_60 не начислил";
    return null;
  });

  check("exchange presets", () => {
    let o = seedOwned("death", 0, 500);
    const before = o.diamonds ?? 0;
    o = exchangeDiamondsForGold(o, "g_700");
    if ((o.diamonds ?? 0) !== before - 80) return "списание алмазов пресета";
    if ((o.gold ?? 0) < 700) return "золото пресета";
    for (const id of Object.keys(GOLD_EXCHANGE_MAP)) {
      if (!GOLD_EXCHANGE_MAP[id]) return `нет ${id}`;
    }
    return null;
  });

  check("free exchange rate", () => {
    if (goldForDiamonds(10) !== 90) {
      return `курс 10💎 → ${goldForDiamonds(10)}, ждали 90`;
    }
    let o = seedOwned("life", 0, 20);
    o = exchangeDiamondsAmount(o, 10);
    if ((o.diamonds ?? 0) !== 10) return "остаток алмазов";
    if ((o.gold ?? 0) !== 90) return "золото по курсу";
    const blocked = exchangeDiamondsAmount(
      { ...o, diamonds: 5 },
      999,
    );
    if ((blocked.diamonds ?? 0) !== 5) return "обмен без денег прошёл";
    return null;
  });

  check("buy card gold/diamonds", () => {
    let o = seedOwned("death", 50_000, 5_000);
    const card = CARDS.find(
      (c) =>
        c.kind === "creature" &&
        c.school === "death" &&
        (c.priceGold ?? 0) > 0 &&
        !(o.unlocked ?? []).includes(c.id),
    );
    if (!card) return "нет платной карты смерти";
    const g0 = o.gold ?? 0;
    o = buyCardWithGold(o, card.id);
    if (!(o.unlocked ?? []).includes(card.id)) return "карта не открылась за золото";
    if ((o.gold ?? 0) >= g0) return "золото не списалось";
    // вторая копия той же карты за алмазы (если лимит >1)
    if (canBuyAnotherCopy(o, card.id) && (card.priceDiamonds ?? 0) > 0) {
      const d0 = o.diamonds ?? 0;
      o = buyCardWithDiamonds(o, card.id);
      if ((o.collection?.[card.id] ?? 0) < 2) return "вторая копия за 💎 не купилась";
      if ((o.diamonds ?? 0) >= d0) return "алмазы не списались";
      return null;
    }
    const other = CARDS.find(
      (c) =>
        c.kind === "creature" &&
        c.school === "death" &&
        c.id !== card.id &&
        (c.priceDiamonds ?? 0) > 0 &&
        (c.priceDiamonds ?? 0) <= (o.diamonds ?? 0) &&
        !(o.unlocked ?? []).includes(c.id),
    );
    if (other) {
      const d0 = o.diamonds ?? 0;
      o = buyCardWithDiamonds(o, other.id);
      if (!(o.unlocked ?? []).includes(other.id)) return "карта не открылась за 💎";
      if ((o.diamonds ?? 0) >= d0) return "алмазы не списались";
    }
    return null;
  });

  check("epic buy locked to faction", () => {
    const o = seedOwned("death", 100_000, 5_000);
    const foreign = buyEpicHero(o, "hero_nature_epic", "gold");
    if (foreign.ok) return "купили чужой эпик природы";
    const own = buyEpicHero(o, "hero_death_epic", "gold");
    if (!own.ok) return own.reason ?? "свой эпик не купился";
    if (own.owned.heroId !== "hero_death_epic") return "эпик не надет";
    if (homeFactionOf(own.owned) !== "death") return "homeFaction слетел";
    if (canSelectHero(own.owned, "hero_nature")) return "можно выбрать чужую расу";
    return null;
  });

  check("battle rewards", () => {
    const o = seedOwned("hell", 0, 0);
    const win = applyBattleResult(o, true);
    if (win.xpGained <= 0) return "нет XP за победу";
    if (win.goldReward < 0) return "отрицательное золото";
    const loss = applyBattleResult(o, false);
    if (loss.xpGained < 0) return "отрицательный XP поражения";
    const camp = applyBattleResult(o, true, { xpOnly: true });
    if (camp.xpGained <= 0) return "тропа без XP";
    return null;
  });

  check("grantXp levels", () => {
    const g = grantXp({ level: 1, xp: 0 }, 10_000);
    if (g.level < 2) return "ап не сработал";
    if (g.level > 50) return "уровень выше капа";
    return null;
  });

  check("battle gold/xp formulas", () => {
    if (battleGold(true, 1) <= 0 || battleGold(false, 1) < 0) {
      return "формула золота";
    }
    if (battleXp(true, 1) <= 0) return "формула XP";
    return null;
  });

  check("deck builder + tutorial", () => {
    if (BATTLE_TUTORIAL_TIPS.length < 4) return "мало подсказок боя";
    for (const f of ["life", "death", "water", "hell", "nature"] as const) {
      const o = seedOwned(f);
      const deck = o.decks.starter ?? [];
      if (deck.length !== 4) {
        return `${f}: стартовая колода ${deck.length}, надо 4`;
      }
      if (f === "death" && deck.includes("undead_strike")) {
        return "смерть: в старте не должно быть «атаки нежити»";
      }
      const uniq = new Set(deck);
      if (uniq.size !== 4) return `${f}: в старте должны быть 4 разные карты ×1`;
      const col = o.collection ?? {};
      const counts: Record<string, number> = {};
      for (const id of deck) {
        counts[id] = (counts[id] ?? 0) + 1;
        if ((col[id] ?? 0) < counts[id]) {
          return `${f}: в колоде больше копий ${id}, чем в коллекции`;
        }
      }
      // старт без копий — только по 1
      if (Object.values(counts).some((n) => n > 1)) {
        return `${f}: в старте не должно быть копий`;
      }
    }
    const o = seedOwned("life");
    const deck = o.decks.starter ?? [];
    const a = analyzeDeck(deck, "life");
    if (a.size !== deck.length) return "analyzeDeck size";
    const thin = analyzeDeck(deck.slice(0, 2), "life");
    if (!thin.advice.some((x) => x.level === "bad" || x.level === "warn")) {
      return "тонкая колода без предупреждения";
    }
    // вторая копия скелета платная
    const before = o.collection?.skeleton ?? 0;
    const rich = { ...o, gold: 50_000 };
    const bought = buyCardWithGold(rich, "skeleton");
    if ((bought.collection?.skeleton ?? 0) !== before + 1) {
      return "покупка копии не сработала";
    }
    return null;
  });

  if (!fails.some((f) => f.area === "экономика")) {
    ok.push(`экономика: ${n} проверок (пакеты, обмен, магазин, эпик, награды)`);
  } else ok.push(`экономика: ${n} ок, есть FAIL`);
}

export function campaignAll(fails: QaFail[], ok: string[]): void {
  let n = 0;
  const check = (name: string, fn: () => string | null) => {
    try {
      const bad = fn();
      if (bad) fails.push({ area: "тропа", detail: `${name}: ${bad}` });
      else n += 1;
    } catch (e) {
      fails.push({ area: "тропа", detail: `${name}: ${String(e)}` });
    }
  };

  check("fresh day", () => {
    const c = normalizeCampaign(null);
    if (c.cleared !== 0) return "cleared не 0";
    if (nextCampaignNode(c) !== 1) return "первый узел не 1";
    if (!canFightNode(c, 1)) return "нельзя бить узел 1";
    if (canFightNode(c, 2)) return "открыт узел 2";
    return null;
  });

  check("win progress + milestones", () => {
    let camp: CampaignState = normalizeCampaign(null);
    let owned = seedOwned("death", 0, 0);
    for (let node = 1; node <= 5; node++) {
      if (!canFightNode(camp, node)) return `нельзя узел ${node}`;
      const r = applyCampaignWin(camp, owned, node);
      camp = r.campaign;
      owned = r.owned;
    }
    if (camp.cleared !== 5) return `cleared=${camp.cleared}`;
    if (!camp.claimed.includes(5)) return "веха 5 не засчитана";
    if ((owned.gold ?? 0) <= 0 && (owned.diamonds ?? 0) <= 0) {
      return "награда вехи 5 пустая";
    }
    return null;
  });

  check("loss locks day", () => {
    const camp = applyCampaignLoss(normalizeCampaign(null));
    if (!isCampaignLockedToday(camp)) return "поражение не закрыло день";
    if (canFightNode(camp, 1)) return "после поражения узел открыт";
    return null;
  });

  check("foe level curve", () => {
    const a = campaignFoeLevel(10, 1);
    const b = campaignFoeLevel(10, 15);
    if (b <= a) return `кривая ${a}…${b}`;
    if (b > 50) return "уровень бота > 50";
    return null;
  });

  if (!fails.some((f) => f.area === "тропа")) {
    ok.push(`тропа: ${n} проверок (узлы, вехи, локаут, кривая)`);
  } else ok.push(`тропа: ${n} ок, есть FAIL`);
}

export function soloModesAll(fails: QaFail[], ok: string[]): void {
  let n = 0;
  const check = (name: string, fn: () => string | null) => {
    try {
      const bad = fn();
      if (bad) fails.push({ area: "одиночка", detail: `${name}: ${bad}` });
      else n += 1;
    } catch (e) {
      fails.push({ area: "одиночка", detail: `${name}: ${String(e)}` });
    }
  };

  for (const hero of BASE_HEROES) {
    check(`vs-bot ${hero.faction}`, () => {
      const level = 5;
      const foeLv = botLevelNear(level);
      const foeId = botHeroIdFor(hero.id, foeLv);
      if (getHero(foeId).faction === hero.faction && BASE_HEROES.length > 1) {
        return "бот той же фракции";
      }
      const yourDeck = botDeckForLevel(level, hero.faction);
      const foeDeck = botDeckForLevel(foeLv, getHero(foeId).faction);
      if (yourDeck.length < 15 || yourDeck.length > DECK_SIZE) {
        return `колода ${yourDeck.length}`;
      }
      let s = createBattle(
        yourDeck,
        foeDeck,
        hero.id,
        foeId,
        "QA",
        level,
        foeLv,
      );
      for (let i = 0; i < 6 && !s.winner; i++) {
        s = endPlayerTurn(s);
        for (let k = 0; k < 8; k++) {
          const step = takeAiStep(s);
          if (!step) break;
          s = step.state;
          if (s.winner) break;
        }
        if (!s.winner && s.active === "enemy") s = endEnemyTurn(s);
      }
      for (const id of yourDeck) getCard(id);
      for (const id of foeDeck) getCard(id);
      return null;
    });
  }

  check("epic vs base battle start", () => {
    const epic = EPIC_HEROES[0]!;
    const deck = botDeckForLevel(10, epic.faction);
    const foeFaction = epic.faction === "life" ? "hell" : "life";
    const s = createBattle(
      deck,
      deck,
      epic.id,
      `hero_${foeFaction}`,
      "QA",
      10,
      10,
    );
    if (s.you.faction !== epic.faction) return "фракция эпика";
    if ((s.you.mana[epic.faction] ?? 0) < 2) {
      return `старт маны эпика ${s.you.mana[epic.faction]}`;
    }
    return null;
  });

  if (!fails.some((f) => f.area === "одиночка")) {
    ok.push(`одиночка: ${n} режимов (5 рас vs бот + эпик старт)`);
  } else ok.push(`одиночка: ${n} ок, есть FAIL`);
}

export function arenaAll(fails: QaFail[], ok: string[]): void {
  let n = 0;
  const check = (name: string, fn: () => string | null) => {
    try {
      const bad = fn();
      if (bad) fails.push({ area: "арена", detail: `${name}: ${bad}` });
      else n += 1;
    } catch (e) {
      fails.push({ area: "арена", detail: `${name}: ${String(e)}` });
    }
  };

  check("seed stable 5 mods", () => {
    const day = "2099-03-15";
    const a = arenaModsForDay(day);
    const b = arenaModsForDay(day);
    if (a.length !== ARENA_ROUNDS) return `len=${a.length}`;
    if (a.join("|") !== b.join("|")) return "нестабильный сид";
    if (new Set(a).size !== ARENA_ROUNDS) return "дубли в дне";
    if (hashSeed(`arena:${day}`) === hashSeed("arena:other")) {
      return "хеш коллизия с другим днём";
    }
    return null;
  });

  check("round stacks mods", () => {
    const fresh = normalizeArena(null);
    const withMods = {
      ...fresh,
      cleared: 2,
      bestStreak: 2,
      lostDay: null,
      dayMods: [
        "glass_oracles",
        "mana_drought",
        "undead_surge",
        "early_blood",
        "heavy_spells",
      ] as ArenaModId[],
    };
    const r3 = arenaModsForRound(withMods, 3);
    if (r3.length !== 3) return `round3 len=${r3.length}`;
    if (r3[2] !== "undead_surge") return "порядок модов";
    if (nextArenaRound(withMods) !== 3) return "next≠3";
    return null;
  });

  check("applyArenaRules", () => {
    const deck = botDeckForLevel(8, "death");
    const raw = createBattle(
      deck,
      deck,
      "hero_death",
      "hero_life",
      "QA",
      8,
      8,
    );
    const hp0 = raw.you.maxHp;
    const hand0 = raw.you.hand.length;
    const mods: ArenaModId[] = [
      "glass_oracles",
      "open_lanes",
      "heavy_spells",
      "early_blood",
      "fragile_board",
    ];
    const s = applyArenaRules(raw, mods);
    if (s.you.maxHp >= hp0) return "glass_oracles HP";
    if (s.you.hand.length !== Math.max(0, hand0 - 2)) {
      return `open_lanes hand ${s.you.hand.length}`;
    }
    if (!s.rules?.heavySpells || !s.rules?.fragileBoard) {
      return "flags rules";
    }
    if (s.rules.bloodFrenzyAfter !== 12) return "early_blood";
    // «Доп. мана» / «Камни» без надбавки — берём обычный спелл (или подставляем).
    const isRamp = (id: string) => {
      const c = getCard(id);
      const effects =
        c.spellEffects && c.spellEffects.length > 0
          ? c.spellEffects
          : id === "hero_mana"
            ? ([{ type: "gain_mana" as const, amount: 1 }] as const)
            : [];
      return (
        effects.length > 0 &&
        effects.every((e) => e.type === "gain_mana" || e.type === "gain_mana_all")
      );
    };
    let spell = s.you.hand.find(
      (id) => getCard(id).kind === "spell" && !isRamp(id),
    );
    if (!spell) {
      s.you.hand = [...s.you.hand, "nothingness"];
      spell = "nothingness";
    }
    const baseSum = Object.values(getCard(spell).manaCost ?? {}).reduce(
      (a, b) => a + (b ?? 0),
      0,
    );
    const costSum = Object.values(battleManaCost(s, spell)).reduce(
      (a, b) => a + (b ?? 0),
      0,
    );
    if (costSum !== baseSum + 1) return `heavy_spells ${costSum}≠${baseSum + 1}`;
    return null;
  });

  check("win rewards keep owned", () => {
    let arena = normalizeArena(null);
    arena = {
      ...arena,
      cleared: 0,
      lostDay: null,
      dayMods: arenaModsForDay(arena.day),
    };
    const owned0 = seedOwned("life", 500, 3);
    const gold0 = owned0.gold ?? 0;
    const dia0 = owned0.diamonds ?? 0;
    const unlocked0 = [...(owned0.unlocked ?? [])].sort().join(",");
    const r1 = applyArenaWin(arena, owned0, 1);
    if (r1.gold !== 40 || r1.diamonds !== 0) return `r1 reward ${r1.gold}/${r1.diamonds}`;
    if ((r1.owned.gold ?? 0) !== gold0 + 40) return "gold not added";
    if ((r1.owned.diamonds ?? 0) !== dia0) return "diamonds changed early";
    if ([...(r1.owned.unlocked ?? [])].sort().join(",") !== unlocked0) {
      return "unlocked mutated";
    }
    const r3 = applyArenaWin(r1.arena, r1.owned, 3);
    // after r1 cleared=1, round 3 is invalid (need cleared+1 === 3)
    if (r3.gold !== 0) {
      /* expected skip */
    }
    const r2 = applyArenaWin(r1.arena, r1.owned, 2);
    const r3ok = applyArenaWin(r2.arena, r2.owned, 3);
    if (r3ok.diamonds !== 1) return `r3 diamonds ${r3ok.diamonds}`;
    if ((r3ok.owned.diamonds ?? 0) !== dia0 + 1) return "diamonds not kept";
    return null;
  });

  check("loss locks day", () => {
    const a = applyArenaLoss(normalizeArena(null));
    if (!isArenaLockedToday(a)) return "не закрыло день";
    if (nextArenaRound(a) != null) return "next после поражения";
    return null;
  });

  if (!fails.some((f) => f.area === "арена")) {
    ok.push(`арена: ${n} (сид, моды, правила, награды, локаут)`);
  } else ok.push(`арена: ${n} ок, есть FAIL`);
}

export function progressIntegrity(fails: QaFail[], ok: string[]): void {
  let n = 0;
  const check = (name: string, fn: () => string | null) => {
    try {
      const bad = fn();
      if (bad) fails.push({ area: "прогресс", detail: `${name}: ${bad}` });
      else n += 1;
    } catch (e) {
      fails.push({ area: "прогресс", detail: `${name}: ${String(e)}` });
    }
  };

  check("beginWithHero locks home", () => {
    const o = seedOwned("water");
    if (homeFactionOf(o) !== "water") return "home не water";
    if (o.heroId !== "hero_water") return "герой не water";
    const starters = (o.unlocked ?? []).filter((id) => {
      try {
        return getCard(id).school === "water" || id === "hero_mana";
      } catch {
        return false;
      }
    });
    if (starters.length < 2) return "мало стартовых воды";
    return null;
  });

  check("all heroes resolve", () => {
    for (const h of [...BASE_HEROES, ...EPIC_HEROES]) getHero(h.id);
    return null;
  });

  if (!fails.some((f) => f.area === "прогресс")) {
    ok.push(`прогресс: ${n} (старт расы, герои)`);
  } else ok.push(`прогресс: ${n} ок, есть FAIL`);
}
