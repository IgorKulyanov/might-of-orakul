import { useEffect, useRef, useState } from "react";
import { alog } from "./game/actionLog";
import { ArenaHub } from "./components/ArenaHub";
import { AuthScreen } from "./components/AuthScreen";
import { Battle } from "./components/Battle";
import { Cabinet } from "./components/Cabinet";
import { CampaignMap } from "./components/CampaignMap";
import { Collection } from "./components/Collection";
import { DailyPanel } from "./components/DailyPanel";
import {
  trackCampaignClearedForDailies,
} from "./game/dailies";
import {
  syncLifetimeFromOwned,
  trackLifetimeTrailCleared,
} from "./game/lifetimeQuests";
import { DevSandbox } from "./components/DevSandbox";
import { HeroSelect } from "./components/HeroSelect";
import { MultiMenu } from "./components/MultiMenu";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { NameOnboarding } from "./components/NameOnboarding";
import { PrologueScreen } from "./components/PrologueScreen";
import { SchoolTrailsScreen } from "./components/SchoolTrailsScreen";
import { HubTutorial } from "./components/HubTutorial";
import { SplashMenu } from "./components/SplashMenu";
import { hasSeenPrologue, markPrologueSeen } from "./game/prologue";
import {
  hasSeenHubTutorial,
  HUB_TUTORIAL_TIPS,
  type HubTutorialScreen,
} from "./game/hubTutorial";
import {
  isDevToolsEnabled,
  resolveDevBattle,
  setDevToolsEnabled,
  type DevBattleSetup,
} from "./game/devMode";
import {
  ARENA_ROUNDS,
  applyArenaLoss,
  applyArenaWin,
  arenaFoeLevel,
  arenaModsForRound,
  loadArena,
  refreshArenaDay,
  resetArenaProgress,
  resetArenaRun,
  type ArenaState,
} from "./game/arena";
import {
  canEnterPvp,
  clearPvpFleeLocal,
  exportPvpFleeForSync,
  recordPvpFlee,
  syncPvpFleeFromServer,
} from "./game/pvpFleeBan";
import { applyArenaRules } from "./game/battleRules";
import {
  applyCampaignLoss,
  applyCampaignWin,
  campaignFoeLevel,
  refreshCampaignDay,
  loadCampaign,
  resetCampaignProgress,
  type CampaignState,
} from "./game/campaign";
import {
  applySchoolTrailWin,
  claimSchoolTrailGrandReward,
  prepareSchoolTrailBattle,
  resetSchoolTrailProgress,
  rewardGiftLine,
  schoolTrailBattleDeck,
  schoolTrailDraft,
  schoolTrailEnemyHeroId,
  schoolTrailEnemyUpgrades,
  clearTrailIntroSeen,
  markTrailIntroSeen,
  schoolTrailStep,
  shouldShowTrailIntro,
  trailVictoryLead,
  trailVictoryTitle,
  type SchoolTrailBeat,
} from "./game/schoolTrails";
import { TrailIntroScreen } from "./components/TrailIntroScreen";
import {
  apiMe,
  apiPaymentOrder,
  apiPresence,
  apiTelegramAuth,
  apiUpdateMe,
  type ApiUser,
} from "./game/api";
import {
  botLevelNear,
  freshBotSeed,
  rollBotOpponent,
} from "./game/botDeck";
import { getHero } from "./game/heroes";
import {
  battleDeck,
  activeHeroId,
  applyBattleResult,
  backupOwnedForLogin,
  claimDailyQuest,
  claimLifetimeQuestReward,
  clearActiveOwned,
  clearOwnedBackup,
  hasOwnedProgress,
  hasSchoolTrailProgress,
  loadOwned,
  loadOwnedBackup,
  playerLevel,
  saveOwned,
  setHero,
  stripAccidentalHomeFaction,
} from "./game/owned";
import { catchUpShopTierShardsIfNeeded } from "./game/cardUpgrades";
import { applySkillStateToOwned } from "./game/oracleSkills";
import {
  clearSession,
  getCachedUser,
  getLastLogin,
  getToken,
  setSession,
  updateCachedUser,
} from "./game/session";
import { PvpSocket } from "./game/pvpClient";
import {
  PVP_MAX_TIMEOUTS,
  PVP_TURN_SEC,
  type PvpSeat,
  type PvpServerMsg,
  type SeatOpeningDice,
} from "./game/pvpProtocol";
import { startBattleMusic, startMenuMusic, unlockSfx } from "./game/sfx";
import { detectTelegramUser } from "./game/telegram";
import type { BattleState, Faction, OwnedState } from "./game/types";
import "./App.css";

type PvpClock = {
  turnEndsAt: number | null;
  yourTimeouts: number;
  foeTimeouts: number;
  maxTimeouts: number;
  turnLimitSec: number;
  endMessage: string | null;
  openingDice: SeatOpeningDice | null;
  openingLocked: boolean;
  needRoll: boolean;
  youRolled: boolean;
  foeRolled: boolean;
};

type Screen =
  | "menu"
  | "campaign"
  | "arena"
  | "battle"
  | "battle_bot"
  | "battle_campaign"
  | "battle_arena"
  | "battle_school_trail"
  | "battle_pvp"
  | "battle_dev"
  | "dev"
  | "collection"
  | "hero"
  | "cabinet"
  | "multi"
  | "dailies"
  | "school_trails"
  | "school_pick"
  | "trail_intro"
  | "prologue";

function richerDecks(
  a: OwnedState["decks"] | undefined,
  b: OwnedState["decks"] | undefined,
): OwnedState["decks"] {
  const ids = new Set([
    ...Object.keys(a ?? {}),
    ...Object.keys(b ?? {}),
    "starter",
  ]);
  const out: OwnedState["decks"] = {};
  for (const id of ids) {
    const left = a?.[id] ?? [];
    const right = b?.[id] ?? [];
    out[id] = left.length >= right.length ? left : right;
  }
  return out;
}

/** Нужен только ник. Школа — позже через «Путь оракула», не стена на входе. */
function accountNeedsOnboarding(user: ApiUser): boolean {
  if (user.displayName && user.displayName.trim().length >= 2) return false;
  if (user.needsOnboarding && !user.displayName) return true;
  if (!user.displayName) return true;
  return false;
}

/**
 * Чистый лист для онбординга: без homeFaction, нейтральная колода (тропы вкуса).
 * Раньше setHero(hero_life) сам ставил школу «жизнь» → экран выбора скипался.
 */
function blankOnboardingOwned(): OwnedState {
  // clearActiveOwned → freshOwned уже даёт нейтралов без homeFaction.
  const next = clearActiveOwned();
  saveOwned(next);
  return next;
}

function wipeSeenKey(login: string): string {
  return `orakul-wipe-seen:${login.trim().toLowerCase()}`;
}

function readWipeSeen(login: string): number {
  try {
    return Math.max(0, Math.floor(Number(localStorage.getItem(wipeSeenKey(login))) || 0));
  } catch {
    return 0;
  }
}

function writeWipeSeen(login: string, id: number): void {
  try {
    localStorage.setItem(wipeSeenKey(login), String(Math.max(0, id)));
  } catch {
    /* ignore */
  }
}

/** Админский wipe: не поднимать старый локальный ур./кейсы поверх сервера. */
function forceBlankFromServerWipe(user: ApiUser): OwnedState {
  if (user.login) clearOwnedBackup(user.login);
  const blank = blankOnboardingOwned();
  saveOwned(blank);
  if (user.login && user.ownedWipeId) writeWipeSeen(user.login, user.ownedWipeId);
  return blank;
}

/** Слить осколки: по каждой карте берём большее (ПК/телефон не затирают друг друга). */
function mergeShardMaps(
  a?: Record<string, number> | null,
  b?: Record<string, number> | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const src of [a, b]) {
    if (!src || typeof src !== "object") continue;
    for (const [k, v] of Object.entries(src)) {
      const n = Math.max(0, Math.floor(Number(v) || 0));
      if (n <= 0) continue;
      out[k] = Math.max(out[k] ?? 0, n);
    }
  }
  return out;
}

function mergeUpgradeMaps(
  a?: Record<string, number> | null,
  b?: Record<string, number> | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const src of [a, b]) {
    if (!src || typeof src !== "object") continue;
    for (const [k, v] of Object.entries(src)) {
      const n = Math.min(3, Math.max(1, Math.floor(Number(v) || 0)));
      if (!Number.isFinite(n)) continue;
      out[k] = Math.max(out[k] ?? 1, n);
    }
  }
  return out;
}

/** Тропы: берём max по школе — иначе старый локальный 0/2 затирает серверные 5. */
function mergeTrailClearedMaps(
  ...maps: Array<Partial<Record<Faction, number>> | null | undefined>
): Partial<Record<Faction, number>> {
  const out: Partial<Record<Faction, number>> = {};
  for (const src of maps) {
    if (!src || typeof src !== "object") continue;
    for (const [k, v] of Object.entries(src)) {
      const n = Math.max(0, Math.min(5, Math.floor(Number(v) || 0)));
      if (!n) continue;
      const f = k as Faction;
      out[f] = Math.max(out[f] ?? 0, n);
    }
  }
  return out;
}

function mergeTrailDraftMaps(
  ...maps: Array<Partial<Record<Faction, string[]>> | null | undefined>
): Partial<Record<Faction, string[]>> {
  const out: Partial<Record<Faction, string[]>> = {};
  const keys = new Set<string>();
  for (const src of maps) {
    if (!src || typeof src !== "object") continue;
    for (const k of Object.keys(src)) keys.add(k);
  }
  for (const k of keys) {
    const f = k as Faction;
    const ids: string[] = [];
    for (const src of maps) {
      if (!src || typeof src !== "object") continue;
      for (const id of src[f] ?? []) ids.push(String(id));
    }
    out[f] = [...new Set(ids)];
  }
  return out;
}

/** Не выводить школу из дефолтного hero_life. */
function explicitHomeFaction(
  owned: OwnedState | null | undefined,
  heroId: string | null | undefined,
): Faction | undefined {
  if (owned?.homeFaction) return owned.homeFaction;
  if (heroId && heroId !== "hero_life") return getHeroSafeFaction(heroId);
  return undefined;
}

function mergeOwnedFromServer(user: ApiUser): OwnedState {
  const wipeId = Math.max(0, Math.floor(Number(user.ownedWipeId) || 0));
  const wipeSeen = user.login ? readWipeSeen(user.login) : 0;
  const serverHasProgress =
    Boolean(user.owned?.homeFaction) ||
    hasOwnedProgress(user.owned as OwnedState);
  // Любой wipe: чистый лист. Даже если сервер уже снова «толстый»
  // (старый клиент успел залить сейв) — новый wipeId важнее локали/бэкапа.
  if (
    user.pendingWipeOwned ||
    (wipeId > 0 && wipeId > wipeSeen) ||
    (wipeId > 0 && !serverHasProgress)
  ) {
    return forceBlankFromServerWipe(user);
  }
  // Wipe уже применён на сервере, тут ещё старый сейв — выкинуть локальное.
  const dropStaleLocal = Boolean(user.login) && wipeId > 0 && wipeId > wipeSeen;
  if (dropStaleLocal && user.login) {
    clearOwnedBackup(user.login);
    clearActiveOwned();
    writeWipeSeen(user.login, wipeId);
  } else if (user.login && wipeId > wipeSeen) {
    writeWipeSeen(user.login, wipeId);
  }

  const backup = dropStaleLocal
    ? null
    : user.login
      ? loadOwnedBackup(user.login)
      : null;
  const localRaw = dropStaleLocal ? blankOnboardingOwned() : loadOwned();

  // Новый/пустой аккаунт: не тянуть чужой локальный сейв с этого ПК
  // и не угадывать школу по hero_life по умолчанию.
  if (accountNeedsOnboarding(user)) {
    // Только ЯВНЫЙ homeFaction — иначе fallthrough выводил «life» из hero_life
    // и кидал искателя с троп в основное меню.
    if (user.owned?.homeFaction) {
      /* fall through to normal merge */
    } else if (
      hasSchoolTrailProgress(user.owned as OwnedState) ||
      hasSchoolTrailProgress(localRaw) ||
      hasSchoolTrailProgress(backup)
    ) {
      const trailBase = !localRaw.homeFaction
        ? localRaw
        : backup && !backup.homeFaction
          ? backup
          : blankOnboardingOwned();
      const next = stripAccidentalHomeFaction({
        ...trailBase,
        homeFaction: undefined,
        heroId: "hero_life",
        schoolTrailCleared: mergeTrailClearedMaps(
          trailBase.schoolTrailCleared,
          user.owned?.schoolTrailCleared,
          backup?.schoolTrailCleared,
          localRaw.schoolTrailCleared,
        ),
        schoolTrailWins: Math.max(
          Math.floor(Number(trailBase.schoolTrailWins) || 0),
          Math.floor(Number(user.owned?.schoolTrailWins) || 0),
          Math.floor(Number(backup?.schoolTrailWins) || 0),
          Math.floor(Number(localRaw.schoolTrailWins) || 0),
        ),
        schoolTrailDrafts: mergeTrailDraftMaps(
          trailBase.schoolTrailDrafts,
          user.owned?.schoolTrailDrafts,
          backup?.schoolTrailDrafts,
          localRaw.schoolTrailDrafts,
        ),
        schoolTrailGrandRewardClaimed: Boolean(
          trailBase.schoolTrailGrandRewardClaimed ||
            user.owned?.schoolTrailGrandRewardClaimed ||
            backup?.schoolTrailGrandRewardClaimed ||
            localRaw.schoolTrailGrandRewardClaimed,
        ),
      });
      saveOwned(next);
      if (user.login) backupOwnedForLogin(user.login, next);
      return next;
    } else if (
      // Только если аккаунт НИКОГДА не вайпили — иначе wipe снова «оживёт».
      wipeId <= 0 &&
      backup?.homeFaction &&
      hasOwnedProgress(backup)
    ) {
      const restored = stripAccidentalHomeFaction({ ...backup });
      saveOwned(restored);
      return restored;
    } else if (
      wipeId <= 0 &&
      localRaw.homeFaction &&
      hasOwnedProgress(localRaw)
    ) {
      const restored = stripAccidentalHomeFaction(localRaw);
      saveOwned(restored);
      return restored;
    } else {
      return blankOnboardingOwned();
    }
  }

  // Бэкап по логину важнее «пустого» текущего сейва после сброса сервера
  const local =
    backup && hasOwnedProgress(backup) && !hasOwnedProgress(localRaw)
      ? backup
      : backup && hasOwnedProgress(backup)
        ? {
            ...localRaw,
            gold: Math.max(Number(localRaw.gold) || 0, Number(backup.gold) || 0),
            diamonds: Math.max(
              Number(localRaw.diamonds) || 0,
              Number(backup.diamonds) || 0,
            ),
            level: Math.max(Number(localRaw.level) || 1, Number(backup.level) || 1),
            collection: {
              ...(backup.collection ?? {}),
              ...(localRaw.collection ?? {}),
            },
            decks: richerDecks(localRaw.decks, backup.decks),
            purchased: [
              ...new Set([
                ...(backup.purchased ?? []),
                ...(localRaw.purchased ?? []),
              ]),
            ],
            unlockedHeroes: [
              ...new Set([
                ...(backup.unlockedHeroes ?? []),
                ...(localRaw.unlockedHeroes ?? []),
              ]),
            ],
            homeFaction: localRaw.homeFaction ?? backup.homeFaction,
            heroId: localRaw.heroId ?? backup.heroId,
            schoolTrailCleared: mergeTrailClearedMaps(
              backup.schoolTrailCleared,
              localRaw.schoolTrailCleared,
            ),
            schoolTrailWins: Math.max(
              Math.floor(Number(backup.schoolTrailWins) || 0),
              Math.floor(Number(localRaw.schoolTrailWins) || 0),
            ),
            schoolTrailDrafts: mergeTrailDraftMaps(
              backup.schoolTrailDrafts,
              localRaw.schoolTrailDrafts,
            ),
            schoolTrailGrandRewardClaimed: Boolean(
              backup.schoolTrailGrandRewardClaimed ||
                localRaw.schoolTrailGrandRewardClaimed,
            ),
          }
        : localRaw;
  const serverOwned = user.owned;
  // После wipe сервер — источник правды по герою/уровню/школе.
  const serverLeads =
    dropStaleLocal ||
    (wipeId > 0 &&
      Boolean(serverOwned?.homeFaction) &&
      local.homeFaction !== serverOwned?.homeFaction);
  // Оракул/эпики/кейсы — локальный сейв главнее: иначе после покупки эпика
  // сервер со старым heroId откатывал облик на базового.
  // Эпики только с сервера (касса); без сервера — локальный сейв.
  const unlockedHeroes = [
    ...new Set(
      serverOwned
        ? [
            ...(local.unlockedHeroes ?? []).filter(
              (id) => !/_epic$/i.test(id),
            ),
            ...(serverOwned.unlockedHeroes ?? []),
          ]
        : [...(local.unlockedHeroes ?? [])],
    ),
  ];
  const serverHero =
    user.heroId ?? serverOwned?.heroId ?? null;
  const localHero = local.heroId ?? null;
  let heroId: string;
  if (serverLeads) {
    heroId = serverHero ?? localHero ?? "hero_life";
  } else {
    // Локальный сейв главнее, НО если раса разошлась с аккаунтом на сервере —
    // это след бага «угадай расу по кейсу»; тогда верим серверу/аккаунту.
    heroId =
      localHero && localHero !== "hero_life"
        ? localHero
        : (serverHero ?? localHero ?? "hero_life");
    if (
      serverHero &&
      localHero &&
      getHeroSafeFaction(serverHero) !== getHeroSafeFaction(localHero) &&
      (Number(serverOwned?.level) || 1) > 1
    ) {
      heroId = serverHero;
    }
  }
  // homeFaction только явный — НЕ выводить из hero_life (это кидало искателя в меню).
  const homeFaction = serverLeads
    ? (explicitHomeFaction(serverOwned, serverHero) ??
      explicitHomeFaction(local, localHero))
    : (explicitHomeFaction(local, localHero) ??
      explicitHomeFaction(serverOwned, serverHero));
  if (!homeFaction) {
    // Не сносим тропы вкуса: сливаем локаль + сервер (max по школам).
    const localOnboard = loadOwned();
    const trailOwned: OwnedState = {
      ...(!localOnboard.homeFaction ? localOnboard : blankOnboardingOwned()),
      schoolTrailCleared: mergeTrailClearedMaps(
        localOnboard.schoolTrailCleared,
        serverOwned?.schoolTrailCleared,
      ),
      schoolTrailWins: Math.max(
        Math.floor(Number(localOnboard.schoolTrailWins) || 0),
        Math.floor(Number(serverOwned?.schoolTrailWins) || 0),
      ),
      schoolTrailDrafts: mergeTrailDraftMaps(
        localOnboard.schoolTrailDrafts,
        serverOwned?.schoolTrailDrafts,
      ),
      schoolTrailGrandRewardClaimed: Boolean(
        localOnboard.schoolTrailGrandRewardClaimed ||
          serverOwned?.schoolTrailGrandRewardClaimed,
      ),
    };
    if (!trailOwned.homeFaction || hasSchoolTrailProgress(trailOwned)) {
      const next = !trailOwned.homeFaction
        ? trailOwned
        : {
            ...blankOnboardingOwned(),
            schoolTrailCleared: trailOwned.schoolTrailCleared,
            schoolTrailWins: trailOwned.schoolTrailWins,
            schoolTrailDrafts: trailOwned.schoolTrailDrafts,
            schoolTrailGrandRewardClaimed:
              trailOwned.schoolTrailGrandRewardClaimed,
          };
      saveOwned(next);
      if (user.login) backupOwnedForLogin(user.login, next);
      return next;
    }
    return blankOnboardingOwned();
  }
  // Коллекция/покупки: сервер — касса. Локальный max раньше оставлял бесплатные карты.
  const collection: Record<string, number> = {};
  const serverCol =
    serverOwned?.collection && typeof serverOwned.collection === "object"
      ? serverOwned.collection
      : null;
  if (serverCol) {
    for (const [id, n] of Object.entries(serverCol)) {
      const v = Math.max(0, Math.floor(Number(n) || 0));
      if (v > 0) collection[id] = v;
    }
  } else if (!serverLeads) {
    for (const [id, n] of Object.entries(local.collection ?? {})) {
      const v = Math.max(0, Math.floor(Number(n) || 0));
      if (v > 0) collection[id] = v;
    }
  }
  const unlocked = [
    ...new Set([
      ...(serverOwned?.unlocked ?? (serverLeads ? [] : local.unlocked) ?? []),
      ...Object.keys(collection),
    ]),
  ];
  const purchased = [
    ...new Set([...(serverOwned?.purchased ?? (serverLeads ? [] : local.purchased) ?? [])]),
  ];
  const decks = serverLeads
    ? richerDecks(serverOwned?.decks, { starter: [] })
    : richerDecks(local.decks, serverOwned?.decks);
  const serverLevel = Math.max(1, Number(serverOwned?.level) || 1);
  const localLevel = Math.max(1, Number(local.level) || 1);
  const level = serverLeads
    ? serverLevel
    : serverOwned != null
      ? Math.max(serverLevel, localLevel)
      : localLevel;
  const xp = serverLeads
    ? (serverOwned?.xp ?? 0)
    : serverOwned?.level && serverOwned.level > (local.level ?? 1)
      ? (serverOwned.xp ?? local.xp)
      : (local.xp ?? serverOwned?.xp);
  // Умения оракула: union — иначе ПК со старым сейвом прячет покупки с телефона
  // и потом PUT затирает сервер.
  const localSkills = Array.isArray(local.oracleSkillsOwned)
    ? local.oracleSkillsOwned.map(String)
    : [];
  const serverSkills = Array.isArray(serverOwned?.oracleSkillsOwned)
    ? serverOwned.oracleSkillsOwned.map(String)
    : [];
  const oracleSkillsOwned = serverLeads
    ? [...new Set(serverSkills)]
    : [...new Set([...localSkills, ...serverSkills])];
  const ownedSkillSet = new Set(oracleSkillsOwned);
  const loadoutFilled = (lo: unknown): number =>
    Array.isArray(lo)
      ? lo.filter((id) => typeof id === "string" && ownedSkillSet.has(id))
          .length
      : 0;
  const localLoadout = local.oracleSkillLoadout;
  const serverLoadout = serverOwned?.oracleSkillLoadout;
  const oracleSkillLoadout = serverLeads
    ? serverLoadout
    : loadoutFilled(serverLoadout) >= loadoutFilled(localLoadout)
      ? (serverLoadout ?? localLoadout)
      : (localLoadout ?? serverLoadout);
  let willPoints: number | undefined;
  if (serverLeads) {
    willPoints =
      serverOwned?.willPoints != null
        ? Math.max(0, Math.floor(Number(serverOwned.willPoints) || 0))
        : undefined;
  } else if (serverOwned?.willPoints != null && local.willPoints != null) {
    // У кого больше купленных умений — его остаток очков (уже потратил).
    if (serverSkills.length > localSkills.length) {
      willPoints = Math.max(0, Math.floor(Number(serverOwned.willPoints) || 0));
    } else if (localSkills.length > serverSkills.length) {
      willPoints = Math.max(0, Math.floor(Number(local.willPoints) || 0));
    } else {
      willPoints = Math.min(
        Math.max(0, Math.floor(Number(local.willPoints) || 0)),
        Math.max(0, Math.floor(Number(serverOwned.willPoints) || 0)),
      );
    }
  } else if (serverOwned?.willPoints != null) {
    willPoints = Math.max(0, Math.floor(Number(serverOwned.willPoints) || 0));
  } else if (local.willPoints != null) {
    willPoints = Math.max(0, Math.floor(Number(local.willPoints) || 0));
  }

  const merged: OwnedState = {
    ...local,
    // Валюта: сервер главнее (покупки/штрафы). Награды боя уходят PUT-ом до релогина.
    gold:
      serverOwned != null && serverOwned.gold != null
        ? Math.max(0, Number(serverOwned.gold) || 0)
        : Math.max(0, Number(local.gold) || 0),
    diamonds:
      serverOwned != null && serverOwned.diamonds != null
        ? Math.max(0, Number(serverOwned.diamonds) || 0)
        : Math.max(0, Number(local.diamonds) || 0),
    level,
    xp,
    heroId,
    homeFaction,
    unlockedHeroes,
    unlocked,
    purchased,
    collection,
    decks,
    // Осколки/кач: max(локаль, сервер) — иначе пустой {} с телефона затирает покупки с ПК.
    cardUpgrades: mergeUpgradeMaps(
      serverLeads ? undefined : local.cardUpgrades,
      serverOwned?.cardUpgrades,
    ),
    cardShards: mergeShardMaps(
      serverLeads ? undefined : local.cardShards,
      serverOwned?.cardShards,
    ),
    activeDeckId: serverLeads
      ? (serverOwned?.activeDeckId ?? "starter")
      : (local.activeDeckId ?? serverOwned?.activeDeckId ?? "starter"),
    oracleSkillsOwned,
    oracleSkillLoadout: Array.isArray(oracleSkillLoadout)
      ? oracleSkillLoadout
      : undefined,
    willPoints,
    shopTierShardCatchUp: Math.max(
      Math.floor(Number(local.shopTierShardCatchUp) || 0),
      Math.floor(Number(serverOwned?.shopTierShardCatchUp) || 0),
    ),
    schoolTrailWins: Math.max(
      Math.floor(Number(local.schoolTrailWins) || 0),
      Math.floor(Number(serverOwned?.schoolTrailWins) || 0),
    ),
    schoolTrailCleared: mergeTrailClearedMaps(
      local.schoolTrailCleared,
      serverOwned?.schoolTrailCleared,
    ),
    schoolTrailDrafts: mergeTrailDraftMaps(
      local.schoolTrailDrafts,
      serverOwned?.schoolTrailDrafts,
    ),
    schoolTrailGrandRewardClaimed: Boolean(
      local.schoolTrailGrandRewardClaimed ||
        serverOwned?.schoolTrailGrandRewardClaimed,
    ),
  };
  let next = homeFaction
    ? applySkillStateToOwned(setHero(merged, heroId), homeFaction)
    : merged;
  next = stripAccidentalHomeFaction(next);
  // Уже на 15+ без осколков нового тира — разовый догон (старый дроп их топил).
  next = catchUpShopTierShardsIfNeeded(next).owned;
  saveOwned(next);
  if (user.login) backupOwnedForLogin(user.login, next);
  return next;
}

/** Админ-флаги с сервера: полный wipe / сброс тропы / снятие бана PvP. */
async function applyServerAdminFlags(
  token: string,
  user: ApiUser,
  setCampaignState: (c: CampaignState) => void,
  setArenaState?: (a: ArenaState) => void,
): Promise<ApiUser> {
  const patch: Parameters<typeof apiUpdateMe>[1] = {};
  if (user.pendingClearPvpBan) {
    clearPvpFleeLocal();
    patch.clearPendingClearPvpBan = true;
  } else if (user.pvpFlee) {
    syncPvpFleeFromServer(user.pvpFlee);
  }
  const wipeId = Math.max(0, Math.floor(Number(user.ownedWipeId) || 0));
  const wipeSeen = user.login ? readWipeSeen(user.login) : 0;
  const serverBlank =
    !user.owned?.homeFaction &&
    !(user.owned && hasOwnedProgress(user.owned as OwnedState));
  // pendingWipe ИЛИ уже очищенный сервер при новом wipeId — снести локальное на этом устройстве.
  if (user.pendingWipeOwned || (wipeId > 0 && wipeId > wipeSeen && serverBlank)) {
    // wipeSeen пишем только в forceBlank/merge — иначе Math.max вернёт ур.
    clearActiveOwned();
    if (user.login) clearOwnedBackup(user.login);
    try {
      for (const k of Object.keys(localStorage)) {
        if (
          /^(arcane-duel-|orakul-owned-backup:|orakul-arena|orakul-dailies|orakul-campaign|orakul_action)/i.test(
            k,
          )
        ) {
          localStorage.removeItem(k);
        }
      }
    } catch {
      /* ignore */
    }
    clearActiveOwned();
    setCampaignState(resetCampaignProgress());
    setArenaState?.(resetArenaProgress());
    if (user.pendingWipeOwned) {
      patch.clearPendingWipeOwned = true;
      patch.clearPendingResetCampaign = true;
    } else if (user.pendingResetCampaign) {
      patch.clearPendingResetCampaign = true;
    }
  } else if (user.pendingResetCampaign) {
    setCampaignState(resetCampaignProgress());
    patch.clearPendingResetCampaign = true;
  }
  // Всегда подстраховать сервер актуальным локальным баном (если строже)
  const localFlee = exportPvpFleeForSync();
  if (localFlee.fleeCount > 0 || localFlee.bannedUntil > Date.now()) {
    patch.pvpFlee = localFlee;
  }
  if (Object.keys(patch).length === 0) return user;
  try {
    const { user: synced } = await apiUpdateMe(token, patch, {
      timeoutMs: 3500,
      retries: 1,
    });
    return synced;
  } catch {
    return user;
  }
}

function getHeroSafeFaction(heroId: string) {
  try {
    return getHero(heroId).faction;
  } catch {
    return "life" as const;
  }
}

export default function App() {
  const [boot, setBoot] = useState(true);
  const [pvpInviteCode, setPvpInviteCode] = useState("");
  const [token, setToken] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<ApiUser | null>(() => getCachedUser());
  const [screen, setScreen] = useState<Screen>("menu");
  const [owned, setOwned] = useState<OwnedState>(() => loadOwned());
  const [campaign, setCampaign] = useState<CampaignState>(() => loadCampaign());
  const [campaignNode, setCampaignNode] = useState(1);
  const [arena, setArena] = useState<ArenaState>(() => loadArena());
  const [arenaRound, setArenaRound] = useState(1);
  const [devSetup, setDevSetup] = useState<DevBattleSetup | null>(null);
  /** Seed соперника: новый на вход в бой и на «Новая битва». */
  const [botSeed, setBotSeed] = useState(() => freshBotSeed());
  /** Текущий бой тропы вкуса (онбординг). id стабилен — иначе смена draft на победе ремаунтит Battle. */
  const [trailFight, setTrailFight] = useState<{
    faction: Faction;
    step: number;
    id: string;
  } | null>(null);
  /** Вступление перед 1-м флагом — бой стартует после слайдов. */
  const [pendingTrailFight, setPendingTrailFight] = useState<{
    faction: Faction;
    step: number;
    id: string;
  } | null>(null);
  /** Пауза после победы на тропе — пока открыта, следующий бой нельзя. */
  const [trailBeat, setTrailBeat] = useState<SchoolTrailBeat | null>(null);
  const trailBeatRef = useRef<SchoolTrailBeat | null>(null);
  trailBeatRef.current = trailBeat;
  const [devToolsOn, setDevToolsOn] = useState(() => isDevToolsEnabled());
  const [hubTutStep, setHubTutStep] = useState<number | null>(() =>
    hasSeenHubTutorial() ? null : 0,
  );
  const [pvpState, setPvpState] = useState<BattleState | null>(null);
  const [pvpRemoteFx, setPvpRemoteFx] = useState<{
    fx: import("./game/engine").BattleFx;
    seq: number;
    atState?: BattleState;
  } | null>(null);
  const [pvpSeat, setPvpSeat] = useState<PvpSeat>("host");
  const [pvpMatchKey, setPvpMatchKey] = useState(0);
  const [pvpClock, setPvpClock] = useState<PvpClock>({
    turnEndsAt: null,
    yourTimeouts: 0,
    foeTimeouts: 0,
    maxTimeouts: PVP_MAX_TIMEOUTS,
    turnLimitSec: PVP_TURN_SEC,
    endMessage: null,
    openingDice: null,
    openingLocked: false,
    needRoll: false,
    youRolled: false,
    foeRolled: false,
  });
  const pvpSocketRef = useRef<PvpSocket | null>(null);
  const pvpSettledRef = useRef(false);
  const pvpBattleSeqRef = useRef(0);
  /** Код комнаты — для возврата в бой после звонка/свёртки. */
  const pvpRoomCodeRef = useRef<string | null>(null);
  const pvpReconnectingRef = useRef(false);
  const userRef = useRef(user);
  userRef.current = user;
  /** Не перезапускать FX на догон-пакетах с тем же fxSeq (300/900ms / sync). */
  const pvpRemoteFxSeqRef = useRef(0);
  /** Сбежал из PvP — без наград (даже утешительных). */
  const pvpFledRef = useRef(false);
  /** Вышел из тропы/арены до конца — поражение без наград боя. */
  const runForfeitRef = useRef(false);
  const pvpStateRef = useRef(pvpState);
  pvpStateRef.current = pvpState;
  const ownedRef = useRef(owned);
  ownedRef.current = owned;
  const campaignRef = useRef(campaign);
  campaignRef.current = campaign;
  const campaignNodeRef = useRef(campaignNode);
  campaignNodeRef.current = campaignNode;
  const arenaRef = useRef(arena);
  arenaRef.current = arena;
  const arenaRoundRef = useRef(arenaRound);
  arenaRoundRef.current = arenaRound;
  const screenRef = useRef(screen);
  screenRef.current = screen;

  useEffect(() => {
    alog("nav", "screen", { screen });
  }, [screen]);

  const handlePvpServerMsg = (msg: PvpServerMsg) => {
    if (msg.type === "battle") {
      const finished = Boolean(msg.matchEnded) || Boolean(msg.state.winner);
      if (pvpSettledRef.current && !finished) return;
      if (finished) pvpSettledRef.current = true;
      const seq = msg.battleSeq ?? 0;
      if (seq > 0 && seq < pvpBattleSeqRef.current && !finished) return;
      if (seq > pvpBattleSeqRef.current) pvpBattleSeqRef.current = seq;
      setPvpState({ ...msg.state });
      if (
        msg.fx &&
        msg.fxSeq != null &&
        msg.fxSeq > pvpRemoteFxSeqRef.current
      ) {
        pvpRemoteFxSeqRef.current = msg.fxSeq;
        setPvpRemoteFx({
          fx: msg.fx,
          seq: msg.fxSeq,
          atState: msg.state,
        });
      }
      setPvpClock((c) => ({
        ...c,
        turnEndsAt: finished ? null : msg.turnEndsAt,
        yourTimeouts: msg.yourTimeouts,
        foeTimeouts: msg.foeTimeouts,
        maxTimeouts: msg.maxTimeouts,
        turnLimitSec: msg.turnLimitSec,
        openingDice: null,
        openingLocked: false,
        needRoll: false,
        youRolled: true,
        foeRolled: true,
        endMessage: finished
          ? (c.endMessage ??
            msg.endMessage ??
            (msg.youWon ? "Победа!" : "Поражение"))
          : c.endMessage,
      }));
    }
    if (msg.type === "ended") {
      pvpSettledRef.current = true;
      setPvpClock((c) => ({
        ...c,
        turnEndsAt: null,
        endMessage: msg.message,
        openingLocked: false,
        needRoll: false,
      }));
      setPvpState((s) => {
        if (!s) return s;
        if (s.winner) return s;
        const won = msg.youWon;
        return {
          ...s,
          winner: won ? "you" : "enemy",
          you: won ? s.you : { ...s.you, hp: 0 },
          enemy: won ? { ...s.enemy, hp: 0 } : s.enemy,
          log: [msg.message, ...s.log].slice(0, 12),
        };
      });
    }
    if (msg.type === "peer_left" || msg.type === "error") {
      setPvpState((s) =>
        s
          ? {
              ...s,
              log: [msg.message, ...s.log].slice(0, 12),
            }
          : s,
      );
    }
  };

  /** После звонка/свёртки: новый сокет + join по коду комнаты. */
  const reconnectPvpBattle = async () => {
    if (pvpReconnectingRef.current || pvpSettledRef.current) return;
    if (screenRef.current !== "battle_pvp") return;
    const code = pvpRoomCodeRef.current;
    const t = token ?? getToken();
    if (!code || !t) return;
    const live = pvpSocketRef.current;
    if (live?.connected) {
      try {
        live.sync();
        unlockSfx();
      } catch {
        /* fall through to full reconnect */
      }
      if (live.connected) return;
    }
    pvpReconnectingRef.current = true;
    setPvpState((s) =>
      s
        ? {
            ...s,
            log: ["Восстанавливаем связь с боем…", ...s.log].slice(0, 12),
          }
        : s,
    );
    try {
      try {
        pvpSocketRef.current?.leave({ silent: true });
      } catch {
        /* ignore */
      }
      const next = new PvpSocket();
      pvpSocketRef.current = next;
      next.setDropHandler(() => {
        void reconnectPvpBattle();
      });
      await next.connect(t, handlePvpServerMsg);
      const o = ownedRef.current;
      const u = userRef.current;
      next.join({
        mode: "join",
        code,
        token: t,
        heroId: activeHeroId(o),
        deck: battleDeck(o),
        name: u?.displayName ?? u?.login ?? "Игрок",
        level: playerLevel(o),
        skills: o.oracleSkillLoadout,
      });
      unlockSfx();
    } catch {
      setPvpState((s) =>
        s
          ? {
              ...s,
              log: [
                "Нет связи — открой вкладку снова или обнови страницу",
                ...s.log,
              ].slice(0, 12),
            }
          : s,
      );
    } finally {
      pvpReconnectingRef.current = false;
    }
  };

  // Пока бой — тянем стол; при обрыве/возврате с звонка — reconnect.
  useEffect(() => {
    if (screen !== "battle_pvp") return;
    const tick = () => {
      if (pvpSettledRef.current) return;
      const sock = pvpSocketRef.current;
      if (!sock?.connected) {
        void reconnectPvpBattle();
        return;
      }
      try {
        sock.sync();
      } catch {
        void reconnectPvpBattle();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    const onResume = () => {
      if (document.visibilityState === "visible") {
        unlockSfx();
        void reconnectPvpBattle();
      }
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("pageshow", onResume);
    window.addEventListener("focus", onResume);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("focus", onResume);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, pvpMatchKey]);

  // Пульс «онлайн» для админки (раз в ~30с + при смене экрана).
  useEffect(() => {
    if (boot || !token) return;
    const mapScreen = (s: Screen): string => {
      if (s === "battle_pvp") return "battle_pvp";
      if (
        s === "battle" ||
        s === "battle_bot" ||
        s === "battle_campaign" ||
        s === "battle_arena" ||
        s === "battle_dev"
      ) {
        return "battle";
      }
      if (s === "multi") return "multi";
      if (s === "cabinet" || s === "collection" || s === "hero") {
        return "cabinet";
      }
      return "menu";
    };
    let cancelled = false;
    const beat = () => {
      if (cancelled || document.visibilityState === "hidden") return;
      const t = token ?? getToken();
      if (!t) return;
      void apiPresence(t, mapScreen(screenRef.current)).catch(() => {
        /* сеть/сон — не мешаем игре */
      });
    };
    beat();
    const id = window.setInterval(beat, 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [boot, token, screen]);

  // Вернуть на тропы, если прошлый баг ложно проставил homeFaction.
  useEffect(() => {
    if (boot || !token || !user) return;
    const fixed = stripAccidentalHomeFaction(ownedRef.current);
    if (fixed === ownedRef.current || fixed.homeFaction) return;
    saveOwned(fixed);
    setOwned(fixed);
    ownedRef.current = fixed;
    setScreen("school_trails");
    void apiUpdateMe(token, { owned: fixed })
      .then(({ user: me }) => {
        updateCachedUser(me);
        setUser(me);
      })
      .catch(() => {});
  }, [boot, token, user?.login]);

  // Музыку не автозапускаем: тихий вход. Боевой трек — только если уже включили в ⚙.
  useEffect(() => {
    if (boot) return;
    const inBattle =
      screen === "battle" ||
      screen === "battle_bot" ||
      screen === "battle_campaign" ||
      screen === "battle_arena" ||
      screen === "battle_school_trail" ||
      screen === "battle_pvp" ||
      screen === "battle_dev";
    unlockSfx();
    if (inBattle) void startBattleMusic();
    else void startMenuMusic(); // при mute только помечает «меню», play нет
  }, [boot, screen]);

  useEffect(() => {
    let cancelled = false;

    async function bootSession() {
      const tg = detectTelegramUser();
      const existing = getToken();
      const cached = getCachedUser();

      // Сразу в UI из кэша — не ждём VPS/CF. Сервер догоняем фоном.
      if (existing && cached) {
        setToken(existing);
        setUser(cached);
        setOwned(loadOwned());
        setBoot(false);
      } else if (!tg) {
        setBoot(false);
      }

      if (tg) {
        try {
          const res = await apiTelegramAuth({
            telegramId: tg.telegramId,
            firstName: tg.firstName,
            initData: tg.initData,
          });
          if (cancelled) return;
          setSession(res.token, res.user);
          setToken(res.token);
          const flagged = await applyServerAdminFlags(
            res.token,
            res.user,
            setCampaign,
            setArena,
          );
          setUser(flagged);
          setOwned(mergeOwnedFromServer(flagged));
          setBoot(false);
          return;
        } catch {
          if (!cancelled) setBoot(false);
          /* fall through to token refresh */
        }
      }

      if (!existing) return;

      try {
        const { user: me } = await apiMe(existing, {
          timeoutMs: 4000,
          retries: 1,
        });
        if (cancelled) return;
        setToken(existing);
        const flagged = await applyServerAdminFlags(
          existing,
          me,
          setCampaign,
          setArena,
        );
        updateCachedUser(flagged);
        setUser(flagged);
        setOwned(mergeOwnedFromServer(flagged));
      } catch (e) {
        const status =
          e && typeof e === "object" && "status" in e
            ? Number((e as { status?: number }).status)
            : 0;
        // Мёртвый токен: кэш рисовал «как будто вошёл», а в комнату PvP не пускало.
        if (status === 401 || status === 403) {
          if (!cancelled) {
            clearSession();
            setToken(null);
            setUser(null);
          }
        }
        // Иначе кэш уже на экране — ничего не сбрасываем.
      } finally {
        if (!cancelled) setBoot(false);
      }
    }

    void bootSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ссылка из Telegram: ?pvp=CODE → сразу в мульти.
  useEffect(() => {
    if (boot) return;
    if (!token || !user) return;
    if (user.needsEmailVerify) return;
    try {
      const q = new URLSearchParams(window.location.search);
      const raw = String(q.get("pvp") || q.get("room") || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      if (raw.length < 3) return;
      setPvpInviteCode(raw);
      setScreen("multi");
      const u = new URL(window.location.href);
      u.searchParams.delete("pvp");
      u.searchParams.delete("room");
      window.history.replaceState({}, "", u.pathname + u.search + u.hash);
    } catch {
      /* ignore */
    }
  }, [boot, token, user]);

  // Возврат с ЮKassa (?paid=1&order=…) — дотянуть алмазы с сервера.
  useEffect(() => {
    if (boot) return;
    const t = token ?? getToken();
    if (!t) return;
    let orderId: string | null = null;
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get("paid") === "1") {
        orderId = q.get("order");
      }
      if (!orderId) {
        orderId = sessionStorage.getItem("orakul_pending_order");
      }
    } catch {
      return;
    }
    if (!orderId) return;

    let cancelled = false;
    const cleanUrl = () => {
      try {
        const u = new URL(window.location.href);
        if (u.searchParams.has("paid") || u.searchParams.has("order")) {
          u.searchParams.delete("paid");
          u.searchParams.delete("order");
          window.history.replaceState({}, "", u.pathname + u.hash);
        }
        sessionStorage.removeItem("orakul_pending_order");
      } catch {
        /* ignore */
      }
    };

    void (async () => {
      for (let i = 0; i < 8; i++) {
        if (cancelled) return;
        try {
          const { order } = await apiPaymentOrder(t, orderId!);
          if (order?.status === "paid") {
            const { user: me } = await apiMe(t);
            if (cancelled) return;
            updateCachedUser(me);
            setUser(me);
            setOwned(mergeOwnedFromServer(me));
            cleanUrl();
            window.alert(
              `Оплата прошла! Начислено ${order.diamonds} алм. Приятной игры.`,
            );
            setScreen("collection");
            return;
          }
          if (order?.status === "canceled") {
            cleanUrl();
            window.alert("Оплата отменена.");
            return;
          }
        } catch {
          /* retry */
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!cancelled) {
        cleanUrl();
        window.alert(
          "Платёж ещё обрабатывается. Зайди в магазин через минуту — алмазы появятся после подтверждения ЮKassa.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [boot, token]);

  const persistOwned = async (next: OwnedState) => {
    saveOwned(next);
    setOwned(next);
    const t = token ?? getToken();
    if (!t) return;
    try {
      const { user: me } = await apiUpdateMe(t, {
        owned: next,
        heroId: next.heroId,
      });
      updateCachedUser(me);
      setUser(me);
      // Касса с сервера: валюта + коллекция (PUT мог срезать неоплаченное)
      if (me.owned) {
        const synced: OwnedState = {
          ...next,
          gold: me.owned.gold ?? next.gold,
          diamonds: me.owned.diamonds ?? next.diamonds,
          collection: me.owned.collection ?? next.collection,
          purchased: me.owned.purchased ?? next.purchased,
          unlocked: me.owned.unlocked ?? next.unlocked,
          unlockedHeroes: me.owned.unlockedHeroes ?? next.unlockedHeroes,
          level: me.owned.level ?? next.level,
          xp: me.owned.xp ?? next.xp,
          cardShards: mergeShardMaps(next.cardShards, me.owned.cardShards),
          cardUpgrades: mergeUpgradeMaps(
            next.cardUpgrades,
            me.owned.cardUpgrades,
          ),
        };
        saveOwned(synced);
        setOwned(synced);
        if (me.login) backupOwnedForLogin(me.login, synced);
      }
    } catch {
      /* offline */
    }
  };

  const updateOwned = (o: OwnedState) => {
    void persistOwned(o);
  };

  const onAuthed = (t: string, u: ApiUser) => {
    setSession(t, u);
    setToken(t);
    unlockSfx();
    void (async () => {
      const flagged = await applyServerAdminFlags(t, u, setCampaign, setArena);
      setUser(flagged);
      const next = mergeOwnedFromServer(flagged);
      setOwned(next);
      try {
        // Пустышку не «дозаполняем» логином как ником — идём в выбор оракула.
        if (!next.homeFaction || accountNeedsOnboarding(flagged)) {
          if (flagged.login) backupOwnedForLogin(flagged.login, next);
          return;
        }
        // Готовый аккаунт: синк сейва. heroId — только если школа уже выбрана.
        const { user: synced } = await apiUpdateMe(t, {
          owned: next,
          heroId: next.heroId,
        });
        updateCachedUser(synced);
        setUser(synced);
        if (synced.login) backupOwnedForLogin(synced.login, next);
      } catch {
        /* offline */
      }
    })();
    // Со школой — хаб. Искатель: пролог (если ещё не видел) или сразу путь.
    if (u.owned?.homeFaction) {
      setScreen("menu");
    } else if (u.displayName && !hasSeenPrologue(u.login || u.displayName)) {
      setScreen("prologue");
    } else {
      setScreen("school_trails");
    }
  };

  const logout = () => {
    const login = user?.login || getLastLogin();
    if (login) backupOwnedForLogin(login, ownedRef.current);
    setOwned(clearActiveOwned());
    clearSession();
    setToken(null);
    setUser(null);
    setScreen("menu");
  };

  const finishNameOnly = async (displayName: string) => {
    const t = token ?? getToken();
    if (!t) throw new Error("Нет сессии");
    const { user: me } = await apiUpdateMe(t, { displayName });
    updateCachedUser(me);
    setUser(me);
    // Логин → ник → пролог → путь.
    setScreen("prologue");
  };

  const finishPrologue = (login: string, after: "trails" | "menu") => {
    markPrologueSeen(login);
    setScreen(after === "menu" ? "menu" : "school_trails");
  };

  const finishOnboarding = async (
    displayName: string,
    nextOwned: OwnedState,
  ) => {
    const t = token ?? getToken();
    if (!t) throw new Error("Нет сессии");
    // nextOwned уже из beginWithHero: база или сразу эпик + homeFaction + старт-карты.
    saveOwned(nextOwned);
    setOwned(nextOwned);
    const { user: me } = await apiUpdateMe(t, {
      displayName,
      heroId: nextOwned.heroId,
      owned: nextOwned,
    });
    updateCachedUser(me);
    setUser(me);
    setScreen("menu");
  };

  const onBattleEnd = (won: boolean) => {
    // Песочница: ноль наград, сейв не трогаем
    if (screenRef.current === "battle_dev") {
      return {
        won,
        xpGained: 0,
        gainedLevels: 0,
        goldReward: 0,
        diamondReward: 0,
        giftLine: "🧪 Тест — прогресс не изменён",
      };
    }
    // Тропы вкуса: без XP/лута, только прогресс шага
    if (screenRef.current === "battle_school_trail") {
      const fight = trailFight;
      if (!won || !fight) {
        return {
          won: false,
          xpGained: 0,
          gainedLevels: 0,
          goldReward: 0,
          diamondReward: 0,
          giftLine: "Попробуй ещё раз — тропа ждёт",
        };
      }
      const step = schoolTrailStep(fight.faction, fight.step);
      const applied = applySchoolTrailWin(ownedRef.current, fight.faction);
      saveOwned(applied.owned);
      setOwned(applied.owned);
      ownedRef.current = applied.owned;
      const beat: SchoolTrailBeat = {
        faction: fight.faction,
        newlyCleared: applied.newlyCleared,
        rewardCardId: applied.rewardCardId,
        foeName: step?.foeName ?? applied.step.foeName,
        wowHint: step?.wowHint ?? applied.step.wowHint,
      };
      trailBeatRef.current = beat;
      setTrailBeat(beat);
      const t = token ?? getToken();
      if (t) {
        void apiUpdateMe(t, { owned: applied.owned }).then(({ user: me }) => {
          updateCachedUser(me);
          setUser(me);
        });
      }
      return {
        won: true,
        xpGained: 0,
        gainedLevels: 0,
        goldReward: 0,
        diamondReward: 0,
        celebration: true,
        resultEyebrow: `Путь оракула · флаг ${applied.newlyCleared}/5`,
        resultTitle: trailVictoryTitle(
          applied.newlyCleared,
          applied.rewardCardId,
        ),
        resultLead: trailVictoryLead(
          fight.faction,
          applied.newlyCleared,
          applied.rewardCardId,
          step?.wowHint,
        ),
        giftLine: rewardGiftLine(
          fight.faction,
          applied.newlyCleared,
          applied.rewardCardId,
          step?.wowHint,
        ),
        rewardCardId: applied.rewardCardId,
      };
    }
    const isCampaign = screenRef.current === "battle_campaign";
    const isArena = screenRef.current === "battle_arena";
    const isPvp = screenRef.current === "battle_pvp";
    const fledPvp = isPvp && pvpFledRef.current;
    if (fledPvp) pvpFledRef.current = false;
    const runForfeit = runForfeitRef.current;
    if (runForfeit) runForfeitRef.current = false;

    // Побег из PvP: ни XP, ни золота (анти-накрут вдвоём).
    if (fledPvp) {
      return {
        won: false,
        xpGained: 0,
        gainedLevels: 0,
        goldReward: 0,
        diamondReward: 0,
        giftLine: "Побег из дуэли — без наград",
      };
    }

    // Выход из тропы/арены: поражение в прогрессе, без XP/лута за бой.
    if (runForfeit && (isCampaign || isArena)) {
      if (isCampaign) setCampaign(applyCampaignLoss(campaignRef.current));
      if (isArena) setArena(applyArenaLoss(arenaRef.current));
      return {
        won: false,
        xpGained: 0,
        gainedLevels: 0,
        goldReward: 0,
        diamondReward: 0,
        giftLine: isArena
          ? "Выход из боя — поражение, арена закрыта на сегодня"
          : "Выход из боя — поражение, тропа закрыта на сегодня",
      };
    }

    // Тропа: только XP (+ вехи). Арена: своя таблица. PvP: повышенные XP/золото (без алмазов).
    let res = applyBattleResult(ownedRef.current, won, {
      xpOnly: isCampaign,
      pvp: isPvp,
      mode: isPvp
        ? "pvp"
        : isArena
          ? "arena"
          : isCampaign
            ? "campaign"
            : "bot",
    });
    let goldReward = res.goldReward;
    let diamondReward = res.diamondReward;
    let giftLine = res.giftLine;

    if (isCampaign) {
      if (won) {
        const camp = applyCampaignWin(
          campaignRef.current,
          res.owned,
          campaignNodeRef.current,
        );
        setCampaign(camp.campaign);
        res = { ...res, owned: camp.owned };
        goldReward += camp.milestoneGold;
        diamondReward += camp.milestoneDiamonds;
        trackCampaignClearedForDailies(camp.campaign.cleared);
        trackLifetimeTrailCleared(camp.campaign.cleared);
      } else {
        setCampaign(applyCampaignLoss(campaignRef.current));
      }
    }

    let resultEyebrow: string | null = null;
    let resultTitle: string | null = null;
    let resultLead: string | null = null;
    let celebration = false;

    if (isArena) {
      if (won) {
        const ar = applyArenaWin(
          arenaRef.current,
          res.owned,
          arenaRoundRef.current,
        );
        setArena(ar.arena);
        res = { ...res, owned: ar.owned };
        goldReward += ar.gold;
        diamondReward += ar.diamonds;
        if (ar.arena.cleared >= ARENA_ROUNDS) {
          celebration = true;
          resultEyebrow = "Поздравляем!";
          resultTitle = "Арена пройдена!";
          const bits: string[] = [];
          if (goldReward > 0) bits.push(`+${goldReward} зол.`);
          if (diamondReward > 0) bits.push(`+${diamondReward} алм.`);
          if (res.xpGained > 0) bits.push(`+${res.xpGained} XP`);
          resultLead = bits.length
            ? `Ваша награда: ${bits.join(" · ")}`
            : "Ваша награда уже у вас";
          giftLine = "Все 5 боёв арены пройдены";
        }
      } else {
        setArena(applyArenaLoss(arenaRef.current));
      }
    }

    if (isPvp) {
      const bonus = giftLine ? ` · ${giftLine}` : "";
      giftLine = won
        ? `Сетевая дуэль: победа · награды выше бота${bonus}`
        : `Сетевая дуэль: поражение · утешительные награды${bonus}`;
    }

    void persistOwned(res.owned);
    return {
      won,
      xpGained: res.xpGained,
      gainedLevels: res.gainedLevels,
      goldReward,
      diamondReward,
      giftLine,
      shardLine: res.shardLine,
      shardGains: res.shardGains,
      resultEyebrow,
      resultTitle,
      resultLead,
      celebration,
    };
  };

  const leavePvp = () => {
    const fighting = Boolean(pvpStateRef.current && !pvpStateRef.current.winner);
    if (fighting) {
      if (
        !window.confirm(
          "Покидаете PvP-бой?\n\n" +
            "• Вам будет засчитано поражение\n" +
            "• Ни опыта, ни золота (наград нет)\n" +
            "• Соперник получит победу\n\n" +
            "Сбегать некрасиво. На 3-й раз за день — бан 5 мин, на 4-й — 10 мин, дальше — 30 мин. Счётчик обнуляется завтра.\n\n" +
            "Всё равно выйти?",
        )
      ) {
        return;
      }
      pvpFledRef.current = true;
      pvpSettledRef.current = true;
      pvpRoomCodeRef.current = null;
      const flee = recordPvpFlee();
      const t = token ?? getToken();
      if (t) {
        void apiUpdateMe(t, { pvpFlee: exportPvpFleeForSync() }).catch(
          () => undefined,
        );
      }
      try {
        pvpSocketRef.current?.leave();
      } catch {
        /* ignore */
      }
      setPvpState((s) => {
        if (!s || s.winner) return s;
        return {
          ...s,
          winner: "enemy",
          you: { ...s.you, hp: 0 },
          log: ["Ты сбежал — поражение без наград", ...s.log].slice(0, 12),
        };
      });
      setPvpClock((c) => ({
        ...c,
        turnEndsAt: null,
        endMessage: flee.message,
      }));
      window.setTimeout(() => window.alert(flee.message), 50);
      return;
    }
    try {
      pvpSocketRef.current?.leave();
    } catch {
      /* ignore */
    }
    pvpSocketRef.current = null;
    pvpRoomCodeRef.current = null;
    setPvpState(null);
    setPvpClock({
      turnEndsAt: null,
      yourTimeouts: 0,
      foeTimeouts: 0,
      maxTimeouts: PVP_MAX_TIMEOUTS,
      turnLimitSec: PVP_TURN_SEC,
      endMessage: null,
      openingDice: null,
      openingLocked: false,
      needRoll: false,
      youRolled: false,
      foeRolled: false,
    });
    setScreen("multi");
  };

  if (boot) {
    return (
      <div className="auth-screen">
        <p className="hint">Загрузка…</p>
      </div>
    );
  }

  if (!token || !user) {
    return <AuthScreen onAuthed={onAuthed} />;
  }

  // Сессия есть, но почта не подтверждена — снова экран кода (не пускаем в игру).
  if (user.needsEmailVerify) {
    const remember = getLastLogin();
    return (
      <AuthScreen
        onAuthed={onAuthed}
        forceVerifyLogin={
          remember.includes("@") ? remember : user.login
        }
        forceVerifyEmail={user.email}
      />
    );
  }

  // Только ник обязателен. Дальше — обучение «Путь оракула» (хаб до школы закрыт).
  if (accountNeedsOnboarding(user)) {
    return (
      <NameOnboarding
        initialName={user.displayName ?? ""}
        onComplete={finishNameOnly}
      />
    );
  }

  const liveOwned = stripAccidentalHomeFaction(owned);
  const hero = getHero(activeHeroId(liveOwned));
  const displayName = user.displayName ?? user.login ?? "Игрок";
  const level = playerLevel(liveOwned);
  const foeLevel = botLevelNear(level);
  const seeker = !liveOwned.homeFaction;
  const loginKey = user.login || displayName;

  // Пролог: первый раз после ника, или пересмотр из хаба.
  if (screen === "prologue") {
    return (
      <PrologueScreen
        displayName={displayName}
        rewatch={!seeker || hasSeenPrologue(loginKey)}
        onDone={() =>
          finishPrologue(loginKey, seeker ? "trails" : "menu")
        }
      />
    );
  }

  // Искатель ещё не видел пролог — сначала он (не хаб).
  if (
    seeker &&
    !hasSeenPrologue(loginKey) &&
    screen !== "battle_school_trail" &&
    screen !== "trail_intro"
  ) {
    return (
      <PrologueScreen
        displayName={displayName}
        onDone={() => finishPrologue(loginKey, "trails")}
      />
    );
  }

  // Искатель: не пускаем шариться по меню. Тропы / выбор школы / бой тропы.
  if (seeker) {
    if (screen === "trail_intro" && pendingTrailFight) {
      return (
        <TrailIntroScreen
          faction={pendingTrailFight.faction}
          onDone={() => {
            markTrailIntroSeen(pendingTrailFight.faction);
            const fight = pendingTrailFight;
            setPendingTrailFight(null);
            unlockSfx();
            void startBattleMusic();
            setTrailFight(fight);
            setScreen("battle_school_trail");
          }}
        />
      );
    }

    if (screen === "battle_school_trail" && trailFight) {
      const foeHero = schoolTrailEnemyHeroId(trailFight.faction);
      const trailDraft = schoolTrailDraft(owned, trailFight.faction);
      return (
        <Battle
          key={trailFight.id}
          yourDeck={schoolTrailBattleDeck(owned, trailFight.faction)}
          enemyDeck={[]}
          yourHeroId={activeHeroId(owned)}
          enemyHeroId={foeHero}
          yourName={displayName}
          yourLevel={level}
          enemyLevel={8}
          enemyCardUpgrades={schoolTrailEnemyUpgrades(
            trailFight.faction,
            trailFight.step,
          )}
          oracleSkills={[]}
          enemyOracleSkills={[]}
          prepareBattle={(s) =>
            prepareSchoolTrailBattle(
              s,
              trailFight.faction,
              trailFight.step,
              trailDraft,
            )
          }
          allowRematch={false}
          exitPolicy="free"
          resultExitLabel={(won) =>
            won ? "Забрать награду" : "На карту"
          }
          onExit={() => {
            setTrailFight(null);
            setScreen("school_trails");
          }}
          onBattleEnd={onBattleEnd}
        />
      );
    }

    if (screen === "school_pick") {
      return (
        <OnboardingScreen
          owned={owned}
          initialName={displayName}
          afterTrails
          onComplete={finishOnboarding}
        />
      );
    }

    const persistOwnedPatch = (next: OwnedState) => {
      saveOwned(next);
      setOwned(next);
      ownedRef.current = next;
      const t = token ?? getToken();
      if (t) {
        void apiUpdateMe(t, { owned: next }).then(({ user: me }) => {
          updateCachedUser(me);
          setUser(me);
        });
      }
    };

    const resetTrailsForDev = () => {
      const next = resetSchoolTrailProgress(ownedRef.current);
      trailBeatRef.current = null;
      setTrailBeat(null);
      setTrailFight(null);
      setPendingTrailFight(null);
      clearTrailIntroSeen();
      persistOwnedPatch(next);
    };

    const claimGrandReward = () => {
      persistOwnedPatch(claimSchoolTrailGrandReward(ownedRef.current));
    };

    return (
      <SchoolTrailsScreen
        owned={owned}
        displayName={displayName}
        asTutorial
        trailBeat={trailBeat}
        onDismissTrailBeat={() => {
          trailBeatRef.current = null;
          setTrailBeat(null);
        }}
        onResetTrails={resetTrailsForDev}
        onClaimGrandReward={claimGrandReward}
        onPlayTrail={(faction, stepIndex) => {
          if (trailBeatRef.current) return;
          const fight = {
            faction,
            step: stepIndex,
            id: `trail-${faction}-${stepIndex}-${Date.now()}`,
          };
          if (shouldShowTrailIntro(ownedRef.current, faction, stepIndex)) {
            setPendingTrailFight(fight);
            setScreen("trail_intro");
            return;
          }
          unlockSfx();
          void startBattleMusic();
          setTrailFight(fight);
          setScreen("battle_school_trail");
        }}
        onPickSchool={() => setScreen("school_pick")}
      />
    );
  }

  if (screen === "trail_intro" && pendingTrailFight) {
    return (
      <TrailIntroScreen
        faction={pendingTrailFight.faction}
        onDone={() => {
          markTrailIntroSeen(pendingTrailFight.faction);
          const fight = pendingTrailFight;
          setPendingTrailFight(null);
          unlockSfx();
          void startBattleMusic();
          setTrailFight(fight);
          setScreen("battle_school_trail");
        }}
      />
    );
  }

  if (screen === "battle_school_trail" && trailFight) {
    const foeHero = schoolTrailEnemyHeroId(trailFight.faction);
    const trailDraft = schoolTrailDraft(owned, trailFight.faction);
    return (
      <Battle
        key={trailFight.id}
        yourDeck={schoolTrailBattleDeck(owned, trailFight.faction)}
        enemyDeck={[]}
        yourHeroId={activeHeroId(owned)}
        enemyHeroId={foeHero}
        yourName={displayName}
        yourLevel={level}
        enemyLevel={8}
        enemyCardUpgrades={schoolTrailEnemyUpgrades(
          trailFight.faction,
          trailFight.step,
        )}
        oracleSkills={owned.oracleSkillLoadout}
        enemyOracleSkills={[]}
        prepareBattle={(s) =>
          prepareSchoolTrailBattle(
            s,
            trailFight.faction,
            trailFight.step,
            trailDraft,
          )
        }
        allowRematch={false}
        exitPolicy="free"
        resultExitLabel={(won) =>
          won ? "Забрать награду" : "На карту"
        }
        onExit={() => {
          setTrailFight(null);
          setScreen("school_trails");
        }}
        onBattleEnd={onBattleEnd}
      />
    );
  }

  if (screen === "school_pick") {
    return (
      <OnboardingScreen
        owned={owned}
        initialName={displayName}
        afterTrails
        onBack={() => setScreen("school_trails")}
        onComplete={finishOnboarding}
      />
    );
  }

  if (screen === "school_trails") {
    return (
      <SchoolTrailsScreen
        owned={owned}
        displayName={displayName}
        onBack={() => setScreen("menu")}
        trailBeat={trailBeat}
        onDismissTrailBeat={() => {
          trailBeatRef.current = null;
          setTrailBeat(null);
        }}
        onResetTrails={() => {
          const next = resetSchoolTrailProgress(ownedRef.current);
          trailBeatRef.current = null;
          setTrailBeat(null);
          setTrailFight(null);
          setPendingTrailFight(null);
          clearTrailIntroSeen();
          saveOwned(next);
          setOwned(next);
          ownedRef.current = next;
          const t = token ?? getToken();
          if (t) {
            void apiUpdateMe(t, { owned: next }).then(({ user: me }) => {
              updateCachedUser(me);
              setUser(me);
            });
          }
        }}
        onClaimGrandReward={() => {
          const next = claimSchoolTrailGrandReward(ownedRef.current);
          saveOwned(next);
          setOwned(next);
          ownedRef.current = next;
          const t = token ?? getToken();
          if (t) {
            void apiUpdateMe(t, { owned: next }).then(({ user: me }) => {
              updateCachedUser(me);
              setUser(me);
            });
          }
        }}
        onPlayTrail={(faction, stepIndex) => {
          if (trailBeatRef.current) return;
          const fight = {
            faction,
            step: stepIndex,
            id: `trail-${faction}-${stepIndex}-${Date.now()}`,
          };
          if (shouldShowTrailIntro(ownedRef.current, faction, stepIndex)) {
            setPendingTrailFight(fight);
            setScreen("trail_intro");
            return;
          }
          unlockSfx();
          void startBattleMusic();
          setTrailFight(fight);
          setScreen("battle_school_trail");
        }}
        onPickSchool={() => setScreen("school_pick")}
      />
    );
  }

  if (screen === "battle_dev" && devSetup) {
    const resolved = resolveDevBattle(devSetup);
    return (
      <Battle
        yourDeck={resolved.yourDeck}
        enemyDeck={resolved.enemyDeck}
        yourHeroId={resolved.yourHeroId}
        enemyHeroId={resolved.enemyHeroId}
        yourName={`${displayName} (тест)`}
        yourLevel={resolved.yourLevel}
        enemyLevel={resolved.enemyLevel}
        cardUpgrades={resolved.yourCardUpgrades}
        enemyCardUpgrades={resolved.enemyCardUpgrades}
        oracleSkills={owned.oracleSkillLoadout}
        onExit={() => setScreen("dev")}
        onBattleEnd={onBattleEnd}
      />
    );
  }

  if (
    screen === "battle" ||
    screen === "battle_bot" ||
    screen === "battle_campaign" ||
    screen === "battle_arena"
  ) {
    const vsBot = screen === "battle_bot";
    const vsCamp = screen === "battle_campaign";
    const vsArena = screen === "battle_arena";
    const foeLv = vsCamp
      ? campaignFoeLevel(level, campaignNode)
      : vsArena
        ? arenaFoeLevel(level, arena.cleared)
        : vsBot
          ? foeLevel
          : level;
    const yourHero = activeHeroId(owned);
    // Генератор: другой герой / персона / колода на каждый nonce
    // Тропа 1–3: без случайного «агро» — разминка, не лотерея на локаут дня
    const bot = rollBotOpponent(
      yourHero,
      foeLv,
      botSeed,
      vsCamp && campaignNode <= 3 ? { persona: "midrange" } : undefined,
    );
    const foeHero = bot.heroId;
    // Раунд из прогресса хаба (не из стейта кнопки — иначе гонка setState).
    const fightRound = vsArena ? arena.cleared + 1 : arenaRound;
    const arenaMods = vsArena
      ? arenaModsForRound(arena, fightRound)
      : null;
    return (
      <Battle
        key={
          vsArena
            ? `arena-${arena.day}-${fightRound}-${botSeed}`
            : `bot-${screen}-${botSeed}`
        }
        yourDeck={battleDeck(owned)}
        enemyDeck={bot.deck}
        yourHeroId={yourHero}
        enemyHeroId={foeHero}
        yourName={displayName}
        yourLevel={level}
        enemyLevel={foeLv}
        cardUpgrades={owned.cardUpgrades}
        oracleSkills={owned.oracleSkillLoadout}
        enemyOracleSkills={bot.skills}
        aiPersona={bot.persona}
        aiSeed={bot.seed}
        prepareBattle={
          arenaMods
            ? (s) => applyArenaRules(s, arenaMods)
            : undefined
        }
        allowRematch={!vsArena && !vsCamp}
        rematchLabel={vsBot ? "Новая битва" : "Ещё раз"}
        onRematch={
          vsBot
            ? () => {
                unlockSfx();
                void startBattleMusic();
                setBotSeed(freshBotSeed());
              }
            : undefined
        }
        exitPolicy={vsCamp || vsArena ? "defeat" : "free"}
        resultExitLabel={(won) => {
          if (vsArena) {
            if (won && arena.cleared < ARENA_ROUNDS) {
              return `К правилам боя ${arena.cleared + 1}`;
            }
            return "В меню арены";
          }
          if (vsCamp) return "К карте тропы";
          if (vsBot) return "Выйти";
          return "В меню";
        }}
        onForfeitExit={
          vsCamp || vsArena
            ? () => {
                runForfeitRef.current = true;
              }
            : undefined
        }
        onExit={() =>
          setScreen(
            vsCamp
              ? "campaign"
              : vsArena
                ? "arena"
                : vsBot
                  ? "multi"
                  : "menu",
          )
        }
        onBattleEnd={onBattleEnd}
      />
    );
  }

  if (screen === "dev") {
    return (
      <DevSandbox
        onBack={() => setScreen("menu")}
        onStart={(setup) => {
          setDevSetup(setup);
          unlockSfx();
          void startBattleMusic();
          setScreen("battle_dev");
        }}
      />
    );
  }

  if (screen === "campaign") {
    return (
      <CampaignMap
        owned={owned}
        campaign={campaign}
        onBack={() => setScreen("menu")}
        onOpen={() => setCampaign(refreshCampaignDay(campaignRef.current))}
        onAcceptFight={(node) => {
          setCampaignNode(node);
          setBotSeed(freshBotSeed());
          unlockSfx();
          void startBattleMusic();
          setScreen("battle_campaign");
        }}
      />
    );
  }

  if (screen === "arena") {
    return (
      <ArenaHub
        owned={owned}
        arena={arena}
        onBack={() => setScreen("menu")}
        onOpen={() => setArena(refreshArenaDay(arenaRef.current))}
        onAcceptFight={(round) => {
          arenaRoundRef.current = round;
          setArenaRound(round);
          setBotSeed(freshBotSeed());
          unlockSfx();
          void startBattleMusic();
          setScreen("battle_arena");
        }}
        onResetRun={
          devToolsOn
            ? () => setArena(resetArenaRun(arenaRef.current))
            : undefined
        }
      />
    );
  }

  if (screen === "collection") {
    const hubTip =
      hubTutStep != null ? HUB_TUTORIAL_TIPS[hubTutStep] : undefined;
    return (
      <>
        <Collection
          owned={owned}
          onChange={updateOwned}
          onBack={() => setScreen("menu")}
          forcedTab={hubTip?.collectionTab}
          authToken={token}
        />
        {hubTutStep != null && (
          <HubTutorial
            step={hubTutStep}
            onStep={setHubTutStep}
            onNavigate={(s: HubTutorialScreen) => setScreen(s)}
          />
        )}
      </>
    );
  }

  if (screen === "hero") {
    return (
      <HeroSelect
        owned={owned}
        onChange={updateOwned}
        onBack={() => setScreen("cabinet")}
        authToken={token}
        onBattle={() => {
          unlockSfx();
          void startBattleMusic();
          setScreen("battle");
        }}
      />
    );
  }

  if (screen === "cabinet") {
    const hubTip =
      hubTutStep != null ? HUB_TUTORIAL_TIPS[hubTutStep] : undefined;
    return (
      <>
        <Cabinet
          owned={owned}
          displayName={displayName}
          onChange={updateOwned}
          onBack={() => setScreen("menu")}
          onChooseHero={() => setScreen("hero")}
          forcedTab={hubTip?.cabinetTab}
        />
        {hubTutStep != null && (
          <HubTutorial
            step={hubTutStep}
            onStep={setHubTutStep}
            onNavigate={(s: HubTutorialScreen) => setScreen(s)}
          />
        )}
      </>
    );
  }

  if (screen === "dailies") {
    return (
      <>
        <div className="multi-screen">
          <header className="page-bar">
            <button
              type="button"
              className="ghost"
              onClick={() => setScreen("menu")}
            >
              ← Меню
            </button>
            <h1>Задания</h1>
            <span />
          </header>
          <DailyPanel
            owned={owned}
            onClaim={(id) => {
              const res = claimDailyQuest(ownedRef.current, id);
              if (res.ok) void persistOwned(res.owned);
              return res;
            }}
            onClaimLifetime={(id) => {
              syncLifetimeFromOwned(ownedRef.current);
              const res = claimLifetimeQuestReward(ownedRef.current, id);
              if (res.ok) void persistOwned(res.owned);
              return res;
            }}
          />
        </div>
        {hubTutStep != null && (
          <HubTutorial
            step={hubTutStep}
            onStep={setHubTutStep}
            onNavigate={(s: HubTutorialScreen) => setScreen(s)}
          />
        )}
      </>
    );
  }

  if (screen === "battle_pvp" && pvpState && pvpSocketRef.current) {
    const sock = pvpSocketRef.current;
    return (
      <Battle
        key={`pvp-${pvpSeat}-${pvpMatchKey}`}
        yourDeck={battleDeck(owned)}
        enemyDeck={battleDeck(owned)}
        yourHeroId={pvpState.you.heroId}
        enemyHeroId={pvpState.enemy.heroId}
        yourName={pvpState.you.name}
        yourLevel={pvpState.you.level ?? level}
        enemyLevel={pvpState.enemy.level ?? 1}
        externalState={pvpState}
        remoteFx={pvpRemoteFx}
        network={{
          sendAction: (action) => {
            try {
              sock.action(action);
              // Догоняем стол у обоих — мало ли пакет battle потерялся.
              window.setTimeout(() => {
                try {
                  sock.sync();
                } catch {
                  /* ignore */
                }
              }, 400);
            } catch {
              /* ignore */
            }
          },
          turnEndsAt: pvpClock.turnEndsAt,
          yourTimeouts: pvpClock.yourTimeouts,
          foeTimeouts: pvpClock.foeTimeouts,
          maxTimeouts: pvpClock.maxTimeouts,
          turnLimitSec: pvpClock.turnLimitSec,
          openingDice: pvpClock.openingDice,
          openingLocked: pvpClock.openingLocked,
          needRoll: pvpClock.needRoll,
          youRolled: pvpClock.youRolled,
          foeRolled: pvpClock.foeRolled,
          ended: Boolean(pvpClock.endMessage),
          rollDice: () => {
            try {
              sock.rollDice();
            } catch {
              /* ignore */
            }
          },
          sync: () => {
            try {
              sock.sync();
            } catch {
              /* ignore */
            }
          },
          exitLabel: "Сдаться",
        }}
        allowRematch={false}
        onExit={leavePvp}
        onBattleEnd={onBattleEnd}
      />
    );
  }

  if (screen === "multi") {
    return (
      <MultiMenu
        playerLevel={level}
        heroId={activeHeroId(owned)}
        displayName={displayName}
        deck={battleDeck(owned)}
        oracleSkills={owned.oracleSkillLoadout}
        initialCode={pvpInviteCode}
        onBack={() => {
          setPvpInviteCode("");
          setScreen("menu");
        }}
        onFightBot={() => {
          setBotSeed(freshBotSeed());
          unlockSfx();
          void startBattleMusic();
          setScreen("battle_bot");
        }}
        canStartPvp={() => {
          const gate = canEnterPvp();
          if (!gate.ok) {
            window.alert(gate.message);
            return false;
          }
          return true;
        }}
        onPvpStart={({
          socket,
          state,
          youAre,
          code,
          turnEndsAt,
          yourTimeouts,
          foeTimeouts,
          maxTimeouts,
          turnLimitSec,
          openingDice: _openingDice,
          openingLocked: _openingLocked,
          needRoll: _needRoll,
          youRolled: _youRolled,
          foeRolled: _foeRolled,
        }) => {
          pvpFledRef.current = false;
          pvpSettledRef.current = false;
          pvpBattleSeqRef.current = 0;
          pvpRemoteFxSeqRef.current = 0;
          pvpRoomCodeRef.current = code;
          pvpReconnectingRef.current = false;
          pvpSocketRef.current = socket;
          setPvpMatchKey((n) => n + 1);
          setPvpSeat(youAre);
          setPvpState(state);
          setPvpRemoteFx(null);
          setPvpClock({
            turnEndsAt,
            yourTimeouts,
            foeTimeouts,
            maxTimeouts,
            turnLimitSec,
            endMessage: null,
            openingDice: null,
            // Оверлей жеребья отключён: иначе один в бою, у второго трясутся кубики.
            openingLocked: false,
            needRoll: false,
            youRolled: true,
            foeRolled: true,
          });
          socket.setHandler(handlePvpServerMsg);
          socket.setDropHandler(() => {
            void reconnectPvpBattle();
          });
          unlockSfx();
          void startBattleMusic();
          setScreen("battle_pvp");
        }}
      />
    );
  }

  return (
    <>
      <SplashMenu
        heroName={owned.homeFaction ? hero.name : "Искатель"}
        displayName={displayName}
        gold={owned.gold ?? 0}
        diamonds={owned.diamonds ?? 0}
        showDev={devToolsOn}
        onSolo={() => {
          setCampaign(refreshCampaignDay(campaignRef.current));
          setScreen("campaign");
        }}
        onArena={() => {
          if (!owned.homeFaction) {
            window.alert("Арена — после выбора школы.");
            return;
          }
          setArena(refreshArenaDay(arenaRef.current));
          setScreen("arena");
        }}
        onMulti={() => setScreen("multi")}
        onCabinet={() => setScreen("cabinet")}
        onCollection={() => setScreen("collection")}
        onDailies={() => setScreen("dailies")}
        onOraclePath={() => setScreen("school_trails")}
        onRewatchPrologue={() => setScreen("prologue")}
        onDev={() => setScreen("dev")}
        onEnableDev={() => {
          setDevToolsEnabled(true);
          setDevToolsOn(true);
        }}
        onLogout={logout}
        owned={owned}
        onOwnedChange={updateOwned}
        initialMailUnread={user?.mailUnread ?? 0}
        onMailUser={(u) => {
          setUser(u);
          if (u.owned) setOwned(mergeOwnedFromServer(u));
        }}
      />
      {hubTutStep != null && (
        <HubTutorial
          step={hubTutStep}
          onStep={setHubTutStep}
          onNavigate={(s: HubTutorialScreen) => setScreen(s)}
        />
      )}
    </>
  );
}
