import { useEffect, useRef, useState } from "react";
import { ArenaHub } from "./components/ArenaHub";
import { AuthScreen } from "./components/AuthScreen";
import { Battle } from "./components/Battle";
import { Cabinet } from "./components/Cabinet";
import { CampaignMap } from "./components/CampaignMap";
import { Collection } from "./components/Collection";
import { DailyPanel } from "./components/DailyPanel";
import { DevSandbox } from "./components/DevSandbox";
import { HeroSelect } from "./components/HeroSelect";
import { MultiMenu } from "./components/MultiMenu";
import { OnboardingScreen } from "./components/OnboardingScreen";
import { HubTutorial } from "./components/HubTutorial";
import { SplashMenu } from "./components/SplashMenu";
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
  resetArenaRun,
  type ArenaState,
} from "./game/arena";
import {
  canEnterPvp,
  recordPvpFlee,
} from "./game/pvpFleeBan";
import { applyArenaRules } from "./game/battleRules";
import {
  applyCampaignLoss,
  applyCampaignWin,
  campaignFoeLevel,
  refreshCampaignDay,
  loadCampaign,
  type CampaignState,
} from "./game/campaign";
import {
  apiMe,
  apiTelegramAuth,
  apiUpdateMe,
  type ApiUser,
} from "./game/api";
import {
  botDeckForLevel,
  botHeroIdFor,
  botLevelNear,
} from "./game/botDeck";
import { getHero } from "./game/heroes";
import {
  battleDeck,
  activeHeroId,
  applyBattleResult,
  claimDailyQuest,
  loadOwned,
  playerLevel,
  saveOwned,
  setHero,
} from "./game/owned";
import {
  clearSession,
  getCachedUser,
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
} from "./game/pvpProtocol";
import { startBattleMusic, startMenuMusic, unlockSfx } from "./game/sfx";
import { detectTelegramUser } from "./game/telegram";
import type { BattleState, OwnedState } from "./game/types";
import "./App.css";

type PvpClock = {
  turnEndsAt: number | null;
  yourTimeouts: number;
  foeTimeouts: number;
  maxTimeouts: number;
  turnLimitSec: number;
  endMessage: string | null;
};

type Screen =
  | "menu"
  | "campaign"
  | "arena"
  | "battle"
  | "battle_bot"
  | "battle_campaign"
  | "battle_arena"
  | "battle_pvp"
  | "battle_dev"
  | "dev"
  | "collection"
  | "hero"
  | "cabinet"
  | "multi"
  | "dailies";

function mergeOwnedFromServer(user: ApiUser): OwnedState {
  const local = loadOwned();
  const serverOwned = user.owned;
  // Оракул/эпики/кейсы — локальный сейв главнее: иначе после покупки эпика
  // сервер со старым heroId откатывал облик на базового.
  const unlockedHeroes = [
    ...new Set([
      ...(local.unlockedHeroes ?? []),
      ...(serverOwned?.unlockedHeroes ?? []),
    ]),
  ];
  const serverHero =
    user.heroId ?? serverOwned?.heroId ?? null;
  const localHero = local.heroId ?? null;
  // Локальный сейв главнее, НО если раса разошлась с аккаунтом на сервере —
  // это след бага «угадай расу по кейсу»; тогда верим серверу/аккаунту.
  let heroId =
    localHero && localHero !== "hero_life"
      ? localHero
      : (serverHero ?? localHero ?? "hero_life");
  if (
    serverHero &&
    localHero &&
    getHeroSafeFaction(serverHero) !== getHeroSafeFaction(localHero)
  ) {
    heroId = serverHero;
  }
  const homeFaction = getHeroSafeFaction(heroId);
  const collection = { ...(local.collection ?? {}) };
  if (serverOwned?.collection && typeof serverOwned.collection === "object") {
    for (const [id, n] of Object.entries(serverOwned.collection)) {
      const a = Math.max(0, Math.floor(Number(collection[id]) || 0));
      const b = Math.max(0, Math.floor(Number(n) || 0));
      collection[id] = Math.max(a, b);
    }
  }
  const unlocked = [
    ...new Set([
      ...(local.unlocked ?? []),
      ...(serverOwned?.unlocked ?? []),
      ...Object.keys(collection),
    ]),
  ];
  const purchased = [
    ...new Set([
      ...(local.purchased ?? []),
      ...(serverOwned?.purchased ?? []),
    ]),
  ];
  const merged: OwnedState = {
    ...local,
    // max: админ-гранты с сервера + локальный прогресс не теряем
    gold: Math.max(Number(serverOwned?.gold) || 0, Number(local.gold) || 0),
    diamonds: Math.max(
      Number(serverOwned?.diamonds) || 0,
      Number(local.diamonds) || 0,
    ),
    level: Math.max(
      Number(serverOwned?.level) || 1,
      Number(local.level) || 1,
    ),
    xp: serverOwned?.level && serverOwned.level > (local.level ?? 1)
      ? (serverOwned.xp ?? local.xp)
      : (local.xp ?? serverOwned?.xp),
    heroId,
    homeFaction,
    unlockedHeroes,
    unlocked,
    purchased,
    collection,
    decks: local.decks,
    activeDeckId: local.activeDeckId ?? "starter",
  };
  const next = setHero(merged, heroId);
  saveOwned(next);
  return next;
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
  const [token, setToken] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<ApiUser | null>(() => getCachedUser());
  const [screen, setScreen] = useState<Screen>("menu");
  const [owned, setOwned] = useState<OwnedState>(() => loadOwned());
  const [campaign, setCampaign] = useState<CampaignState>(() => loadCampaign());
  const [campaignNode, setCampaignNode] = useState(1);
  const [arena, setArena] = useState<ArenaState>(() => loadArena());
  const [arenaRound, setArenaRound] = useState(1);
  const [devSetup, setDevSetup] = useState<DevBattleSetup | null>(null);
  const [devToolsOn, setDevToolsOn] = useState(() => isDevToolsEnabled());
  const [hubTutStep, setHubTutStep] = useState<number | null>(() =>
    hasSeenHubTutorial() ? null : 0,
  );
  const [pvpState, setPvpState] = useState<BattleState | null>(null);
  const [pvpSeat, setPvpSeat] = useState<PvpSeat>("host");
  const [pvpClock, setPvpClock] = useState<PvpClock>({
    turnEndsAt: null,
    yourTimeouts: 0,
    foeTimeouts: 0,
    maxTimeouts: PVP_MAX_TIMEOUTS,
    turnLimitSec: PVP_TURN_SEC,
    endMessage: null,
  });
  const pvpSocketRef = useRef<PvpSocket | null>(null);
  /** Сбежал из PvP — без наград (даже утешительных). */
  const pvpFledRef = useRef(false);
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

  // Музыка меню по умолчанию ВКЛ до боя; mute уважается (не форсим play).
  useEffect(() => {
    if (boot) return;
    const inBattle =
      screen === "battle" ||
      screen === "battle_bot" ||
      screen === "battle_campaign" ||
      screen === "battle_arena" ||
      screen === "battle_pvp" ||
      screen === "battle_dev";
    if (inBattle) {
      unlockSfx();
      void startBattleMusic();
      return;
    }
    unlockSfx();
    void startMenuMusic();
    const kick = () => {
      unlockSfx();
      void startMenuMusic();
    };
    window.addEventListener("pointerdown", kick, { passive: true });
    window.addEventListener("keydown", kick);
    return () => {
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
    };
  }, [boot, screen]);

  useEffect(() => {
    let cancelled = false;

    async function bootSession() {
      const tg = detectTelegramUser();
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
          setUser(res.user);
          setOwned(mergeOwnedFromServer(res.user));
          setBoot(false);
          return;
        } catch {
          /* fall through */
        }
      }

      const existing = getToken();
      if (!existing) {
        if (!cancelled) setBoot(false);
        return;
      }
      try {
        const { user: me } = await apiMe(existing);
        if (cancelled) return;
        updateCachedUser(me);
        setToken(existing);
        setUser(me);
        {
          const next = mergeOwnedFromServer(me);
          setOwned(next);
          try {
            const { user: synced } = await apiUpdateMe(existing, {
              owned: next,
              heroId: next.heroId,
            });
            if (!cancelled) {
              updateCachedUser(synced);
              setUser(synced);
            }
          } catch {
            /* offline */
          }
        }
      } catch {
        // Релоад / сервер лежит / сеть: не выкидывать на логин, если есть кэш.
        const cached = getCachedUser();
        if (!cancelled) {
          if (cached) {
            setToken(existing);
            setUser(cached);
            setOwned(loadOwned());
          } else {
            clearSession();
            setToken(null);
            setUser(null);
          }
        }
      } finally {
        if (!cancelled) setBoot(false);
      }
    }

    void bootSession();
    return () => {
      cancelled = true;
    };
  }, []);

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
      // Админ-гранты с сервера (pending → owned) подтянуть в локальный сейв
      if (me.owned) {
        const synced: OwnedState = {
          ...next,
          gold: me.owned.gold ?? next.gold,
          diamonds: me.owned.diamonds ?? next.diamonds,
        };
        if (
          synced.gold !== next.gold ||
          synced.diamonds !== next.diamonds
        ) {
          saveOwned(synced);
          setOwned(synced);
        }
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
    setUser(u);
    const next = mergeOwnedFromServer(u);
    setOwned(next);
    // Логин = жест пользователя → сразу запускаем музыку меню
    unlockSfx();
    void startMenuMusic();
    void (async () => {
      try {
        const { user: synced } = await apiUpdateMe(t, {
          owned: next,
          heroId: next.heroId,
        });
        updateCachedUser(synced);
        setUser(synced);
      } catch {
        /* offline */
      }
    })();
    setScreen("menu");
  };

  const logout = () => {
    clearSession();
    setToken(null);
    setUser(null);
    setScreen("menu");
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
    const isCampaign = screenRef.current === "battle_campaign";
    const isArena = screenRef.current === "battle_arena";
    const isPvp = screenRef.current === "battle_pvp";
    const fledPvp = isPvp && pvpFledRef.current;
    if (fledPvp) pvpFledRef.current = false;

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

    // Тропа: только XP (+ вехи). Арена: своя таблица. PvP: повышенные XP/золото (без алмазов).
    let res = applyBattleResult(ownedRef.current, won, {
      xpOnly: isCampaign,
      pvp: isPvp,
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
      } else {
        setCampaign(applyCampaignLoss(campaignRef.current));
      }
    }

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
      const flee = recordPvpFlee();
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
    setPvpState(null);
    setPvpClock({
      turnEndsAt: null,
      yourTimeouts: 0,
      foeTimeouts: 0,
      maxTimeouts: PVP_MAX_TIMEOUTS,
      turnLimitSec: PVP_TURN_SEC,
      endMessage: null,
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

  const alreadyHasOracle = Boolean(owned.homeFaction || user.heroId);
  if (
    !user.displayName ||
    (user.needsOnboarding && !alreadyHasOracle)
  ) {
    return (
      <OnboardingScreen
        owned={owned}
        initialName={user.displayName ?? ""}
        onComplete={finishOnboarding}
      />
    );
  }

  const hero = getHero(activeHeroId(owned));
  const displayName = user.displayName;
  const level = playerLevel(owned);
  const foeLevel = botLevelNear(level);

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
    const foeHero =
      vsBot || vsCamp || vsArena
        ? botHeroIdFor(yourHero, foeLv)
        : "hero_hell";
    const foeSchool = getHero(foeHero).faction;
    // Раунд из прогресса хаба (не из стейта кнопки — иначе гонка setState).
    const fightRound = vsArena ? arena.cleared + 1 : arenaRound;
    const arenaMods = vsArena
      ? arenaModsForRound(arena, fightRound)
      : null;
    return (
      <Battle
        key={vsArena ? `arena-${arena.day}-${fightRound}` : undefined}
        yourDeck={battleDeck(owned)}
        enemyDeck={botDeckForLevel(foeLv, foeSchool)}
        yourHeroId={yourHero}
        enemyHeroId={foeHero}
        yourName={displayName}
        yourLevel={level}
        enemyLevel={foeLv}
        prepareBattle={
          arenaMods
            ? (s) => applyArenaRules(s, arenaMods)
            : undefined
        }
        allowRematch={!vsArena && !vsCamp}
        exitPolicy={vsCamp || vsArena ? "defeat" : "free"}
        resultExitLabel={(won) => {
          if (vsArena) {
            if (won && arena.cleared < ARENA_ROUNDS) {
              return `К правилам боя ${arena.cleared + 1}`;
            }
            return "В меню арены";
          }
          if (vsCamp) return "К карте тропы";
          if (vsBot) return "К одиночному бою";
          return "В меню";
        }}
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
        key={`pvp-${pvpSeat}`}
        yourDeck={battleDeck(owned)}
        enemyDeck={battleDeck(owned)}
        yourHeroId={pvpState.you.heroId}
        enemyHeroId={pvpState.enemy.heroId}
        yourName={pvpState.you.name}
        yourLevel={level}
        enemyLevel={level}
        externalState={pvpState}
        network={{
          sendAction: (action) => {
            try {
              sock.action(action);
            } catch {
              /* ignore */
            }
          },
          turnEndsAt: pvpClock.turnEndsAt,
          yourTimeouts: pvpClock.yourTimeouts,
          foeTimeouts: pvpClock.foeTimeouts,
          maxTimeouts: pvpClock.maxTimeouts,
          turnLimitSec: pvpClock.turnLimitSec,
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
        onBack={() => setScreen("menu")}
        onFightBot={() => {
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
          turnEndsAt,
          yourTimeouts,
          foeTimeouts,
          maxTimeouts,
          turnLimitSec,
        }) => {
          pvpFledRef.current = false;
          pvpSocketRef.current = socket;
          setPvpSeat(youAre);
          setPvpState(state);
          setPvpClock({
            turnEndsAt,
            yourTimeouts,
            foeTimeouts,
            maxTimeouts,
            turnLimitSec,
            endMessage: null,
          });
          socket.setHandler((msg: PvpServerMsg) => {
            if (msg.type === "battle") {
              setPvpState(msg.state);
              setPvpClock((c) => ({
                ...c,
                turnEndsAt: msg.turnEndsAt,
                yourTimeouts: msg.yourTimeouts,
                foeTimeouts: msg.foeTimeouts,
                maxTimeouts: msg.maxTimeouts,
                turnLimitSec: msg.turnLimitSec,
              }));
            }
            if (msg.type === "ended") {
              setPvpClock((c) => ({
                ...c,
                turnEndsAt: null,
                endMessage: msg.message,
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
        heroName={hero.name}
        displayName={displayName}
        gold={owned.gold ?? 0}
        diamonds={owned.diamonds ?? 0}
        showDev={devToolsOn}
        onSolo={() => {
          setCampaign(refreshCampaignDay(campaignRef.current));
          setScreen("campaign");
        }}
        onArena={() => {
          setArena(refreshArenaDay(arenaRef.current));
          setScreen("arena");
        }}
        onMulti={() => setScreen("multi")}
        onCabinet={() => setScreen("cabinet")}
        onCollection={() => setScreen("collection")}
        onDailies={() => setScreen("dailies")}
        onDev={() => setScreen("dev")}
        onEnableDev={() => {
          setDevToolsEnabled(true);
          setDevToolsOn(true);
        }}
        onLogout={logout}
        owned={owned}
        onOwnedChange={updateOwned}
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
