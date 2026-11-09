import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { CardView, EmptySlot } from "./CardView";
import { alog } from "../game/actionLog";
import { GameIcon, SchoolBadge } from "./GameIcon";
import { ManaBar } from "./ManaBar";
import {
  PATTERN_LABEL,
  creatureGender,
  formatManaCost,
  getCard,
  isFemaleWarrior,
} from "../game/cards";
import { canPay } from "../game/mana";
import {
  angelHealReady,
  arbiterFlexReady,
  attackFxPreview,
  attackWith,
  battleManaCost,
  forwardAttackTarget,
  balthazarFlexReady,
  bansheeFlexReady,
  buffWithMage,
  createBattle,
  endEnemyTurn,
  endPlayerTurn,
  healWithAngel,
  leshyFlexReady,
  mageFlexReady,
  mermaidFlexReady,
  necroFlexReady,
  hornetQueenFlexReady,
  moveFlexReady,
  moveUnitToEmptySlot,
  paladinFlexReady,
  playCard,
  playGuardianBond,
  playMarionette,
  marionetteIsRanged,
  marionetteTargetOk,
  gravediggerFlexReady,
  recentGraveCreatures,
  reviveWithGravedigger,
  selectHand,
  selectSlot,
  shieldWithPaladin,
  sleepWithMermaid,
  sleepWithSuccubus,
  allyValidForSpell,
  spellTargetMode,
  stunWithBanshee,
  succubusFlexReady,
  summonAquiliteWithTriton,
  summonHornetWithQueen,
  summonSkeletonWithNecro,
  swapEnemyWithBalthazar,
  swapStatsWithLeshy,
  takeAiStep,
  tritonFlexReady,
  validAttackTargets,
  verdictWithArbiter,
  BLOOD_FRENZY_AFTER_TURNS,
  normalizeBattleFx,
  type BattleFx,
} from "../game/engine";
import { getHero, orakulArtUrl } from "../game/heroes";
import {
  fadeOutBattleMusic,
  isSfxMuted,
  playActionSfx,
  playResultSfx,
  setSfxMuted,
  sfxLose,
  sfxTurn,
  sfxWin,
  startBattleMusic,
  unlockSfx,
} from "../game/sfx";
import {
  BATTLE_TUTORIAL_TIPS,
  hasSeenBattleTutorial,
  markBattleTutorialSeen,
} from "../game/battleTutorial";
import {
  applyPvpAction,
  PVP_OPENING_MS,
  type PvpAction,
} from "../game/pvpProtocol";
import type { BattleState, CreatureInstance } from "../game/types";

type NetAction = PvpAction | ((s: BattleState) => PvpAction | null);

type BattleEndInfo = {
  won: boolean;
  xpGained: number;
  gainedLevels: number;
  goldReward: number;
  diamondReward: number;
  giftLine?: string | null;
  /** Праздничный заголовок (например полное прохождение арены). */
  resultEyebrow?: string | null;
  resultTitle?: string | null;
  resultLead?: string | null;
  celebration?: boolean;
};

type Props = {
  yourDeck: string[];
  enemyDeck: string[];
  yourHeroId?: string;
  enemyHeroId?: string;
  yourName?: string;
  yourLevel?: number;
  enemyLevel?: number;
  /** После createBattle — арена и др. модификаторы. */
  prepareBattle?: (state: BattleState) => BattleState;
  /** Скрыть «Ещё раз» (забеги с прогрессом). */
  allowRematch?: boolean;
  /**
   * free — вышел и всё (бот в «одиночном бое»).
   * defeat — подтверждение, выход = поражение (тропа / арена).
   * PvP подтверждает сам onExit (leavePvp).
   */
  exitPolicy?: "free" | "defeat";
  /** Подпись кнопки после боя (или от победы/поражения). */
  resultExitLabel?: string | ((won: boolean) => string);
  /** Подпись кнопки реванша (по умолчанию «Ещё раз»). */
  rematchLabel?: string;
  /** Стиль ИИ (из генератора соперника). */
  aiPersona?: BattleState["aiPersona"];
  /** Seed боя для разброса ходов ИИ. */
  aiSeed?: number;
  /**
   * Реванш с новым соперником: родитель обновляет колоду/ключ.
   * Если нет — просто перезапуск с теми же пропами.
   */
  onRematch?: () => void;
  /** Сетевой бой: стейт с сервера + отправка действий. */
  network?: {
    sendAction: (action: PvpAction) => void;
    turnEndsAt?: number | null;
    yourTimeouts?: number;
    foeTimeouts?: number;
    maxTimeouts?: number;
    turnLimitSec?: number;
    openingDice?: { you: number; foe: number; youFirst: boolean } | null;
    openingLocked?: boolean;
    needRoll?: boolean;
    youRolled?: boolean;
    foeRolled?: boolean;
    ended?: boolean;
    rollDice?: () => void;
    exitLabel?: string;
  };
  /** Подмена стейта с сервера (каждый тик PvP). */
  externalState?: BattleState | null;
  onExit: () => void;
  /** Верни награды — покажем в окне результата. */
  onBattleEnd?: (won: boolean) => BattleEndInfo | void;
  /** Перед поражением из‑за выхода (тропа/арена). */
  onForfeitExit?: () => void;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const DIE_FACE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

type FxImpact = "arrow" | "burn" | "magic" | "poison";

/** Снаряд по DOM-точкам — WAAPI (iOS не любит var() в keyframes). */
function BattleMissile({
  className,
  kind,
  boardRef,
  fromSide,
  fromSlot,
  toSlot,
  hitHero,
  hitSlots,
}: {
  className: string;
  kind: "arrow" | "bolt" | "magic" | "poison";
  boardRef: RefObject<HTMLDivElement | null>;
  fromSide: "you" | "enemy";
  fromSlot?: number;
  toSlot?: number;
  hitHero?: boolean;
  hitSlots?: number[];
}) {
  const elRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = elRef.current;
    const board = boardRef.current;
    if (!el || !board) return;

    const boardRect = board.getBoundingClientRect();
    const mid = (node: Element | null) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return {
        x: r.left + r.width / 2 - boardRect.left,
        y: r.top + r.height / 2 - boardRect.top,
      };
    };

    // Заклинание без fromSlot — из оракула кастера, не из случайного слота 2.
    const fromEl =
      fromSlot != null
        ? board.querySelector(`[data-board-drop="${fromSide}:${fromSlot}"]`)
        : board.querySelector(
            fromSide === "you"
              ? ".you-oracle-bar .oracle-block"
              : ".enemy-oracle-bar .oracle-block",
          );
    const toSide = fromSide === "you" ? "enemy" : "you";
    const targetSlot = hitSlots?.[0] ?? toSlot;
    const toEl = hitHero
      ? board.querySelector(
          fromSide === "you"
            ? ".enemy-oracle-bar .oracle-block"
            : ".you-oracle-bar .oracle-block",
        )
      : targetSlot != null
        ? board.querySelector(`[data-board-drop="${toSide}:${targetSlot}"]`)
        : null;

    const from = mid(fromEl) ?? {
      x: boardRect.width * (fromSlot != null ? 0.12 + fromSlot * 0.19 : 0.5),
      y: fromSide === "you" ? boardRect.height * 0.92 : boardRect.height * 0.08,
    };
    const to = mid(toEl) ?? {
      x: boardRect.width * (0.12 + (targetSlot ?? 2) * 0.19),
      y: hitHero
        ? fromSide === "you"
          ? boardRect.height * 0.06
          : boardRect.height * 0.94
        : fromSide === "you"
          ? boardRect.height * 0.22
          : boardRect.height * 0.78,
    };

    const angle =
      (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
    // Стрела «торчит» чуть глубже в карту
    const embed = kind === "arrow" ? 10 : 0;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const stickX = to.x + (dx / len) * embed;
    const stickY = to.y + (dy / len) * embed;

    el.style.left = "0";
    el.style.top = "0";
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (kind === "arrow") {
      const flyMs = reduce ? 160 : 420;
      const stickMs = reduce ? 200 : 780;
      const fly = el.animate(
        [
          {
            transform: `translate(${from.x}px, ${from.y}px) rotate(${angle}deg) scale(0.75)`,
            opacity: 0.4,
          },
          {
            transform: `translate(${from.x}px, ${from.y}px) rotate(${angle}deg) scale(1)`,
            opacity: 1,
            offset: 0.08,
          },
          {
            transform: `translate(${stickX}px, ${stickY}px) rotate(${angle}deg) scale(1)`,
            opacity: 1,
          },
        ],
        {
          duration: flyMs,
          easing: "cubic-bezier(0.15, 0.7, 0.2, 1)",
          fill: "forwards",
        },
      );
      let stick: Animation | null = null;
      fly.finished
        .then(() => {
          stick = el.animate(
            [
              {
                transform: `translate(${stickX}px, ${stickY}px) rotate(${angle}deg)`,
                opacity: 1,
              },
              {
                transform: `translate(${stickX}px, ${stickY}px) rotate(${angle + 3}deg)`,
                opacity: 1,
                offset: 0.55,
              },
              {
                transform: `translate(${stickX}px, ${stickY}px) rotate(${angle}deg)`,
                opacity: 0,
              },
            ],
            { duration: stickMs, easing: "ease-out", fill: "forwards" },
          );
        })
        .catch(() => {});
      return () => {
        fly.cancel();
        stick?.cancel();
      };
    }

    const duration = reduce ? 180 : kind === "poison" ? 620 : 520;
    const anim = el.animate(
      [
        {
          transform: `translate(${from.x}px, ${from.y}px) scale(0.4)`,
          opacity: 0.35,
        },
        {
          transform: `translate(${from.x}px, ${from.y}px) scale(1.05)`,
          opacity: 1,
          offset: 0.1,
        },
        {
          transform: `translate(${to.x}px, ${to.y}px) scale(1.4)`,
          opacity: 0.85,
          offset: 0.82,
        },
        {
          transform: `translate(${to.x}px, ${to.y}px) scale(0.3)`,
          opacity: 0,
        },
      ],
      {
        duration,
        easing: "cubic-bezier(0.2, 0.75, 0.25, 1)",
        fill: "forwards",
      },
    );
    return () => anim.cancel();
  }, [
    boardRef,
    className,
    kind,
    fromSide,
    fromSlot,
    toSlot,
    hitHero,
    hitSlots,
  ]);

  return (
    <span ref={elRef} className={className} aria-hidden>
      {kind === "arrow" ? (
        <>
          <span className="missile-arrow-fletch" />
          <span className="missile-arrow-shaft" />
          <span className="missile-arrow-head" />
        </>
      ) : kind === "poison" ? (
        <>
          <span className="missile-poison-core" />
          <span className="missile-poison-drip" />
        </>
      ) : (
        <span className="missile-glow-core" />
      )}
    </span>
  );
}

function BoardCard({
  creature,
  selected,
  targetable,
  ready,
  sleeping,
  lunge,
  nod,
  hit,
  poisonBurst,
  impact,
  playIn,
  heal,
  onClick,
}: {
  creature: CreatureInstance;
  selected?: boolean;
  targetable?: boolean;
  ready?: boolean;
  sleeping?: boolean;
  lunge?: boolean;
  /** Лёгкий кивок вместо укола (дальник / болт). */
  nod?: boolean;
  hit?: boolean;
  poisonBurst?: boolean;
  /** Эффект на цели: стрела / огонь / магия / яд. */
  impact?: FxImpact | null;
  playIn?: boolean;
  heal?: boolean;
  onClick: () => void;
}) {
  const poisoned = creature.statuses.some((st) => st.type === "poison");
  const showPoison = poisoned || impact === "poison" || poisonBurst;
  return (
    <div
      className={[
        "board-card-wrap",
        selected ? "is-selected" : "",
        targetable ? "is-target" : "",
        ready ? "is-ready" : "",
        sleeping ? "is-sleeping" : "",
        lunge ? "is-lunge" : "",
        nod ? "is-nod" : "",
        hit ? "is-hit" : "",
        poisonBurst ? "is-poison-burst" : "",
        showPoison ? "has-poison" : "",
        impact === "burn" ? "is-burning" : "",
        impact === "magic" ? "is-magic-burn" : "",
        playIn ? "is-play-in" : "",
        heal ? "is-heal" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <CardView
        cardId={creature.cardId}
        board
        selected={selected}
        liveAttack={creature.attack}
        liveHealth={creature.health}
        maxAttack={
          creature.baseAttack + creature.permAttack + (creature.packBonus ?? 0)
        }
        maxHealth={
          creature.baseHealth +
          creature.permHealth +
          (creature.packBonus ?? 0) +
          (creature.auraHp ?? 0)
        }
        permAttack={creature.permAttack}
        permHealth={creature.permHealth}
        packBonus={creature.packBonus}
        statuses={creature.statuses}
        canAttack={ready}
        flippable
        onClick={onClick}
      />
      {sleeping && <span className="sleep-tag">сон</span>}
      {impact === "burn" ? (
        <span className="fx-burn-layer" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : null}
      {impact === "magic" ? (
        <span className="fx-magic-layer" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      ) : null}
      {showPoison ? (
        <span className="fx-poison-smoke" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : null}
    </div>
  );
}

export function Battle({
  yourDeck,
  enemyDeck,
  yourHeroId = "hero_life",
  enemyHeroId = "hero_hell",
  yourName = "Ты",
  yourLevel = 1,
  enemyLevel = yourLevel,
  prepareBattle,
  allowRematch = true,
  exitPolicy = "free",
  resultExitLabel,
  rematchLabel = "Ещё раз",
  aiPersona,
  aiSeed,
  onRematch,
  network,
  externalState = null,
  onExit,
  onBattleEnd,
  onForfeitExit,
}: Props) {
  const bootBattle = () => {
    if (externalState) return externalState;
    const raw = createBattle(
      yourDeck,
      enemyDeck,
      yourHeroId,
      enemyHeroId,
      yourName,
      yourLevel,
      enemyLevel,
    );
    if (aiPersona) raw.aiPersona = aiPersona;
    if (aiSeed != null) raw.aiSeed = aiSeed;
    return prepareBattle ? prepareBattle(raw) : raw;
  };
  const [state, setState] = useState<BattleState>(() => bootBattle());
  const networkRef = useRef(network);
  networkRef.current = network;
  const [turnLeftSec, setTurnLeftSec] = useState<number | null>(null);
  const youLevelNow = state.you.level ?? yourLevel;
  const enemyLevelNow = state.enemy.level ?? enemyLevel;

  useEffect(() => {
    if (!network?.turnEndsAt || state.winner) {
      setTurnLeftSec(null);
      return;
    }
    const tick = () => {
      const left = Math.max(
        0,
        Math.ceil((network.turnEndsAt! - Date.now()) / 1000),
      );
      setTurnLeftSec(left);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [network?.turnEndsAt, state.winner, state.active, state.turn]);
  const yourHero = getHero(state.you.heroId);
  const enemyHero = getHero(state.enemy.heroId);
  const [fx, setFx] = useState<BattleFx | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [pvpAwaiting, setPvpAwaiting] = useState(false);
  const [phase, setPhase] = useState<"you" | "enemy">(() =>
    externalState?.active === "enemy" ? "enemy" : "you",
  );
  const [sfxOff, setSfxOff] = useState(() => isSfxMuted());
  const [reward, setReward] = useState<BattleEndInfo | null>(null);
  const [entered, setEntered] = useState(false);
  const [showResult, setShowResult] = useState(false);
  /** Бальтазар: первая карта врага для обмена */
  const [balthSwapFrom, setBalthSwapFrom] = useState<number | null>(null);
  /** Страж: первый клик — кто принимает урон */
  const [guardianTankSlot, setGuardianTankSlot] = useState<number | null>(null);
  /** Марионетка: слот куклы врага */
  const [marionettePuppet, setMarionettePuppet] = useState<number | null>(null);
  /** Могильщик: индекс выбранной карты в грейве */
  const [gravePickIdx, setGravePickIdx] = useState<number | null>(null);
  /**
   * Банши/русалка/сукуб/леший: напротив по умолчанию бьют.
   * Режим «умение» — оглушить/усыпить/обмен и по клетке напротив.
   */
  const [flexIntent, setFlexIntent] = useState<"strike" | "skill">("strike");
  const stateRef = useRef(state);
  stateRef.current = state;

  /** Перетаскивание карты из руки на поле */
  const [handDrag, setHandDrag] = useState<{
    index: number;
    cardId: string;
    x: number;
    y: number;
    magnet: { side: "you" | "enemy"; slot: number } | null;
  } | null>(null);
  /** Счётчик: без него дроп не срабатывает, если карта уже была выбрана в начале драга */
  const [dropSeq, setDropSeq] = useState(0);
  const handDragMoved = useRef(false);
  /** pending → scroll (вбок по карте) | drag (вверх на стол) */
  const handGestureMode = useRef<"pending" | "scroll" | "drag">("pending");
  const handDragStart = useRef<{
    x: number;
    y: number;
    index: number;
    cardId: string;
    pointerId: number;
  } | null>(null);
  const handDragUnbind = useRef<(() => void) | null>(null);
  const handZoneRef = useRef<HTMLDivElement | null>(null);
  const handDragGhostRef = useRef<HTMLDivElement | null>(null);
  const dropAfterSelectRef = useRef<{
    side: "you" | "enemy";
    slot: number;
  } | null>(null);

  const clearHandDragLock = () => {
    document.documentElement.classList.remove("is-hand-dragging");
  };

  const findBoardDropAt = (
    x: number,
    y: number,
    cardId?: string,
  ): { side: "you" | "enemy"; slot: number; cx: number; cy: number } | null => {
    const card = cardId ? getCard(cardId) : null;
    const live = stateRef.current;
    const allowSide = (side: string, slot: number) => {
      if (side !== "you" && side !== "enemy") return false;
      if (!Number.isFinite(slot) || slot < 0 || slot > 4) return false;
      // Существо — только в пустой свой слот
      if (card?.kind === "creature") {
        if (side !== "you") return false;
        if (live.you.slots[slot]) return false;
        return true;
      }
      // Заклинание без цели / с целью — пусть клик-логика разберёт; магнит к обеим сторонам
      return true;
    };

    let best: {
      side: "you" | "enemy";
      slot: number;
      dist: number;
      cx: number;
      cy: number;
    } | null = null;

    for (const node of document.querySelectorAll("[data-board-drop]")) {
      const raw = node.getAttribute("data-board-drop") || "";
      const [side, slotStr] = raw.split(":");
      const slot = Number(slotStr);
      if (!allowSide(side, slot)) continue;
      const r = (node as HTMLElement).getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dist = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      // Широкий магнит — на телефоне слоты мелкие
      const radius = Math.max(72, Math.max(r.width, r.height) * 1.35);
      if (dist > radius * radius) continue;
      if (!best || dist < best.dist) {
        best = {
          side: side as "you" | "enemy",
          slot,
          dist,
          cx,
          cy,
        };
      }
    }
    return best
      ? { side: best.side, slot: best.slot, cx: best.cx, cy: best.cy }
      : null;
  };

  useEffect(() => {
    return () => {
      handDragUnbind.current?.();
      handDragUnbind.current = null;
      clearHandDragLock();
    };
  }, []);
  /** Подсказки первого боя — в PvP не мешаем дуэли. */
  const [tutorialStep, setTutorialStep] = useState<number | null>(() =>
    network || hasSeenBattleTutorial() ? null : 0,
  );
  const [diceUi, setDiceUi] = useState<"hidden" | "prompt" | "wait" | "result">(
    () =>
      network?.needRoll || network?.openingLocked ? "prompt" : "hidden",
  );
  const diceDoneRef = useRef(false);
  const [spinFace, setSpinFace] = useState(1);
  const [tutorialSpot, setTutorialSpot] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const lock = useRef(false);
  const rewarded = useRef(false);
  const onBattleEndRef = useRef(onBattleEnd);
  onBattleEndRef.current = onBattleEnd;

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!network) return;
    // Кто ещё не бросил — всегда кнопка. Хост бросил ≠ гость тоже бросил.
    if (network.needRoll) {
      diceDoneRef.current = false;
      setDiceUi((ui) => (ui === "wait" ? "wait" : "prompt"));
      return;
    }
    if (network.openingLocked && network.openingDice) {
      setDiceUi("result");
      return;
    }
    if (network.openingLocked) {
      setDiceUi("wait");
      return;
    }
    // Сервер открыл ход — сразу снимаем оверлей, иначе карты «не ставятся».
    diceDoneRef.current = true;
    setDiceUi("hidden");
  }, [
    network?.needRoll,
    network?.youRolled,
    network?.openingLocked,
    network?.openingDice,
  ]);

  useEffect(() => {
    if (diceUi !== "wait") return;
    const id = window.setInterval(() => {
      setSpinFace((n) => (n % 6) + 1);
    }, 70);
    return () => window.clearInterval(id);
  }, [diceUi]);

  useEffect(() => {
    if (diceUi !== "result") return;
    const t = window.setTimeout(() => {
      diceDoneRef.current = true;
      setDiceUi("hidden");
    }, PVP_OPENING_MS);
    return () => window.clearTimeout(t);
  }, [diceUi]);

  useEffect(() => {
    if (!externalState) return;
    // Стол с сервера — winner больше не вычищаем (иначе при потере `ended`
    // проигравший навечно «ждёт хода» без оверлея).
    const next = externalState;
    const matchOver = Boolean(next.winner) || Boolean(network?.ended);
    const keepBusy =
      !matchOver && lock.current && next.active === "you";
    stateRef.current = next;
    setState(next);
    setPhase(next.active === "you" ? "you" : "enemy");
    setPvpAwaiting(false);
    // Стол всегда с сервера. Busy не сбрасываем посреди своей анимации.
    if (keepBusy) return;
    setBusy(false);
    lock.current = false;
  }, [externalState, network, network?.ended]);

  useLayoutEffect(() => {
    if (tutorialStep == null || state.winner) {
      setTutorialSpot(null);
      return;
    }
    const tip = BATTLE_TUTORIAL_TIPS[tutorialStep];
    if (!tip) {
      setTutorialSpot(null);
      return;
    }
    const measure = () => {
      let el = document.querySelector(
        `[data-tut="${tip.target}"]`,
      ) as HTMLElement | null;
      if (!el && tip.target === "hand-card") {
        el = document.querySelector(
          `[data-tut="hand"]`,
        ) as HTMLElement | null;
      }
      if (!el) {
        setTutorialSpot(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 2 && r.height < 2) {
        setTutorialSpot(null);
        return;
      }
      const pad = 10;
      setTutorialSpot({
        top: r.top - pad,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      });
    };
    measure();
    const raf = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [tutorialStep, state.winner, state.you.hand.length]);

  useEffect(() => {
    if (!state.winner || rewarded.current) return;
    // PvP: оверлей по server winner; ended желателен, но не обязателен.
    rewarded.current = true;
    const won = state.winner === "you";
    try {
      const info = onBattleEndRef.current?.(won);
      if (info) setReward(info);
    } catch {
      /* награды не должны блокировать табличку */
    }
    let shown = false;
    const reveal = () => {
      if (shown) return;
      shown = true;
      setShowResult(true);
      if (won) sfxWin();
      else sfxLose();
    };
    const fallback = window.setTimeout(reveal, 1400);
    void fadeOutBattleMusic(900).finally(() => {
      window.clearTimeout(fallback);
      reveal();
    });
  }, [state.winner, network?.ended]);

  // Блокировка только по серверу. diceUi сам по себе ход не держит —
  // иначе после кубика рука навсегда «hand-locked» и карты не ставятся.
  const pvpHold = Boolean(
    network && (network.openingLocked || network.needRoll),
  );
  const actionBlocked =
    busy ||
    pvpAwaiting ||
    pvpHold ||
    !!state.winner ||
    state.active !== "you";

  const spellMode = spellTargetMode(state);
  const marionettePuppetUnit =
    marionettePuppet != null ? state.enemy.slots[marionettePuppet] : null;
  const marionetteRanged = !!(
    marionettePuppetUnit &&
    marionetteIsRanged(marionettePuppetUnit.cardId, marionettePuppetUnit)
  );
  const attackTargets = useMemo(() => {
    if (state.selectedSlot == null) return new Set<string>();
    return new Set(validAttackTargets(state, state.selectedSlot).map(String));
  }, [state]);

  const runLocked = async (fn: () => Promise<void>) => {
    if (lock.current || busy) return;
    lock.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      setFx(null);
      setBusy(false);
      lock.current = false;
    }
  };

  const playFx = async (
    rawFx: BattleFx,
    /** Применить к актуальному state (не к устаревшему из замыкания клика). */
    run: (s: BattleState) => BattleState,
    holdMs = 900,
    netAction?: NetAction,
  ) => {
    unlockSfx();
    const nextFx = normalizeBattleFx(rawFx);
    const before = stateRef.current;
    const isSpellCard = nextFx.kind === "spell" && !!nextFx.cardId;
    const instant = nextFx.kind === "spell" || nextFx.kind === "heal";
    const online = Boolean(networkRef.current);
    const flying =
      (nextFx.kind === "lunge" &&
        (nextFx.motion === "ranged" || nextFx.motion === "bolt")) ||
      (nextFx.kind === "spell" &&
        (nextFx.vfx === "poison" || nextFx.vfx === "magic") &&
        (!!nextFx.hitHero ||
          nextFx.toSlot != null ||
          (Array.isArray(nextFx.hitSlots) && nextFx.hitSlots.length > 0)));
    setFx(nextFx);
    playActionSfx(nextFx, before);
    const apply = () => {
      // PvP: тот же applyPvpAction, что на сервере. Без «подождать 1.6с» —
      // иначе handIndex устаревает, доп. мана не списывается и откатывается.
      if (networkRef.current) {
        const action =
          typeof netAction === "function"
            ? netAction(stateRef.current)
            : netAction;
        if (!action) {
          console.error("[battle] PvP без типизированного хода");
          alog("pvp", "apply.missingAction", { fx: nextFx.kind });
          setFx(null);
          return stateRef.current;
        }
        let after: BattleState;
        try {
          after = applyPvpAction(stateRef.current, action);
          alog("pvp", "apply.ok", {
            type: (action as { type?: string }).type,
            turn: after.turn,
            active: after.active,
            log0: after.log[0],
          });
        } catch (e) {
          console.error("[battle] PvP apply fail:", e);
          alog("error", "pvp.apply.fail", {
            err: e instanceof Error ? e.message : String(e),
            action,
          });
          setFx(null);
          return stateRef.current;
        }
        if (after.winner) after = { ...after, winner: null };
        stateRef.current = after;
        setState(after);
        playResultSfx(before, after);
        try {
          networkRef.current.sendAction(action);
        } catch (e) {
          console.error("[battle] net send fail:", e);
          alog("error", "pvp.send.fail", {
            err: e instanceof Error ? e.message : String(e),
          });
        }
        return after;
      }
      let after: BattleState;
      try {
        after = run(stateRef.current);
        alog("battle", "apply.ok", {
          fx: nextFx.kind,
          cardId: nextFx.cardId,
          turn: after.turn,
          active: after.active,
          winner: after.winner,
          log0: after.log[0],
        });
      } catch (e) {
        console.error("[battle] apply fail:", e);
        alog("error", "battle.apply.fail", {
          err: e instanceof Error ? e.message : String(e),
          fx: nextFx.kind,
        });
        setFx(null);
        return stateRef.current;
      }
      stateRef.current = after;
      setState(after);
      playResultSfx(before, after);
      return after;
    };
    // В сети ход сразу — анимация после. Оффлайн спеллы как раньше (сначала карта).
    if (online) {
      apply();
      const hold = isSpellCard
        ? Math.max(holdMs, 1400)
        : instant
          ? Math.max(holdMs, 900)
          : nextFx.hitHero && nextFx.kind !== "heal"
            ? Math.max(holdMs, 1400)
            : holdMs;
      await sleep(hold);
      setFx(null);
      await sleep(200);
      return;
    }
    if (isSpellCard) {
      // Сначала спокойно появляется карта, потом эффект на столе.
      const hold = Math.max(holdMs, 3000);
      await sleep(1600);
      apply();
      await sleep(hold - 1600);
      setFx(null);
      await sleep(280);
      return;
    }
    if (instant) {
      apply();
      await sleep(Math.max(holdMs, 1200));
      setFx(null);
      await sleep(220);
      return;
    }
    const faceHit = !!nextFx.hitHero && nextFx.kind !== "heal";
    const arrowStick = flying && nextFx.motion === "ranged";
    const hold = flying
      ? Math.max(
          holdMs,
          faceHit ? 1700 : arrowStick ? 1500 : nextFx.vfx === "poison" ? 1400 : 1200,
        )
      : faceHit
        ? Math.max(holdMs, 1800)
        : holdMs;
    await sleep(Math.floor(hold * (flying ? 0.45 : 0.4)));
    apply();
    await sleep(Math.floor(hold * (flying ? 0.55 : 0.6)));
    setFx(null);
    await sleep(faceHit ? 320 : 200);
  };

  const isEnemyLog = (line: string) =>
    line.startsWith("Соперник") ||
    line.startsWith("Ход соперника") ||
    line.startsWith("AI");

  const enemyLog = state.log.filter(isEnemyLog).slice(0, 20);
  const youLog = state.log.filter((line) => !isEnemyLog(line)).slice(0, 20);

  const pushHint = (text: string) => {
    setState((s) => ({
      ...s,
      log: [text, ...s.log].slice(0, 12),
    }));
  };

  /** Не крутить анимацию, если маны не хватает — сразу понятный текст. */
  const assertHandMana = (
    handIndex: number,
    opts?: { clearHand?: boolean },
  ): boolean => {
    const cardId = state.you.hand[handIndex]!;
    const card = getCard(cardId);
    const cost = battleManaCost(state, cardId);
    if (canPay(state.you.mana, cost)) return true;
    const msg = `Недостаточно маны для «${card.name}» (нужно ${formatManaCost(cost)})`;
    setState((s) => {
      const base = opts?.clearHand ? selectHand(s, null) : s;
      return { ...base, log: [msg, ...base.log].slice(0, 12) };
    });
    return false;
  };

  const onHandClick = (i: number) => {
    if (actionBlocked) return;
    setGuardianTankSlot(null);
    setMarionettePuppet(null);
    setBalthSwapFrom(null);
    const card = getCard(state.you.hand[i]);
    if (!assertHandMana(i)) return;
    if (card.kind === "spell") {
      const need = spellTargetMode({ ...state, selectedHand: i });
      // Без цели (доп. мана, доп. карта…): 1-й клик — выбор, 2-й — каст.
      // Иначе «посмотреть» = сразу сработала.
      if (!need) {
        if (state.selectedHand !== i) {
          setState(selectHand(state, i));
          return;
        }
        const cardId = state.you.hand[i]!;
        void runLocked(async () => {
          await playFx(
            { side: "you", kind: "spell", cardId },
            (s) => {
              const idx =
                s.you.hand[i] === cardId
                  ? i
                  : s.you.hand.indexOf(cardId);
              if (idx < 0) return s;
              return playCard(s, idx, null);
            },
            1400,
            (s) => {
              const idx =
                s.you.hand[i] === cardId
                  ? i
                  : s.you.hand.indexOf(cardId);
              if (idx < 0) return null;
              return { kind: "playCard", handIndex: idx, slotIndex: null };
            },
          );
        });
        return;
      }
      setState(selectHand(state, state.selectedHand === i ? null : i));
      return;
    }
    setState(selectHand(state, state.selectedHand === i ? null : i));
  };

  const angelHealing =
    state.selectedSlot != null && angelHealReady(state, state.selectedSlot);
  const mageReady =
    state.selectedSlot != null && mageFlexReady(state, state.selectedSlot);
  const paladinReady =
    state.selectedSlot != null && paladinFlexReady(state, state.selectedSlot);
  const gravediggerReady =
    state.selectedSlot != null &&
    gravediggerFlexReady(state, state.selectedSlot);
  const graveEntries = useMemo(
    () => recentGraveCreatures(state.you.graveyard, 5),
    [state.you.graveyard],
  );
  const graveReviveReady = gravediggerReady && gravePickIdx != null;
  const tritonSummoning =
    state.selectedSlot != null && tritonFlexReady(state, state.selectedSlot);
  const mermaidReady =
    state.selectedSlot != null && mermaidFlexReady(state, state.selectedSlot);
  const succubusReady =
    state.selectedSlot != null && succubusFlexReady(state, state.selectedSlot);
  const bansheeReady =
    state.selectedSlot != null && bansheeFlexReady(state, state.selectedSlot);
  const balthazarReady =
    state.selectedSlot != null && balthazarFlexReady(state, state.selectedSlot);
  const necroReady =
    state.selectedSlot != null && necroFlexReady(state, state.selectedSlot);
  const hornetQueenReady =
    state.selectedSlot != null &&
    hornetQueenFlexReady(state, state.selectedSlot);
  const leshyReady =
    state.selectedSlot != null && leshyFlexReady(state, state.selectedSlot);
  const moveReady =
    state.selectedSlot != null && moveFlexReady(state, state.selectedSlot);

  const onYourSlot = (i: number) => {
    if (actionBlocked) return;

    const creature = state.you.slots[i];

    // Марионетка: дальник лечит / ближник бьёт твоего
    if (
      state.selectedHand != null &&
      spellMode === "marionette" &&
      marionettePuppet != null &&
      creature
    ) {
      const hand = state.selectedHand;
      const target = { kind: "ally_unit" as const, slot: i };
      if (!marionetteTargetOk(state, marionettePuppet, target)) {
        pushHint("Эта цель недоступна для выбранной куклы");
        return;
      }
      if (!assertHandMana(hand, { clearHand: true })) {
        setMarionettePuppet(null);
        return;
      }
      const puppet = marionettePuppet;
      setMarionettePuppet(null);
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "spell",
            cardId: state.you.hand[hand],
            hitSlots: [i],
          },
          (s) => playMarionette(s, hand, puppet, target),
          1600,
          {
            kind: "marionette",
            handIndex: hand,
            puppetSlot: puppet,
            target,
          },
        );
      });
      return;
    }

    // Страж: два своих — сначала кто принимает урон, потом подопечный
    if (state.selectedHand != null && spellMode === "ally_pair" && creature) {
      const hand = state.selectedHand;
      if (guardianTankSlot == null) {
        setGuardianTankSlot(i);
        pushHint(
          `Страж: ${getCard(creature.cardId).name} — теперь кликни подопечного`,
        );
        return;
      }
      if (guardianTankSlot === i) {
        setGuardianTankSlot(null);
        pushHint("Выбор стража сброшен");
        return;
      }
      const tank = guardianTankSlot;
      if (!assertHandMana(hand, { clearHand: true })) {
        setGuardianTankSlot(null);
        return;
      }
      setGuardianTankSlot(null);
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "spell",
            cardId: state.you.hand[hand],
            hitSlots: [tank, i],
          },
          (s) => playGuardianBond(s, hand, tank, i),
          1400,
          { kind: "guardianBond", handIndex: hand, tankSlot: tank, wardSlot: i },
        );
      });
      return;
    }

    // Заклинание на союзника — только если выбран режим ally
    if (state.selectedHand != null && spellMode === "ally" && creature) {
      const hand = state.selectedHand;
      const spellId = state.you.hand[hand];
      if (!allyValidForSpell(spellId, creature.cardId)) {
        setState({
          ...state,
          log: [
            spellId === "undead_bonus"
              ? "Бонус нежити: цель должна быть нежитью"
              : "Цель не подходит для этого заклинания",
            ...state.log,
          ].slice(0, 10),
        });
        return;
      }
      if (!assertHandMana(hand)) return;
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "spell",
            cardId: state.you.hand[hand],
            toSlot: i,
            hitSlots: [i],
          },
          (s) => playCard(s, hand, i),
          1400,
          { kind: "playCard", handIndex: hand, slotIndex: i },
        );
      });
      return;
    }

    // Призыв только в пустой слот
    if (state.selectedHand != null && !creature) {
      const card = getCard(state.you.hand[state.selectedHand]);
      if (card.kind === "creature") {
        const hand = state.selectedHand;
        if (!assertHandMana(hand)) return;
        void runLocked(async () => {
          await playFx(
            { side: "you", kind: "play", toSlot: i, cardId: state.you.hand[hand] },
            (s) => playCard(s, hand, i),
            850,
            { kind: "playCard", handIndex: hand, slotIndex: i },
          );
        });
        return;
      }
    }

    // Хилл ангела по союзнику
    if (
      state.selectedSlot != null &&
      state.selectedSlot !== i &&
      angelHealReady(state, state.selectedSlot) &&
      creature
    ) {
      const from = state.selectedSlot;
      void runLocked(async () => {
        await playFx(
          { side: "you", kind: "heal", fromSlot: from, toSlot: i },
          (s) => healWithAngel(s, from, i),
          900,
          { kind: "healAngel", fromSlot: from, toSlot: i },
        );
      });
        return;
      }

    // Маг жизни: +1 HP навсегда другому союзнику
    if (
      state.selectedSlot != null &&
      state.selectedSlot !== i &&
      mageFlexReady(state, state.selectedSlot) &&
      creature
    ) {
      const from = state.selectedSlot;
      void runLocked(async () => {
        await playFx(
          { side: "you", kind: "heal", fromSlot: from, toSlot: i },
          (s) => buffWithMage(s, from, i),
          900,
          { kind: "buffMage", fromSlot: from, toSlot: i },
        );
      });
      return;
    }

    // Паладин: щит союзнику
    if (
      state.selectedSlot != null &&
      state.selectedSlot !== i &&
      paladinFlexReady(state, state.selectedSlot) &&
      creature
    ) {
      const from = state.selectedSlot;
      void runLocked(async () => {
        await playFx(
          { side: "you", kind: "heal", fromSlot: from, toSlot: i },
          (s) => shieldWithPaladin(s, from, i),
          900,
          { kind: "shieldPaladin", fromSlot: from, toSlot: i },
        );
      });
      return;
    }

    // Леший: обмен ATK↔HP у союзника
    if (
      state.selectedSlot != null &&
      state.selectedSlot !== i &&
      leshyReady &&
      creature
    ) {
      const from = state.selectedSlot;
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "spell",
            fromSlot: from,
            toSlot: i,
            cardId: state.you.slots[from]!.cardId,
            hitSlots: [i],
          },
          (s) => swapStatsWithLeshy(s, from, "you", i),
          900,
          { kind: "swapLeshy", fromSlot: from, side: "you", toSlot: i },
        );
      });
      return;
    }

    // Валькирия / Акулит: перемещение на пустой свой слот
    if (
      state.selectedSlot != null &&
      moveFlexReady(state, state.selectedSlot) &&
      !creature
    ) {
      const from = state.selectedSlot;
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "play",
            fromSlot: from,
            toSlot: i,
            cardId: state.you.slots[from]!.cardId,
          },
          (s) => moveUnitToEmptySlot(s, from, i),
          850,
          { kind: "moveUnit", fromSlot: from, toSlot: i },
        );
      });
      return;
    }

    // Тритон: призвать Акулита в пустой слот
    if (
      state.selectedSlot != null &&
      tritonFlexReady(state, state.selectedSlot) &&
      !creature
    ) {
      const from = state.selectedSlot;
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "play",
            fromSlot: from,
            toSlot: i,
            cardId: "aquilite",
          },
          (s) => summonAquiliteWithTriton(s, from, i),
          900,
          { kind: "summonAquilite", fromSlot: from, toSlot: i },
        );
      });
      return;
    }

    // Некромант: призвать Скелета в пустой слот
    if (
      state.selectedSlot != null &&
      necroFlexReady(state, state.selectedSlot) &&
      !creature
    ) {
      const from = state.selectedSlot;
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "play",
            fromSlot: from,
            toSlot: i,
            cardId: "skeleton",
          },
          (s) => summonSkeletonWithNecro(s, from, i),
          900,
          { kind: "summonSkeleton", fromSlot: from, toSlot: i },
        );
      });
      return;
    }

    // Матка шершней: создать Шершня-воина в пустой слот
    if (
      state.selectedSlot != null &&
      hornetQueenFlexReady(state, state.selectedSlot) &&
      !creature
    ) {
      const from = state.selectedSlot;
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "play",
            fromSlot: from,
            toSlot: i,
            cardId: "hornet_warrior",
          },
          (s) => summonHornetWithQueen(s, from, i),
          900,
          { kind: "summonHornet", fromSlot: from, toSlot: i },
        );
      });
      return;
    }

    // Могильщик: выбранная карта грейва → пустой слот
    if (
      state.selectedSlot != null &&
      gravediggerFlexReady(state, state.selectedSlot) &&
      !creature
    ) {
      if (gravePickIdx == null) {
        pushHint("Сначала кликни карту в грейве (слева от руки)");
        return;
      }
      const from = state.selectedSlot;
      const pick = graveEntries.find((e) => e.index === gravePickIdx);
      const gyId = pick?.cardId;
      const gyIdx = gravePickIdx;
      setGravePickIdx(null);
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "play",
            fromSlot: from,
            toSlot: i,
            cardId: gyId ?? "skeleton",
          },
          (s) => reviveWithGravedigger(s, from, i, gyIdx),
          900,
          {
            kind: "reviveGravedigger",
            fromSlot: from,
            graveIndex: gyIdx,
            toSlot: i,
          },
        );
      });
      return;
    }

    // Арбитр уже выбран → повторный клик = Вердикт (все 1/1 кроме него)
    if (
      creature &&
      state.selectedSlot === i &&
      arbiterFlexReady(state, i)
    ) {
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "spell",
            fromSlot: i,
            cardId: creature.cardId,
            hitSlots: [0, 1, 2, 3, 4],
          },
          (s) => verdictWithArbiter(s, i),
          1100,
          { kind: "verdictArbiter", fromSlot: i },
        );
      });
      return;
    }

    // Маг уже выбран → повторный клик = +1 HP себе навсегда
    if (
      creature &&
      state.selectedSlot === i &&
      mageFlexReady(state, i)
    ) {
      void runLocked(async () => {
        await playFx(
          { side: "you", kind: "heal", fromSlot: i, toSlot: i },
          (s) => buffWithMage(s, i, i),
          900,
          { kind: "buffMage", fromSlot: i, toSlot: i },
        );
      });
      return;
    }

    // Выбор атакующего (сбрасывает карту из руки)
    if (creature?.canAttack) {
      setBalthSwapFrom(null);
      setGravePickIdx(null);
      setFlexIntent("strike");
      setState(selectSlot(state, state.selectedSlot === i ? null : i));
      return;
    }

    if (creature && !creature.canAttack) {
      pushHint(
        `${getCard(creature.cardId).name}: ещё «спит» — атака со следующего хода`,
      );
      return;
    }

    if (state.selectedHand != null) {
      pushHint("Для призыва нужен пустой свой слот");
    }
  };

  const faceEnemyHero = (from: number) => {
    const preview = attackFxPreview(state, from, "hero");
    void runLocked(async () => {
      await playFx(preview, (s) => attackWith(s, from, "hero"), 1000, {
        kind: "attack",
        fromSlot: from,
        target: "hero",
      });
    });
  };

  const onEnemySlot = (i: number) => {
    if (actionBlocked) return;

    // Марионетка: 1) кукла 2) цель удара (сосед / любой для дальних)
    if (state.selectedHand != null && spellMode === "marionette") {
      const hand = state.selectedHand;
      const enemyUnit = state.enemy.slots[i];
      if (marionettePuppet == null) {
        if (!enemyUnit) {
          pushHint("Марионетка: кликни существо врага");
          return;
        }
        setMarionettePuppet(i);
        pushHint(
          `Кукла: ${getCard(enemyUnit.cardId).name} — теперь кликни цель (сосед / враг / герой / свой для лучника)`,
        );
        return;
      }
      if (marionettePuppet === i) {
        setMarionettePuppet(null);
        pushHint("Выбор куклы сброшен");
        return;
      }
      if (!enemyUnit) {
        pushHint("Пустой слот — некого бить");
        return;
      }
      const target = { kind: "enemy_unit" as const, slot: i };
      if (!marionetteTargetOk(state, marionettePuppet, target)) {
        const pup = state.enemy.slots[marionettePuppet];
        pushHint(
          pup && !marionetteIsRanged(pup.cardId)
            ? "Ближник бьёт только соседа слева/справа (или твою карту/оракула)"
            : "Эта цель недоступна",
        );
        return;
      }
      if (!assertHandMana(hand, { clearHand: true })) {
        setMarionettePuppet(null);
        return;
      }
      const puppet = marionettePuppet;
      setMarionettePuppet(null);
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "spell",
            cardId: state.you.hand[hand],
            hitSlots: [puppet, i],
          },
          (s) => playMarionette(s, hand, puppet, target),
          1600,
          {
            kind: "marionette",
            handIndex: hand,
            puppetSlot: puppet,
            target,
          },
        );
      });
      return;
    }

    if (state.selectedHand != null && spellMode === "enemy") {
      const hand = state.selectedHand;
      if (!assertHandMana(hand, { clearHand: true })) return;
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "spell",
            cardId: state.you.hand[hand],
            hitSlots: [i],
          },
          (s) => playCard(s, hand, i),
          1400,
          { kind: "playCard", handIndex: hand, slotIndex: i },
        );
      });
      return;
    }

    if (state.selectedSlot == null) {
      pushHint("Сначала кликни своё существо с зелёной рамкой");
      return;
    }
    const from = state.selectedSlot;
    const enemyUnit = state.enemy.slots[i];

    const wantSkill = flexIntent === "skill";

    // Режим «умение»: русалка — усыпить (в т.ч. напротив), не женщину
    if (
      wantSkill &&
      mermaidReady &&
      enemyUnit &&
      !isFemaleWarrior(enemyUnit.cardId)
    ) {
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "spell",
            fromSlot: from,
            toSlot: i,
            cardId: state.you.slots[from]!.cardId,
          },
          (s) => sleepWithMermaid(s, from, i),
          900,
          { kind: "sleepMermaid", fromSlot: from, toSlot: i },
        );
      });
      return;
    }

    // Режим «умение»: сукуб — усыпить мужчину (в т.ч. напротив)
    if (
      wantSkill &&
      succubusReady &&
      enemyUnit &&
      creatureGender(enemyUnit.cardId) === "male"
    ) {
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "spell",
            fromSlot: from,
            toSlot: i,
            cardId: state.you.slots[from]!.cardId,
          },
          (s) => sleepWithSuccubus(s, from, i),
          900,
          { kind: "sleepSuccubus", fromSlot: from, toSlot: i },
        );
      });
      return;
    }

    // Режим «умение»: банши — оглушить любое существо (в т.ч. напротив)
    if (wantSkill && bansheeReady && enemyUnit) {
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "spell",
            fromSlot: from,
            toSlot: i,
            cardId: state.you.slots[from]!.cardId,
          },
          (s) => stunWithBanshee(s, from, i),
          900,
          { kind: "stunBanshee", fromSlot: from, toSlot: i },
        );
      });
      return;
    }

    // Режим «умение»: леший — обмен ATK↔HP у любого врага
    if (wantSkill && leshyReady && enemyUnit) {
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "spell",
            fromSlot: from,
            toSlot: i,
            cardId: state.you.slots[from]!.cardId,
          },
          (s) => swapStatsWithLeshy(s, from, "enemy", i),
          900,
          { kind: "swapLeshy", fromSlot: from, side: "enemy", toSlot: i },
        );
      });
      return;
    }

    // Режим «удар» или без выбора: старое поведение для НЕ напротив
    if (
      !wantSkill &&
      mermaidReady &&
      enemyUnit &&
      i !== from &&
      !isFemaleWarrior(enemyUnit.cardId)
    ) {
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "spell",
            fromSlot: from,
            toSlot: i,
            cardId: state.you.slots[from]!.cardId,
          },
          (s) => sleepWithMermaid(s, from, i),
          900,
          { kind: "sleepMermaid", fromSlot: from, toSlot: i },
        );
      });
      return;
    }
    if (
      !wantSkill &&
      succubusReady &&
      enemyUnit &&
      i !== from &&
      creatureGender(enemyUnit.cardId) === "male"
    ) {
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "spell",
            fromSlot: from,
            toSlot: i,
            cardId: state.you.slots[from]!.cardId,
          },
          (s) => sleepWithSuccubus(s, from, i),
          900,
          { kind: "sleepSuccubus", fromSlot: from, toSlot: i },
        );
      });
      return;
    }
    if (!wantSkill && bansheeReady && enemyUnit && i !== from) {
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "spell",
            fromSlot: from,
            toSlot: i,
            cardId: state.you.slots[from]!.cardId,
          },
          (s) => stunWithBanshee(s, from, i),
          900,
          { kind: "stunBanshee", fromSlot: from, toSlot: i },
        );
      });
      return;
    }
    if (
      !wantSkill &&
      leshyReady &&
      enemyUnit &&
      !attackTargets.has(String(i))
    ) {
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "spell",
            fromSlot: from,
            toSlot: i,
            cardId: state.you.slots[from]!.cardId,
          },
          (s) => swapStatsWithLeshy(s, from, "enemy", i),
          900,
          { kind: "swapLeshy", fromSlot: from, side: "enemy", toSlot: i },
        );
      });
      return;
    }

    // В режиме умения не бить — только скилл
    if (wantSkill && (bansheeReady || mermaidReady || succubusReady || leshyReady)) {
      pushHint("Режим умения: кликни подходящую цель врага (можно напротив)");
      return;
    }

    // Бальтазар: обмен двух карт врага (напротив без режима обмена = удар)
    if (balthazarReady && enemyUnit) {
      const isFrontAttack =
        balthSwapFrom == null && attackTargets.has(String(i));
      if (!isFrontAttack) {
        if (balthSwapFrom == null) {
          setBalthSwapFrom(i);
          pushHint(
            `Бальтазар: выбрана ${getCard(enemyUnit.cardId).name} — кликни вторую карту врага`,
          );
          return;
        }
        if (balthSwapFrom === i) {
          setBalthSwapFrom(null);
          pushHint("Обмен сброшен");
          return;
        }
        const a = balthSwapFrom;
        setBalthSwapFrom(null);
        void runLocked(async () => {
          await playFx(
            {
              side: "you",
              kind: "spell",
              fromSlot: from,
              cardId: state.you.slots[from]!.cardId,
            },
            (s) => swapEnemyWithBalthazar(s, from, a, i),
            900,
            { kind: "swapBalthazar", fromSlot: from, a, b: i },
          );
        });
        return;
      }
    }

    // Удар по существу
    if (attackTargets.has(String(i)) && enemyUnit) {
      const preview = attackFxPreview(state, from, i);
      void runLocked(async () => {
        await playFx(preview, (s) => attackWith(s, from, i), 1000, {
          kind: "attack",
          fromSlot: from,
          target: i,
        });
      });
      return;
    }

    // Пустой слот / «в лицо»: лучник и ближник без блокера бьют героя
    if (attackTargets.has("hero") && !state.enemy.slots[i]) {
      faceEnemyHero(from);
      return;
    }

    const c = state.you.slots[from];
    const pat = c
      ? PATTERN_LABEL[getCard(c.cardId).attackPattern ?? "melee"]
      : "";
    pushHint(`Эта цель недоступна (${pat}). Кликни подсвеченную красным`);
  };

  const onEnemyHero = () => {
    if (actionBlocked) return;

    if (
      state.selectedHand != null &&
      spellMode === "marionette" &&
      marionettePuppet != null
    ) {
      const hand = state.selectedHand;
      const target = { kind: "enemy_hero" as const };
      if (!marionetteTargetOk(state, marionettePuppet, target)) {
        pushHint("Ближник не бьёт героя врага — бей соседа или твою карту/оракула");
        return;
      }
      if (!assertHandMana(hand, { clearHand: true })) {
        setMarionettePuppet(null);
        return;
      }
      const puppet = marionettePuppet;
      setMarionettePuppet(null);
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "spell",
            cardId: state.you.hand[hand],
            hitHero: true,
          },
          (s) => playMarionette(s, hand, puppet, target),
          1600,
          {
            kind: "marionette",
            handIndex: hand,
            puppetSlot: puppet,
            target,
          },
        );
      });
      return;
    }

    if (state.selectedSlot == null) {
      pushHint("Сначала выбери своё существо для атаки");
      return;
    }
    if (!attackTargets.has("hero")) {
      pushHint("Герой недоступен — бей существо с красной рамкой");
      return;
    }
    faceEnemyHero(state.selectedSlot);
  };

  const onYourHero = () => {
    if (actionBlocked) return;

    if (
      state.selectedHand != null &&
      spellMode === "marionette" &&
      marionettePuppet != null
    ) {
      const hand = state.selectedHand;
      const target = { kind: "ally_hero" as const };
      if (!marionetteTargetOk(state, marionettePuppet, target)) {
        pushHint("Эта цель недоступна для куклы");
        return;
      }
      if (!assertHandMana(hand, { clearHand: true })) {
        setMarionettePuppet(null);
        return;
      }
      const puppet = marionettePuppet;
      setMarionettePuppet(null);
      void runLocked(async () => {
        await playFx(
          {
            side: "you",
            kind: "spell",
            cardId: state.you.hand[hand],
            hitHero: true,
          },
          (s) => playMarionette(s, hand, puppet, target),
          1600,
          {
            kind: "marionette",
            handIndex: hand,
            puppetSlot: puppet,
            target,
          },
        );
      });
      return;
    }

    if (state.selectedSlot == null || !mageFlexReady(state, state.selectedSlot)) {
      return;
    }
    const from = state.selectedSlot;
    void runLocked(async () => {
      await playFx(
        { side: "you", kind: "heal", fromSlot: from, hitHero: true },
        (s) => buffWithMage(s, from, "hero"),
        900,
        { kind: "buffMage", fromSlot: from, toSlot: "hero" },
      );
    });
  };

  const readyForwardCount = useMemo(() => {
    if (state.active !== "you" || state.winner) return 0;
    let n = 0;
    for (let i = 0; i < 5; i++) {
      if (forwardAttackTarget(state, i) != null) n += 1;
    }
    return n;
  }, [state]);

  const onAttackAll = () => {
    if (actionBlocked) return;
    if (readyForwardCount === 0) {
      pushHint("Нет существ, готовых атаковать вперёд");
      return;
    }
    void runLocked(async () => {
      unlockSfx();
      let s = state;
      for (let i = 0; i < 5; i++) {
        const target = forwardAttackTarget(s, i);
        if (target == null) continue;
        const preview = attackFxPreview(s, i, target);
        setFx(preview);
        playActionSfx(preview, s);
        await sleep(320);
        const before = s;
        const action: PvpAction = {
          kind: "attack",
          fromSlot: i,
          target,
        };
        const after = networkRef.current
          ? applyPvpAction(s, action)
          : attackWith(s, i, target);
        const over = Boolean(after.winner) || after.enemy.hp <= 0;
        s =
          networkRef.current && after.winner
            ? { ...after, winner: null }
            : after;
        stateRef.current = s;
        setState(s);
        playResultSfx(before, s);
        if (networkRef.current) {
          networkRef.current.sendAction(action);
        }
        setFx(null);
        await sleep(180);
        if (over) break;
      }
    });
  };

  const onEndTurn = () => {
    if (actionBlocked) return;
    setGravePickIdx(null);
    void runLocked(async () => {
      unlockSfx();
      setPhase("enemy");
      sfxTurn();

      if (networkRef.current) {
        setPvpAwaiting(true);
        setPhase("enemy");
        setState((s) => {
          const next = {
            ...s,
            active: "enemy" as const,
            selectedHand: null,
            selectedSlot: null,
          };
          stateRef.current = next;
          return next;
        });
        networkRef.current.sendAction({ kind: "endTurn" });
        await sleep(400);
        return;
      }

      let before = stateRef.current;
      let s = endPlayerTurn(stateRef.current);
      stateRef.current = s;
      setState(s);
      playResultSfx(before, s);
      await sleep(450);

      // шаги соперника — по одному, чуть бодрее (раньше было очень томно)
      for (let n = 0; n < 20; n++) {
        const step = takeAiStep(s);
        if (!step) break;
        const stepFx = normalizeBattleFx(step.fx);
        const isSpellCard = stepFx.kind === "spell" && !!stepFx.cardId;
        const hitFace =
          !!stepFx.hitHero &&
          stepFx.kind !== "heal" &&
          stepFx.side === "enemy";
        const flying =
          (stepFx.kind === "lunge" &&
            (stepFx.motion === "ranged" || stepFx.motion === "bolt")) ||
          (stepFx.kind === "spell" &&
            (stepFx.vfx === "poison" || stepFx.vfx === "magic") &&
            (!!stepFx.hitHero ||
              stepFx.toSlot != null ||
              (Array.isArray(stepFx.hitSlots) && stepFx.hitSlots.length > 0)));
        // Удар в оракула / спелл чуть дольше — чтобы было ясно, отчего урон.
        const hold = isSpellCard
          ? 2200
          : hitFace
            ? 1400
            : flying
              ? 1100
              : stepFx.kind === "lunge"
                ? 950
                : stepFx.kind === "play"
                  ? 850
                  : stepFx.kind === "spell"
                    ? 1100
                    : 650;
        setFx(stepFx);
        playActionSfx(stepFx, s);
        if (isSpellCard) {
          // Карта сначала появляется, эффект — после анимации.
          await sleep(900);
          before = s;
          s = step.state;
          stateRef.current = s;
          setState(s);
          playResultSfx(before, s);
          await sleep(Math.max(550, hold - 900));
        } else {
          await sleep(Math.floor(hold * 0.35));
          before = s;
          s = step.state;
          stateRef.current = s;
          setState(s);
          playResultSfx(before, s);
          await sleep(Math.floor(hold * 0.55));
        }
        setFx(null);
        await sleep(hitFace || isSpellCard ? 280 : 160);
        if (s.winner) break;
      }

      if (!s.winner) {
        before = s;
        s = endEnemyTurn(s);
        stateRef.current = s;
        setState(s);
        playResultSfx(before, s);
        sfxTurn();
      }
      setPhase("you");
      await sleep(250);
    });
  };

  const impactOnTarget = (
    slot: number,
    cardSide: "you" | "enemy",
  ): FxImpact | null => {
    if (!fx) return null;
    const targeted =
      fx.hitSlots?.includes(slot) ||
      (fx.kind === "spell" && fx.toSlot === slot) ||
      (fx.kind === "lunge" && fx.toSlot === slot);
    if (!targeted) return null;
    // Удар по карте приходит с противоположной стороны
    if (fx.side === cardSide && fx.kind !== "heal") {
      // Свои спеллы по своим слотам (бафф) — без «горения»
      if (fx.kind === "spell" && fx.vfx === "poison") return "poison";
      return null;
    }
    if (fx.side === cardSide) return null;
    if (fx.kind === "lunge") {
      const motion = fx.motion ?? "melee";
      // Стрела одна — летящая; на карте дубль не рисуем.
      if (motion === "ranged") return null;
      if (motion === "bolt") {
        return fx.school === "hell" ? "burn" : "magic";
      }
      return null;
    }
    if (fx.kind === "spell") {
      if (fx.vfx === "poison") return "poison";
      if (fx.school === "hell") return "burn";
      return "magic";
    }
    return null;
  };

  const yourFx = (slot: number) => {
    const attacking =
      fx?.side === "you" && fx.kind === "lunge" && fx.fromSlot === slot;
    const motion = fx?.motion ?? "melee";
    const impact = impactOnTarget(slot, "you");
    return {
      lunge: !!attacking && motion === "melee",
      nod: !!attacking && motion !== "melee",
      hit:
        (fx?.side === "enemy" && fx.hitSlots?.includes(slot)) ||
        (fx?.side === "you" && fx.kind === "heal" && fx.toSlot === slot) ||
        (fx?.side === "you" &&
          fx.kind === "spell" &&
          fx.vfx !== "poison" &&
          fx.toSlot === slot) ||
        false,
      poisonBurst: impact === "poison",
      impact,
      playIn: fx?.side === "you" && fx.kind === "play" && fx.toSlot === slot,
      heal:
        fx?.side === "you" &&
        fx.kind === "heal" &&
        (fx.fromSlot === slot || fx.toSlot === slot),
    };
  };

  const enemyFx = (slot: number) => {
    const attacking =
      fx?.side === "enemy" && fx.kind === "lunge" && fx.fromSlot === slot;
    const motion = fx?.motion ?? "melee";
    const impact = impactOnTarget(slot, "enemy");
    return {
      lunge: !!attacking && motion === "melee",
      nod: !!attacking && motion !== "melee",
      hit:
        (fx?.side === "you" && fx.hitSlots?.includes(slot)) ||
        (fx?.side === "enemy" &&
          (fx.kind === "heal" || fx.kind === "spell") &&
          (fx.toSlot === slot || fx.hitSlots?.includes(slot))) ||
        false,
      poisonBurst: impact === "poison",
      impact,
      playIn: fx?.side === "enemy" && fx.kind === "play" && fx.toSlot === slot,
      heal:
        fx?.side === "enemy" &&
        fx.kind === "heal" &&
        (fx.fromSlot === slot || fx.toSlot === slot),
    };
  };

  const missileKind = ((): "arrow" | "bolt" | "magic" | "poison" | null => {
    if (!fx) return null;
    const motion = fx.motion ?? "melee";
    const flyAttack =
      fx.kind === "lunge" && (motion === "ranged" || motion === "bolt");
    const hasSpellAim =
      !!fx.hitHero ||
      fx.toSlot != null ||
      (Array.isArray(fx.hitSlots) && fx.hitSlots.length > 0);
    // Без цели (мана, доп. карта, баффы) снаряд не летит — только карта каста.
    const flySpell =
      fx.kind === "spell" &&
      hasSpellAim &&
      (fx.vfx === "poison" || fx.vfx === "magic");
    if (!flyAttack && !flySpell) return null;
    if (fx.kind === "spell") return fx.vfx === "poison" ? "poison" : "magic";
    return motion === "bolt" ? "bolt" : "arrow";
  })();

  const missileClass = missileKind
    ? [
        "battle-missile",
        `is-${missileKind}`,
        `from-${fx!.side}`,
        fx!.school ? `school-${fx!.school}` : "school-neutral",
      ].join(" ")
    : null;

  const readyCount = state.you.slots.filter((s) => s?.canAttack).length;

  useEffect(() => {
    const pending = dropAfterSelectRef.current;
    if (!pending || state.selectedHand == null || busy) return;
    dropAfterSelectRef.current = null;
    if (pending.side === "you") onYourSlot(pending.slot);
    else onEnemySlot(pending.slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedHand, busy, dropSeq]);

  const hint = (() => {
    if (pvpHold) return "Кубик решает, кто ходит первым…";
    if (network && !state.winner && state.active !== "you") {
      return "Ход соперника — жди своей очереди";
    }
    if (busy && phase === "enemy") return "Ход соперника — смотри анимации";
    if (busy) return "…";
    if (state.selectedHand != null && spellMode === "ally_pair")
      return guardianTankSlot != null
        ? "Взять урон: кликни подопечного (кого защищаем)"
        : "Взять урон: кликни стража (кто принимает урон)";
    if (state.selectedHand != null && spellMode === "marionette")
      return marionettePuppet != null
        ? marionetteRanged
          ? "Марионетка: враг / герой врага = удар; свой / твой оракул = лечение"
          : "Марионетка: сосед врага = удар по нему; свой / твой оракул = удар по тебе"
        : "Марионетка: кликни существо врага (кукла)";
    if (state.selectedHand != null && spellMode === "ally") {
      const sid = state.you.hand[state.selectedHand];
      if (sid === "undead_bonus") {
        return "Бонус нежити: кликни свою нежить (школа смерти)";
      }
      if (sid === "awakening") {
        return "Пробуждение: кликни своё существо — снять сон и снова атаковать";
      }
      return "Заклинание: кликни своё существо";
    }
    if (state.selectedHand != null && spellMode === "enemy")
      return "Заклинание: кликни существо врага";
    if (state.selectedHand != null) {
      const sid = state.you.hand[state.selectedHand];
      if (sid && getCard(sid).kind === "spell" && !spellMode) {
        return "Заклинание выбрано — кликни ещё раз, чтобы разыграть (↻ — только описание)";
      }
      return "Призыв: кликни пустой слот (+) в своём ряду";
    }
    if (state.selectedSlot != null) {
      const c = state.you.slots[state.selectedSlot];
      const ab = c && !c.stripped ? getCard(c.cardId).ability : undefined;
      if (ab === "angel_heal") {
        return "Ангел выбран: враг = удар, союзник = +1/+1";
      }
      if (ab === "mage_flex") {
        return "Маг: враг = удар; союзник / свой оракул = +1 HP навсегда; повторный клик по Магу = себе";
      }
      if (ab === "paladin_flex") {
        return "Паладин: враг = удар, союзник = щит (−50% на 2 хода)";
      }
      if (ab === "gravedigger_flex") {
        return gravePickIdx != null
          ? "Могильщик: кликни пустой свой слот (+) — вернуть выбранную карту"
          : "Могильщик: враг = удар; грейв (слева) = выбрать кого поднять, потом пустой слот";
      }
      if (ab === "triton_flex") {
        return "Тритон: враг = удар, пустой свой слот (+) = призвать Акулита";
      }
      if (ab === "mermaid_flex") {
        return flexIntent === "skill"
          ? "Режим умения: кликни врага (не женщину), можно напротив — усыпить"
          : "Режим удара: напротив = бить. Переключи на «Умение», чтобы усыпить напротив";
      }
      if (ab === "succubus_flex") {
        return flexIntent === "skill"
          ? "Режим умения: кликни мужчину врага (можно напротив) — усыпить"
          : "Режим удара: напротив = бить. «Умение» — усыпить напротив";
      }
      if (ab === "banshee_flex") {
        return flexIntent === "skill"
          ? "Режим умения: кликни любое существо врага (можно напротив) — оглушить"
          : "Режим удара: напротив = бить. Нажми «Оглушить», чтобы ором бить и напротив";
      }
      if (ab === "leshy_flex") {
        return flexIntent === "skill"
          ? "Режим умения: кликни врага или союзника — обмен ATK↔HP"
          : "Режим удара: напротив = бить. «Умение» — обмен и по клетке напротив";
      }
      if (ab === "balthazar_flex") {
        return balthSwapFrom != null
          ? "Бальтазар: кликни вторую карту врага для обмена"
          : "Бальтазар: напротив = удар; клик по врагу, потом по другому = обмен";
      }
      if (ab === "necro_flex") {
        return "Некромант: враг = удар, пустой свой слот (+) = призвать Скелета";
      }
      if (ab === "hornet_queen_flex") {
        return "Матка: враг = удар, пустой свой слот (+) = создать Шершня-воина";
      }
      if (ab === "arbiter_flex") {
        return "Арбитр: враг/герой = удар (любая цель); кликни Арбитра ещё раз = Вердикт (все 1/1, кроме него)";
      }
      if (c?.stripped) {
        return "Ничтожество: супер-умение снято — можно только бить как обычно";
      }
      const pat = c
        ? PATTERN_LABEL[getCard(c.cardId).attackPattern ?? "melee"]
        : "";
      if (attackTargets.has("hero") && attackTargets.size === 1) {
        return `Атака ${pat}: кликни героя сверху или пустой слот врага`;
      }
      if (attackTargets.has("hero")) {
        return `Атака ${pat}: существо (красная рамка) или герой сверху / пустой слот`;
      }
      return `Атака ${pat}: кликни цель с красной рамкой`;
    }
    if (readyCount > 0) {
      return `Твой ход: кликни существо с зелёной рамкой (${readyCount}), потом цель`;
    }
    return "Существа атакуют со следующего хода после призыва. Поставь карты → «Конец хода».";
  })();

  const enemyHeroHit =
    !!fx?.hitHero && fx.side === "you" && fx.kind !== "heal";
  const youHeroHit =
    (!!fx?.hitHero && fx.side === "enemy" && fx.kind !== "heal") ||
    (!!fx?.hitHero && fx.side === "you" && fx.kind === "heal");
  const enemyHeroHeal =
    !!fx?.hitHero && fx.side === "enemy" && fx.kind === "heal";

  const renderLinger = (
    spells: typeof state.you.activeSpells,
    side: "you" | "enemy",
  ) => (
    <div
      className={`linger-side ${side}`}
      aria-label={side === "you" ? "Заклинания у тебя" : "Заклинания у врага"}
    >
      <div className="linger-cards">
        {spells.length === 0 ? (
          <span className="linger-empty" aria-hidden />
        ) : (
          spells.map((sp, i) => {
            const active = (sp.mode ?? "active") === "active";
            const card = getCard(sp.cardId);
  return (
              <div
                key={sp.uid}
                className={`linger-item ${active ? "is-active" : "is-echo"}`}
                style={{ ["--linger-i" as string]: i }}
                title={
                  active
                    ? `Активно: ${card.text}`
                    : `Применено в этом ходу: ${card.text}`
                }
              >
                <CardView cardId={sp.cardId} compact flippable />
                <span className="linger-turns">
                  {active
                    ? sp.turnsLeft == null
                      ? "∞"
                      : `${sp.turnsLeft}х`
                    : "след"}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div
      className={`battle ${busy || actionBlocked ? "is-busy" : ""} ${entered ? "is-entered" : ""}`}
    >
      <header className="battle-bar">
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={() => {
            if (state.winner) {
              onExit();
              return;
            }
            // PvP: leavePvp сам спрашивает и сдаёт бой
            if (network) {
              onExit();
              return;
            }
            if (exitPolicy === "free") {
              onExit();
              return;
            }
            const ok = window.confirm(
              "Покидаете бой?\n\nБудет засчитано поражение. Наград за этот бой не будет (тропа/арена на сегодня могут закрыться).\n\nВыйти и принять поражение?",
            );
            if (!ok) return;
            onForfeitExit?.();
            setState((s) => {
              if (s.winner) return s;
              return {
                ...s,
                winner: "enemy",
                you: { ...s.you, hp: 0 },
                log: ["Ты покинул бой — поражение", ...s.log].slice(0, 12),
              };
            });
          }}
        >
          {network?.exitLabel ? `← ${network.exitLabel}` : "← Меню"}
        </button>
        <div className="battle-bar-right">
          <button
            type="button"
            className="ghost sfx-toggle"
            title={sfxOff ? "Включить звук" : "Выключить звук"}
            onClick={() => {
              const next = !sfxOff;
              setSfxOff(next);
              setSfxMuted(next);
              if (!next) unlockSfx();
            }}
          >
            {sfxOff ? "🔇" : "🔊"}
          </button>
          {network && turnLeftSec != null && !state.winner && !pvpHold ? (
            <div
              className={`pvp-timer-pill ${
                state.active === "you" && turnLeftSec <= 5 ? "is-urgent" : ""
              } ${state.active !== "you" ? "is-foe" : ""}`}
              title={`Ход ${network.turnLimitSec ?? 60}с. Потом автоматически передаётся.`}
            >
              {state.active === "you"
                ? `ход ${turnLeftSec}с`
                : `враг ${turnLeftSec}с`}
            </div>
          ) : null}
          <div className={`turn-pill ${phase === "enemy" ? "enemy-phase" : ""}`}>
            {phase === "enemy" ? "Ход врага" : `Ход ${state.turn}`}
          </div>
          {state.bloodFrenzy > 0 ? (
            <div
              className="blood-frenzy-pill is-on"
              title="Оба оракула теряют HP каждый цикл: 1, 2, 3…"
            >
              🩸 Буйство · −{state.bloodFrenzy}
            </div>
          ) : (
            <div
              className="blood-frenzy-pill"
              title={`После ${state.rules?.bloodFrenzyAfter ?? BLOOD_FRENZY_AFTER_TURNS} циклов или когда колоды кончатся`}
            >
              🩸{" "}
              {(() => {
                const thr =
                  state.rules?.bloodFrenzyAfter ?? BLOOD_FRENZY_AFTER_TURNS;
                const left = Math.max(0, thr + 1 - state.turn);
                return left > 0 ? `через ${left}` : "скоро";
              })()}
            </div>
          )}
        </div>
      </header>

      <div className="battle-hint-row">
        <aside className="log log-enemy-panel battle-log" aria-label="Ходы врага">
          <div className="log-title">Враг</div>
          <div className="log-scroll">
            {enemyLog.length === 0 ? (
              <div className="log-empty">—</div>
            ) : (
              enemyLog.map((line, i) => (
                <div key={`e-${i}`} className="log-enemy">
                  {line}
                </div>
              ))
            )}
          </div>
        </aside>
        <div className="battle-hint-stack">
      <p className="battle-hint">{hint}</p>
          {(bansheeReady ||
            mermaidReady ||
            succubusReady ||
            leshyReady) &&
          !busy &&
          !state.winner ? (
            <div className="flex-intent-bar" role="group" aria-label="Режим действия">
              <button
                type="button"
                className={`ghost ${flexIntent === "strike" ? "is-on" : ""}`}
                onClick={() => setFlexIntent("strike")}
              >
                Удар
              </button>
              <button
                type="button"
                className={`ghost ${flexIntent === "skill" ? "is-on" : ""}`}
                onClick={() => setFlexIntent("skill")}
              >
                {bansheeReady
                  ? "Оглушить"
                  : mermaidReady || succubusReady
                    ? "Усыпить"
                    : "Обмен ATK↔HP"}
              </button>
            </div>
          ) : null}
        </div>
        <aside className="log log-you-panel battle-log" aria-label="Твои ходы">
          <div className="log-title">Ты</div>
          <div className="log-scroll">
            {youLog.length === 0 ? (
              <div className="log-empty">—</div>
            ) : (
              youLog.map((line, i) => (
                <div key={`y-${i}`} className="log-you">
                  {line}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      <div className="board" ref={boardRef}>
        {missileClass && missileKind && fx ? (
          <div className="battle-fx-layer" aria-hidden>
            <BattleMissile
              key={`${fx.side}-${fx.kind}-${fx.fromSlot}-${fx.toSlot}-${fx.hitSlots?.join(".") ?? ""}-${fx.vfx ?? ""}-${missileKind}`}
              className={missileClass}
              kind={missileKind}
              boardRef={boardRef}
              fromSide={fx.side}
              fromSlot={fx.fromSlot}
              toSlot={fx.toSlot}
              hitHero={fx.hitHero}
              hitSlots={fx.hitSlots}
            />
          </div>
        ) : null}
        <div className="oracle-bar enemy-oracle-bar" data-tut="enemy-oracle">
            <button
              type="button"
            className={`oracle-block ${
              attackTargets.has("hero") ||
              (!busy &&
                spellMode === "marionette" &&
                marionettePuppet != null &&
                marionetteTargetOk(state, marionettePuppet, {
                  kind: "enemy_hero",
                }))
                  ? "targetable"
                  : ""
            } ${enemyHeroHit || enemyHeroHeal ? "is-hit" : ""}`}
            onClick={onEnemyHero}
          >
            <div className="oracle-face">
              <img
                src={orakulArtUrl(enemyHero)}
                alt={enemyHero.name}
                draggable={false}
              />
                  </div>
            <div className="hero enemy-hero">
              <strong>
                {enemyHero.name}{" "}
                <span className="orakul-level-badge">ур. {enemyLevelNow}</span>
              </strong>
              <span className="hero-sub inline-icos">
                <SchoolBadge school={state.enemy.faction} size={13} /> ·{" "}
                {state.enemy.name}
              </span>
              <span>HP {state.enemy.hp}/{state.enemy.maxHp}</span>
              <ManaBar
                mana={state.enemy.mana}
                highlight={state.enemy.faction}
                compact
              />
                  </div>
          </button>
                  </div>

        <div className="board-lane enemy-lane">
          <div className="row-label enemy-label">
            Противник
            {phase === "enemy" && <span className="phase-tag">действует</span>}
          </div>
          <div className="board-lane-main">
            <div className="board-lane-side left" aria-hidden />
            <div className="board-lane-center">
              <div
                className={`row enemy-row ${phase === "enemy" ? "row-active" : ""}`}
              >
                {state.enemy.slots.map((s, i) => {
                  const anim = enemyFx(i);
                  return (
                    <div
                      key={`eslot-${i}`}
                      className={`board-slot ${
                        handDrag?.magnet?.side === "enemy" &&
                        handDrag.magnet.slot === i
                          ? "is-magnet"
                          : ""
                      }`}
                      data-board-drop={`enemy:${i}`}
                    >
                      {s ? (
                        <BoardCard
                          key={s.uid}
                          creature={s}
                          selected={
                            !busy &&
                            spellMode === "marionette" &&
                            marionettePuppet === i
                          }
                          targetable={
                            (!busy && attackTargets.has(String(i))) ||
                            (!busy && spellMode === "enemy") ||
                            (!busy &&
                              spellMode === "marionette" &&
                              (marionettePuppet == null ||
                                (marionettePuppet != null &&
                                  marionetteTargetOk(state, marionettePuppet, {
                                    kind: "enemy_unit",
                                    slot: i,
                                  })))) ||
                            (!busy &&
                              mermaidReady &&
                              state.selectedSlot != null &&
                              (flexIntent === "skill" ||
                                i !== state.selectedSlot) &&
                              !isFemaleWarrior(s.cardId)) ||
                            (!busy &&
                              succubusReady &&
                              state.selectedSlot != null &&
                              (flexIntent === "skill" ||
                                i !== state.selectedSlot) &&
                              creatureGender(s.cardId) === "male") ||
                            (!busy &&
                              bansheeReady &&
                              state.selectedSlot != null &&
                              (flexIntent === "skill" ||
                                i !== state.selectedSlot)) ||
                            (!busy &&
                              leshyReady &&
                              flexIntent === "skill" &&
                              !!s) ||
                            (!busy && balthazarReady && !!s) ||
                            (!busy && balthSwapFrom != null && !!s)
                          }
                          lunge={anim.lunge}
                          nod={anim.nod}
                          hit={anim.hit}
                          poisonBurst={anim.poisonBurst}
                          impact={anim.impact}
                          playIn={false}
                          heal={anim.heal}
                          onClick={() => onEnemySlot(i)}
                        />
                      ) : (
                        <EmptySlot
                          label={
                            !busy &&
                            state.selectedSlot != null &&
                            attackTargets.has("hero")
                              ? "👤"
                              : "·"
                          }
                          highlight={
                            (!busy && spellMode === "enemy") ||
                            (!busy &&
                              state.selectedSlot != null &&
                              attackTargets.has("hero"))
                          }
                          onClick={() => onEnemySlot(i)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="board-lane-side right">
              {renderLinger(state.enemy.activeSpells, "enemy")}
            </div>
          </div>
        </div>

        <div className="board-lane your-lane">
          <div className="row-label your-label">
            Твои карты
            {phase === "you" && !actionBlocked && (
              <span className="phase-tag you">твой ход</span>
            )}
          </div>
          <div className="board-lane-main">
            <div className="board-lane-side left" aria-hidden />
            <div className="board-lane-center">
              <div className="turn-actions">
            <button
              type="button"
                  className="primary end-turn-btn"
                  data-tut="end-turn"
                  disabled={actionBlocked}
                  onClick={onEndTurn}
                >
                  Конец хода
                </button>
                <button
                  type="button"
                  className="ghost attack-all-btn"
                  disabled={actionBlocked || readyForwardCount === 0}
                  onClick={onAttackAll}
                  title="Все готовые бьют клетку напротив; если пусто — героя"
                >
                  Атаковать всеми
                  {readyForwardCount > 0 ? ` (${readyForwardCount})` : ""}
                </button>
              </div>
              <div
                className={`row your-row ${phase === "you" ? "row-active" : ""}`}
                data-tut="your-board"
              >
                {state.you.slots.map((s, i) => {
                  const anim = yourFx(i);
                  return (
                    <div
                      key={`yslot-${i}`}
                      className={`board-slot ${
                        handDrag?.magnet?.side === "you" &&
                        handDrag.magnet.slot === i
                          ? "is-magnet"
                          : ""
                      }`}
                      data-board-drop={`you:${i}`}
            >
              {s ? (
                        <BoardCard
                          key={s.uid}
                          creature={s}
                          selected={!busy && state.selectedSlot === i}
                          ready={
                            !busy && !!s.canAttack && state.active === "you"
                          }
                          sleeping={
                            !busy &&
                            state.active === "you" &&
                            !s.canAttack
                          }
                          targetable={
                            !busy &&
                            ((spellMode === "ally" &&
                              state.selectedHand != null &&
                              allyValidForSpell(
                                state.you.hand[state.selectedHand]!,
                                s.cardId,
                              )) ||
                              spellMode === "ally_pair" ||
                              (spellMode === "marionette" &&
                                marionettePuppet != null &&
                                marionetteTargetOk(state, marionettePuppet, {
                                  kind: "ally_unit",
                                  slot: i,
                                })) ||
                              angelHealing ||
                              mageReady ||
                              paladinReady)
                          }
                          lunge={anim.lunge}
                          nod={anim.nod}
                          hit={anim.hit}
                          poisonBurst={anim.poisonBurst}
                          impact={anim.impact}
                          playIn={false}
                          heal={anim.heal}
                          onClick={() => onYourSlot(i)}
                        />
                      ) : (
                        <EmptySlot
                          label="+"
                          highlight={
                            (!busy &&
                              state.selectedHand != null &&
                              getCard(state.you.hand[state.selectedHand])
                                .kind === "creature") ||
                            (!!handDrag &&
                              getCard(handDrag.cardId).kind === "creature") ||
                            (!busy && moveReady) ||
                            (!busy && tritonSummoning) ||
                            (!busy && necroReady) ||
                            (!busy && hornetQueenReady) ||
                            (!busy && graveReviveReady)
                          }
                          onClick={() => onYourSlot(i)}
                        />
                      )}
                  </div>
                  );
                })}
                  </div>
                  </div>
            <div className="board-lane-side right">
              {renderLinger(state.you.activeSpells, "you")}
            </div>
        </div>
      </div>

        <div className="oracle-bar you-oracle-bar" data-tut="you-oracle">
        <button
          type="button"
            className={`oracle-block ${youHeroHit ? "is-hit" : ""} ${
              mageReady ||
              (!busy &&
                spellMode === "marionette" &&
                marionettePuppet != null &&
                marionetteTargetOk(state, marionettePuppet, {
                  kind: "ally_hero",
                }))
                ? marionetteRanged || mageReady
                  ? "heal-target"
                  : "targetable"
                : ""
            }`}
            onClick={onYourHero}
          >
            <div className="oracle-face">
              <img
                src={orakulArtUrl(yourHero)}
                alt={yourHero.name}
                draggable={false}
              />
            </div>
            <div className="hero you-hero">
              <strong>
                {yourHero.name}{" "}
                <span className="orakul-level-badge">ур. {youLevelNow}</span>
              </strong>
              <span className="hero-sub inline-icos">
                <SchoolBadge school={state.you.faction} size={13} /> ·{" "}
                {state.you.name || yourName}
              </span>
              <span data-tut="you-hp">
                HP {state.you.hp}/{state.you.maxHp}
              </span>
              <div data-tut="you-mana">
                <ManaBar
                  mana={state.you.mana}
                  highlight={state.you.faction}
                  compact
                />
              </div>
            </div>
        </button>
        </div>
      </div>

      <div className="battle-footer">
        <div className="grave-zone" aria-label="Грейв">
          <div className="grave-label">Грейв</div>
          <div className={`grave-row ${gravediggerReady ? "is-active" : ""}`}>
            {Array.from({ length: 5 }, (_, i) => {
              const entry = graveEntries[i];
              if (!entry) {
                return (
                  <div key={`grave-empty-${i}`} className="grave-slot-empty" />
                );
              }
              const pickable = !busy && gravediggerReady;
              const selected = gravePickIdx === entry.index;
              return (
                <div
                  key={`grave-${entry.index}-${entry.cardId}`}
                  className={`grave-card-wrap ${selected ? "is-selected" : ""} ${pickable ? "is-pickable" : ""}`}
                >
          <CardView
                    cardId={entry.cardId}
                    compact
                    flippable={!pickable}
                    selected={selected}
                    onClick={
                      pickable
                        ? () =>
                            setGravePickIdx(
                              selected ? null : entry.index,
                            )
                        : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="hand-zone" data-tut="hand" ref={handZoneRef}>
          <div className="hand-label-row">
            <div className="hand-label">Рука</div>
            <div className="hand-scroll-btns" aria-label="Листать руку">
              <button
                type="button"
                className="ghost hand-scroll-btn"
                aria-label="Влево"
                onClick={() => {
                  handZoneRef.current?.scrollBy({
                    left: -Math.max(120, (handZoneRef.current.clientWidth || 200) * 0.7),
                    behavior: "smooth",
                  });
                }}
              >
                ‹
              </button>
              <button
                type="button"
                className="ghost hand-scroll-btn"
                aria-label="Вправо"
                onClick={() => {
                  handZoneRef.current?.scrollBy({
                    left: Math.max(120, (handZoneRef.current.clientWidth || 200) * 0.7),
                    behavior: "smooth",
                  });
                }}
              >
                ›
              </button>
            </div>
          </div>
          <div className={`hand ${actionBlocked ? "hand-locked" : ""}`}>
            {Array.from({ length: 7 }, (_, i) => {
              const id = state.you.hand[i];
              if (!id) {
                return <div key={`empty-hand-${i}`} className="hand-slot-empty" />;
              }
              return (
                <div
                  key={`hand-${i}-${id}`}
                  data-tut={i === 0 ? "hand-card" : undefined}
                  className={`hand-card-anchor ${handDrag?.index === i ? "is-dragging" : ""}`}
                  onPointerDown={(e) => {
                    if (actionBlocked) return;
                    if (e.button !== 0 && e.pointerType === "mouse") return;
                    const isTouch =
                      e.pointerType === "touch" || e.pointerType === "pen";
                    const anchor = e.currentTarget as HTMLElement;
                    // Тач: сначала ждём направление (вбок=скролл / вверх=выкладка).
                    // Мышь: сразу захват под драг.
                    if (!isTouch) {
                      e.preventDefault();
                      try {
                        anchor.setPointerCapture(e.pointerId);
                      } catch {
                        /* ignore */
                      }
                    }
                    e.stopPropagation();
                    handDragUnbind.current?.();
                    handDragMoved.current = false;
                    handGestureMode.current = "pending";
                    handDragStart.current = {
                      x: e.clientX,
                      y: e.clientY,
                      index: i,
                      cardId: id,
                      pointerId: e.pointerId,
                    };
                    const startScroll = handZoneRef.current?.scrollLeft ?? 0;
                    let lastX = e.clientX;
                    let lastY = e.clientY;
                    let lastMagnetKey = "";

                    const finish = (ev: PointerEvent) => {
                      const start = handDragStart.current;
                      if (!start || start.pointerId !== ev.pointerId) return;
                      const mode = handGestureMode.current;
                      const moved = handDragMoved.current;
                      const x =
                        Number.isFinite(ev.clientX) && ev.clientX !== 0
                          ? ev.clientX
                          : lastX;
                      const y =
                        Number.isFinite(ev.clientY) &&
                        (ev.clientY !== 0 || lastY === 0)
                          ? ev.clientY
                          : lastY;
                      handDragStart.current = null;
                      handDragMoved.current = false;
                      handGestureMode.current = "pending";
                      handDragUnbind.current?.();
                      handDragUnbind.current = null;
                      clearHandDragLock();
                      setHandDrag(null);
                      if (mode === "scroll") return;
                      if (!moved || mode === "pending") {
                        setGravePickIdx(null);
                        onHandClick(start.index);
                        return;
                      }
                      const drop = findBoardDropAt(x, y, start.cardId);
                      if (drop) {
                        dropAfterSelectRef.current = {
                          side: drop.side,
                          slot: drop.slot,
                        };
                        setState((s) => selectHand(s, start.index));
                        setDropSeq((n) => n + 1);
                        return;
                      }
                      pushHint("Поднеси карту ближе к пустому слоту своего ряда");
                    };

                    const beginDrag = (clientX: number, clientY: number) => {
                      handGestureMode.current = "drag";
                      handDragMoved.current = true;
                      try {
                        anchor.setPointerCapture(
                          handDragStart.current?.pointerId ?? e.pointerId,
                        );
                      } catch {
                        /* ignore */
                      }
                      document.documentElement.classList.add("is-hand-dragging");
                      setGravePickIdx(null);
                      lastMagnetKey = "";
                      setHandDrag({
                        index: i,
                        cardId: id,
                        x: clientX,
                        y: clientY,
                        magnet: null,
                      });
                    };

                    const onMove = (ev: PointerEvent) => {
                      const start = handDragStart.current;
                      if (!start || start.pointerId !== ev.pointerId) return;
                      lastX = ev.clientX;
                      lastY = ev.clientY;
                      const dx = ev.clientX - start.x;
                      const dy = ev.clientY - start.y;

                      if (handGestureMode.current === "pending") {
                        const dist2 = dx * dx + dy * dy;
                        if (dist2 < 64) return;
                        if (isTouch) {
                          const absX = Math.abs(dx);
                          const absY = Math.abs(dy);
                          // Вбок по карте — скролл руки (без выкладки)
                          if (absX > absY * 1.05) {
                            handGestureMode.current = "scroll";
                            handDragMoved.current = true;
                            const zone = handZoneRef.current;
                            if (zone) zone.scrollLeft = startScroll - dx;
                            return;
                          }
                          // Вверх к столу — драг
                          if (dy < -4 && absY >= absX * 0.9) {
                            beginDrag(ev.clientX, ev.clientY);
                          } else if (dist2 > 220 && dy > 0) {
                            // вниз / шум — считаем скроллом, не цепляем карту
                            handGestureMode.current = "scroll";
                            handDragMoved.current = true;
                          }
                          return;
                        }
                        beginDrag(ev.clientX, ev.clientY);
                      }

                      if (handGestureMode.current === "scroll") {
                        const zone = handZoneRef.current;
                        if (zone) zone.scrollLeft = startScroll - dx;
                        return;
                      }

                      if (handGestureMode.current !== "drag") return;
                      ev.preventDefault();
                      const ghost = handDragGhostRef.current;
                      if (ghost) {
                        ghost.style.left = `${ev.clientX}px`;
                        ghost.style.top = `${ev.clientY}px`;
                      }
                      const magnet = findBoardDropAt(
                        ev.clientX,
                        ev.clientY,
                        start.cardId,
                      );
                      const key = magnet
                        ? `${magnet.side}:${magnet.slot}`
                        : "";
                      if (key === lastMagnetKey) return;
                      lastMagnetKey = key;
                      setHandDrag((prev) =>
                        prev
                          ? {
                              ...prev,
                              x: ev.clientX,
                              y: ev.clientY,
                              magnet: magnet
                                ? { side: magnet.side, slot: magnet.slot }
                                : null,
                            }
                          : null,
                      );
                    };

                    window.addEventListener("pointermove", onMove, {
                      passive: false,
                    });
                    window.addEventListener("pointerup", finish);
                    window.addEventListener("pointercancel", finish);
                    handDragUnbind.current = () => {
                      window.removeEventListener("pointermove", onMove);
                      window.removeEventListener("pointerup", finish);
                      window.removeEventListener("pointercancel", finish);
                    };
                  }}
                >
                  <CardView
            cardId={id}
            compact
                    selected={!busy && state.selectedHand === i}
                    manaCostOverride={battleManaCost(state, id)}
                  />
                </div>
              );
            })}
          </div>
          <div
            className="hand-scroll-rail"
            role="scrollbar"
            aria-label="Листать руку"
            aria-orientation="horizontal"
            onPointerDown={(e) => {
              if (e.button !== 0 && e.pointerType === "mouse") return;
              const zone = handZoneRef.current;
              if (!zone) return;
              e.preventDefault();
              e.stopPropagation();
              const pointerId = e.pointerId;
              const startX = e.clientX;
              const startScroll = zone.scrollLeft;
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(pointerId);
              } catch {
                /* ignore */
              }
              const onMove = (ev: PointerEvent) => {
                if (ev.pointerId !== pointerId) return;
                zone.scrollLeft = startScroll - (ev.clientX - startX);
              };
              const onUp = (ev: PointerEvent) => {
                if (ev.pointerId !== pointerId) return;
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                window.removeEventListener("pointercancel", onUp);
              };
              window.addEventListener("pointermove", onMove, { passive: true });
              window.addEventListener("pointerup", onUp);
              window.addEventListener("pointercancel", onUp);
            }}
          />
        </div>
      </div>

      {handDrag ? (
        <div
          ref={handDragGhostRef}
          className="hand-drag-ghost"
          style={{
            left: handDrag.x,
            top: handDrag.y,
          }}
          aria-hidden
        >
          <CardView cardId={handDrag.cardId} compact flippable={false} />
        </div>
      ) : null}

      {fx?.cardId && fx.kind === "spell" && (
        <div
          className={`spell-reveal ${fx.side === "enemy" ? "from-enemy" : "from-you"}`}
        >
          <div className="spell-reveal-label">
            {fx.side === "enemy" ? "Враг колдует" : "Ты колдуешь"}
          </div>
          <CardView cardId={fx.cardId} compact flippable={false} />
          <p className="spell-reveal-text">{getCard(fx.cardId).text}</p>
        </div>
      )}

      {showResult && state.winner && (
        <div
          className={`overlay battle-result-overlay ${
            state.winner === "you" ? "is-win" : "is-lose"
          }`}
        >
          <div
            className={`battle-result-panel ${
              state.winner === "you" ? "is-win" : "is-lose"
            }${reward?.celebration ? " is-celebration" : ""}`}
          >
            <p className="battle-result-eyebrow">
              {reward?.resultEyebrow
                ? reward.resultEyebrow
                : state.winner === "you"
                  ? "Дуэль окончена"
                  : "Дуэль проиграна"}
            </p>
            <h2 className="battle-result-title">
              {reward?.resultTitle
                ? reward.resultTitle
                : state.winner === "you"
                  ? "Победа"
                  : "Поражение"}
            </h2>
            {reward?.resultLead ? (
              <p className="battle-result-lead">{reward.resultLead}</p>
            ) : null}
            {reward && (
              <div className="battle-result-rewards" aria-label="Награды">
                <div className="battle-reward-chip xp">
                  <span className="battle-reward-label">Опыт</span>
                  <span className="battle-reward-value">
                    +{reward.xpGained}
                  </span>
                </div>
                {reward.gainedLevels > 0 && (
                  <div className="battle-reward-chip lvl">
                    <span className="battle-reward-label">Уровень</span>
                    <span className="battle-reward-value">
                      +{reward.gainedLevels}
                    </span>
                  </div>
                )}
                {reward.goldReward > 0 && (
                  <div className="battle-reward-chip gold">
                    <span className="battle-reward-label inline-icos">
                      <GameIcon name="gold" size={14} /> Золото
                    </span>
                    <span className="battle-reward-value">
                      +{reward.goldReward}
                    </span>
                  </div>
                )}
                {reward.diamondReward > 0 && (
                  <div className="battle-reward-chip dia">
                    <span className="battle-reward-label inline-icos">
                      <GameIcon name="diamond" size={14} /> Кристаллы
                    </span>
                    <span className="battle-reward-value">
                      +{reward.diamondReward}
                    </span>
                  </div>
                )}
                {reward.giftLine && (
                  <div className="battle-reward-chip gift">
                    <span className="battle-reward-label">
                      {reward.celebration ? "Итог" : "Дар"}
                    </span>
                    <span className="battle-reward-value">
                      {reward.giftLine}
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="battle-result-actions">
              {allowRematch ? (
                <button
                  type="button"
                  className="primary large"
                  onClick={() => {
                    if (onRematch) {
                      onRematch();
                      return;
                    }
                    setPhase("you");
                    setFx(null);
                    setReward(null);
                    setShowResult(false);
                    rewarded.current = false;
                    unlockSfx();
                    void startBattleMusic();
                    setState(bootBattle());
                  }}
                >
                  {rematchLabel}
                </button>
              ) : null}
              <button
                type="button"
                className={allowRematch ? "ghost large" : "primary large"}
                onClick={onExit}
              >
                {(() => {
                  const won = state.winner === "you";
                  if (typeof resultExitLabel === "function") {
                    return resultExitLabel(won);
                  }
                  if (resultExitLabel) return resultExitLabel;
                  return "В меню";
                })()}
              </button>
            </div>
          </div>
        </div>
      )}

      {network && diceUi !== "hidden" && (
        <div className="pvp-dice-overlay" role="dialog" aria-label="Бросок кубиков">
          <div className="pvp-dice-card">
            <p className="pvp-dice-title">Бросьте кубики</p>
            <p className="pvp-dice-sub">чтобы решить, кто ходит первым</p>
            <div className="pvp-dice-row">
              <div className="pvp-dice-col">
                <span className="pvp-dice-name">Ты</span>
                <span
                  className={`pvp-die ${diceUi === "wait" ? "is-spinning" : ""} ${diceUi === "result" ? "is-landed" : ""}`}
                  aria-hidden
                >
                  {DIE_FACE[
                    diceUi === "result"
                      ? (network.openingDice?.you ?? 1)
                      : diceUi === "wait"
                        ? spinFace
                        : 1
                  ] ?? "⚀"}
                </span>
                {diceUi === "result" ? (
                  <b>{network.openingDice?.you}</b>
                ) : (
                  <b className="pvp-dice-placeholder">
                    {diceUi === "wait" ? "…" : "?"}
                  </b>
                )}
              </div>
              <div className="pvp-dice-vs">vs</div>
              <div className="pvp-dice-col">
                <span className="pvp-dice-name">Соперник</span>
                <span
                  className={`pvp-die ${network.foeRolled && diceUi !== "result" ? "is-spinning" : ""} ${diceUi === "result" ? "is-landed" : ""}`}
                  aria-hidden
                >
                  {DIE_FACE[
                    diceUi === "result"
                      ? (network.openingDice?.foe ?? spinFace)
                      : network.foeRolled
                        ? spinFace
                        : 1
                  ] ?? "⚀"}
                </span>
                {diceUi === "result" ? (
                  <b>{network.openingDice?.foe}</b>
                ) : (
                  <b className="pvp-dice-placeholder">
                    {network.foeRolled ? "…" : "?"}
                  </b>
                )}
              </div>
            </div>
            {diceUi === "result" && network.openingDice ? (
              <p className="pvp-dice-result">
                {network.openingDice.youFirst
                  ? "Ты ходишь первым"
                  : "Первым ходит соперник"}
              </p>
            ) : diceUi === "wait" ? (
              <p className="pvp-dice-wait">
                {network.foeRolled
                  ? "Оба бросили — сейчас результат"
                  : "Ждём, пока соперник бросит свой кубик"}
              </p>
            ) : (
              <button
                type="button"
                className="primary pvp-dice-throw"
                onClick={() => {
                  setDiceUi("wait");
                  try {
                    network.rollDice?.();
                  } catch {
                    /* сервер ответит */
                  }
                }}
              >
                {network.foeRolled
                  ? "Соперник бросил — брось свой"
                  : "Бросить кубик"}
              </button>
            )}
          </div>
        </div>
      )}

      {tutorialStep != null &&
        tutorialStep >= 0 &&
        tutorialStep < BATTLE_TUTORIAL_TIPS.length &&
        !state.winner &&
        (() => {
          const tip = BATTLE_TUTORIAL_TIPS[tutorialStep]!;
          const vw = typeof window !== "undefined" ? window.innerWidth : 800;
          const vh = typeof window !== "undefined" ? window.innerHeight : 600;
          const cardW = Math.min(360, vw - 24);
          const cardH = 210;
          const gap = 36;
          let cardTop = vh / 2 - cardH / 2;
          let cardLeft = (vw - cardW) / 2;
          let arrowDir: "up" | "down" | "left" | "right" | null = null;
          let arrowTop = 0;
          let arrowLeft = 0;

          if (tutorialSpot) {
            const cx = tutorialSpot.left + tutorialSpot.width / 2;
            const spaceBelow =
              vh - (tutorialSpot.top + tutorialSpot.height);
            const spaceAbove = tutorialSpot.top;
            if (spaceBelow >= cardH + gap || spaceBelow >= spaceAbove) {
              cardTop = tutorialSpot.top + tutorialSpot.height + gap;
              arrowDir = "up";
              arrowTop = tutorialSpot.top + tutorialSpot.height + 6;
              arrowLeft = cx - 12;
            } else {
              cardTop = tutorialSpot.top - gap - cardH;
              arrowDir = "down";
              arrowTop = tutorialSpot.top - 28;
              arrowLeft = cx - 12;
            }
            cardLeft = Math.max(12, Math.min(cx - cardW / 2, vw - cardW - 12));
            cardTop = Math.max(12, Math.min(cardTop, vh - cardH - 12));
          }

          return (
            <div
              className={`battle-tutorial${tutorialSpot ? " battle-tutorial--guided" : ""}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="battle-tutorial-title"
            >
              {tutorialSpot && (
                <div
                  className="battle-tutorial-spot"
                  style={{
                    top: tutorialSpot.top,
                    left: tutorialSpot.left,
                    width: tutorialSpot.width,
                    height: tutorialSpot.height,
                  }}
                />
              )}
              {tutorialSpot && arrowDir && (
                <div
                  className={`battle-tutorial-arrow battle-tutorial-arrow--${arrowDir}`}
                  style={{ top: arrowTop, left: arrowLeft }}
                  aria-hidden
                />
              )}
              <div
                className="battle-tutorial-card"
                style={
                  tutorialSpot
                    ? {
                        position: "fixed",
                        top: cardTop,
                        left: cardLeft,
                        width: cardW,
                      }
                    : undefined
                }
              >
                <div className="battle-tutorial-step">
                  {tutorialStep + 1} / {BATTLE_TUTORIAL_TIPS.length}
                </div>
                <h2 id="battle-tutorial-title">{tip.title}</h2>
                <p>{tip.body}</p>
                <div className="battle-tutorial-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      markBattleTutorialSeen();
                      setTutorialStep(null);
                    }}
                  >
                    Пропустить
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      const next = tutorialStep + 1;
                      if (next >= BATTLE_TUTORIAL_TIPS.length) {
                        markBattleTutorialSeen();
                        setTutorialStep(null);
                      } else {
                        setTutorialStep(next);
                      }
                    }}
                  >
                    {tutorialStep + 1 >= BATTLE_TUTORIAL_TIPS.length
                      ? "В бой"
                      : "Далее"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
