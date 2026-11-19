import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CardView } from "./CardView";
import {
  bookLayoutToCssVars,
  loadBookLayout,
  OracleBookCalibrate,
  ribbonButtonStyle,
  saveBookLayout,
  slotBoxStyle,
  turnButtonStyle,
  type BookLayout,
} from "./OracleBookCalibrate";
import {
  CARDS,
  DECK_SIZE,
  SCHOOL_COLOR,
  SCHOOL_LABEL,
  cardArtStyle,
  cardArtUrl,
  compareCatalogCards,
  getCard,
  maxCopiesForCard,
  sortCatalogCards,
} from "../game/cards";
import {
  getCardUpgradeLevel,
  isUpgradeableCard,
  upgradeStatBonus,
} from "../game/cardUpgrades";
import { GameIcon, ManaCostIcons, SchoolBadge } from "./GameIcon";
import {
  activeDeck,
  activeHeroId,
  homeFactionOf,
  isUnlocked,
  ownedCopies,
  playerLevel,
  saveDeck,
} from "../game/owned";
import { getHero, oracleLore, orakulArtUrl } from "../game/heroes";
import {
  oracleGiftCardText,
  orakulBattleHp,
  waterGiftStartMana,
} from "../game/oracleGifts";
import {
  SKILL_RESET_DIAMONDS,
  SKILL_UNLOCK_COST,
  buyOracleSkill,
  getSkill,
  isSkillVisible,
  normalizeOracleSkillState,
  resetOracleSkill,
  setOracleSkillLoadoutSlot,
  skillUnlockLevel,
  skillsForFaction,
} from "../game/oracleSkills";
import { startManaBonus, xpToNextLevel } from "../game/progression";
import type { CardDef, OwnedState, School } from "../game/types";
import { SkillIcon } from "./SkillIcon";
import { XpBar } from "./XpBar";

/** Порядок = закладки на ORAKUL.png слева направо. */
const BOOK_SCHOOLS: School[] = [
  "death",
  "hell",
  "nature",
  "life",
  "water",
  "neutral",
];

/** Десктоп: 4 карты на страницу (2×2), разворот 8. */
const DESKTOP_CARDS_PER_LEAF = 4;
/** Телефон: 1 карта на страницу, разворот 2 — читаемый размер. */
const MOBILE_CARDS_PER_LEAF = 1;

/** Почти вся страница книги (только мобилка, без +/−). */
const MOBILE_SLOT_LEFT = { x: 17.5, y: 9, w: 32, h: 68 };
const MOBILE_SLOT_RIGHT = { x: 50, y: 9, w: 32, h: 68 };

const DOUBLE_TAP_MS = 340;
const CARRY_ARM_PX2 = 64; /* 8px */

type Tab = "oracle" | "deck";

type Props = {
  owned: OwnedState;
  displayName?: string;
  onChange: (o: OwnedState) => void;
  onBack: () => void;
  /** Выбор / покупка облика оракула. */
  onChooseHero?: () => void;
  /** Обучалка хаба: открыть вкладку колоды */
  forcedTab?: Tab;
};
type DragPayload = { cardId: string; from: "deck" | "case" };

const DND_MIME = "application/x-orakul-card";

function countIds(ids: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const id of ids) m[id] = (m[id] ?? 0) + 1;
  return m;
}

export function Cabinet({
  owned,
  displayName,
  onChange,
  onBack,
  onChooseHero,
  forcedTab,
}: Props) {
  const [tab, setTab] = useState<Tab>("oracle");
  /** Панель умений — по клику на портрет оракула. */
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const homeSchool = homeFactionOf(owned);
  const [bookSchool, setBookSchool] = useState<School>(homeSchool);
  const [bookSpread, setBookSpread] = useState(0);
  const [bookFlip, setBookFlip] = useState(0);
  const [bookFlipDir, setBookFlipDir] = useState<"fwd" | "back">("fwd");
  /** На телефоне drag блокирует скролл — только кнопки. */
  const [allowCardDrag, setAllowCardDrag] = useState(true);
  /** Узкий экран: 1+1 карта на разворот. */
  const [mobileBook, setMobileBook] = useState(false);
  const [bookLayout, setBookLayout] = useState<BookLayout>(() => loadBookLayout());
  const [calibrating, setCalibrating] = useState(false);
  const folioCoverRef = useRef<HTMLDivElement>(null);
  const handScrollRef = useRef<HTMLDivElement>(null);
  const carryGhostRef = useRef<HTMLDivElement>(null);
  const carryUnbindRef = useRef<(() => void) | null>(null);
  const carryMovedRef = useRef(false);
  const carryModeRef = useRef<"pending" | "scroll" | "drag">("pending");
  const carryStartRef = useRef<{
    cardId: string;
    from: "book" | "hand";
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);
  const lastTapRef = useRef<{ cardId: string; t: number } | null>(null);
  const [carryDrag, setCarryDrag] = useState<{
    cardId: string;
    from: "book" | "hand";
    x: number;
    y: number;
  } | null>(null);
  const [dragOver, setDragOver] = useState<"deck" | "case" | null>(null);
  const [bookInspectId, setBookInspectId] = useState<string | null>(null);

  useEffect(() => {
    if (forcedTab) setTab(forcedTab);
  }, [forcedTab]);

  useEffect(() => {
    if (tab !== "oracle") setSkillsOpen(false);
  }, [tab]);

  useEffect(() => {
    if (!skillsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSkillsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skillsOpen]);

  useEffect(() => {
    if (!calibrating) saveBookLayout(bookLayout);
  }, [bookLayout, calibrating]);

  useEffect(() => {
    setBookSchool(homeSchool);
  }, [homeSchool]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const coarse = window.matchMedia("(pointer: coarse)");
    const narrow = window.matchMedia("(max-width: 720px)");
    const sync = () => {
      setAllowCardDrag(!coarse.matches);
      setMobileBook(narrow.matches);
    };
    sync();
    coarse.addEventListener?.("change", sync);
    narrow.addEventListener?.("change", sync);
    return () => {
      coarse.removeEventListener?.("change", sync);
      narrow.removeEventListener?.("change", sync);
    };
  }, []);

  const cardsPerLeaf =
    mobileBook && !calibrating ? MOBILE_CARDS_PER_LEAF : DESKTOP_CARDS_PER_LEAF;
  const cardsPerSpread = cardsPerLeaf * 2;

  const level = playerLevel(owned);
  const xp = owned.xp ?? 0;
  const xpNeed = xpToNextLevel(level);
  const deckId = owned.activeDeckId;
  const hero = getHero(activeHeroId(owned));
  const epic = hero.tier === "epic";
  const hp = orakulBattleHp(hero.faction, level, hero.tier);
  const manaBonus =
    startManaBonus(level) +
    (epic ? 1 : 0) +
    (epic && hero.faction === "water" ? waterGiftStartMana(level) : 0);
  const giftText = epic ? oracleGiftCardText(hero.faction, level) : null;
  const lore = oracleLore(hero);
  const heroArt = orakulArtUrl(hero);

  const deck = useMemo(() => activeDeck(owned), [owned]);
  const deckCounts = useMemo(() => countIds(deck), [deck]);

  const caseCards = useMemo(() => {
    return sortCatalogCards(
      owned.unlocked
        .map((id) => CARDS.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => !!c),
    );
  }, [owned.unlocked]);

  const bookCardsBySchool = useMemo(() => {
    const map: Record<School, CardDef[]> = {
      life: [],
      death: [],
      water: [],
      hell: [],
      nature: [],
      neutral: [],
    };
    for (const c of caseCards) map[c.school].push(c);
    return map;
  }, [caseCards]);

  const bookSchoolCards = useMemo(() => {
    return sortCatalogCards(bookCardsBySchool[bookSchool] ?? []);
  }, [bookCardsBySchool, bookSchool]);

  const schoolCounts = useMemo(() => {
    const m: Record<School, number> = {
      life: 0,
      death: 0,
      water: 0,
      hell: 0,
      nature: 0,
      neutral: 0,
    };
    for (const s of BOOK_SCHOOLS) m[s] = bookCardsBySchool[s].length;
    return m;
  }, [bookCardsBySchool]);

  const spreadCount = Math.max(
    1,
    Math.ceil(bookSchoolCards.length / cardsPerSpread) || 1,
  );

  useEffect(() => {
    setBookSpread((i) => Math.min(i, Math.max(0, spreadCount - 1)));
  }, [spreadCount, bookSchool, cardsPerSpread]);

  const spreadCards = useMemo(() => {
    const start = bookSpread * cardsPerSpread;
    return bookSchoolCards.slice(start, start + cardsPerSpread);
  }, [bookSchoolCards, bookSpread, cardsPerSpread]);

  const leftPageCards = spreadCards.slice(0, cardsPerLeaf);
  const rightPageCards = spreadCards.slice(cardsPerLeaf, cardsPerSpread);

  const say = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 2200);
  };

  const addToDeck = (cardId: string) => {
    if (!isUnlocked(owned, cardId)) {
      say("Карта не открыта");
      return;
    }
    const have = ownedCopies(owned, cardId);
    const inDeck = deckCounts[cardId] ?? 0;
    const cap = Math.min(maxCopiesForCard(cardId), have);
    if (inDeck >= cap) {
      say(`Лимит копий «${getCard(cardId).name}»: ${cap}`);
      return;
    }
    if (deck.length >= DECK_SIZE) {
      say(`В колоде максимум ${DECK_SIZE} карт`);
      return;
    }
    const card = getCard(cardId);
    onChange(saveDeck(owned, deckId, [...deck, cardId]));
    say(`→ в колоду: ${card.name} (${inDeck + 1}/${cap})`);
  };

  const removeFromDeck = (cardId: string) => {
    if (!deckCounts[cardId]) {
      say("Этой карты нет в колоде");
      return;
    }
    const idx = deck.lastIndexOf(cardId);
    const next = deck.filter((_, i) => i !== idx);
    const card = getCard(cardId);
    onChange(saveDeck(owned, deckId, next));
    say(`← убрана копия: ${card.name}`);
  };

  const clearCarryLock = () => {
    document.documentElement.classList.remove("is-hand-dragging");
  };

  const hitCabinetDrop = (x: number, y: number): "hand" | "book" | null => {
    const stack =
      typeof document.elementsFromPoint === "function"
        ? document.elementsFromPoint(x, y)
        : [];
    for (const node of stack) {
      if (!(node instanceof Element)) continue;
      if (node.closest("[data-cabinet-drop='hand']")) return "hand";
      if (node.closest("[data-cabinet-drop='book']")) return "book";
    }
    return null;
  };

  /** Книга/рука: как в бою — зажал и несёшь; в руке вбок = прокрутка. */
  const onCarryPointerDown = (
    e: ReactPointerEvent,
    cardId: string,
    from: "book" | "hand",
  ) => {
    if (!mobileBook || calibrating) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const isTouch = e.pointerType === "touch" || e.pointerType === "pen";
    const anchor = e.currentTarget as HTMLElement;
    if (!isTouch) {
      e.preventDefault();
      try {
        anchor.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    e.stopPropagation();
    carryUnbindRef.current?.();
    carryMovedRef.current = false;
    carryModeRef.current = "pending";
    carryStartRef.current = {
      cardId,
      from,
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
    };
    const startScroll = handScrollRef.current?.scrollLeft ?? 0;
    let lastX = e.clientX;
    let lastY = e.clientY;

    const finish = (ev: PointerEvent) => {
      const start = carryStartRef.current;
      if (!start || start.pointerId !== ev.pointerId) return;
      const mode = carryModeRef.current;
      const moved = carryMovedRef.current;
      const x =
        Number.isFinite(ev.clientX) && ev.clientX !== 0 ? ev.clientX : lastX;
      const y =
        Number.isFinite(ev.clientY) && (ev.clientY !== 0 || lastY === 0)
          ? ev.clientY
          : lastY;
      carryStartRef.current = null;
      carryMovedRef.current = false;
      carryModeRef.current = "pending";
      carryUnbindRef.current?.();
      carryUnbindRef.current = null;
      clearCarryLock();
      setCarryDrag(null);
      setDragOver(null);

      if (mode === "scroll") return;

      if (!moved || mode === "pending") {
        const now = Date.now();
        const last = lastTapRef.current;
        if (last && last.cardId === start.cardId && now - last.t <= DOUBLE_TAP_MS) {
          lastTapRef.current = null;
          if (start.from === "hand") removeFromDeck(start.cardId);
          else if ((deckCounts[start.cardId] ?? 0) > 0)
            removeFromDeck(start.cardId);
          else addToDeck(start.cardId);
        } else {
          lastTapRef.current = { cardId: start.cardId, t: now };
        }
        return;
      }

      if (mode !== "drag") return;
      const zone = hitCabinetDrop(x, y);
      if (start.from === "book" && zone === "hand") {
        addToDeck(start.cardId);
        return;
      }
      if (start.from === "hand" && zone === "book") {
        removeFromDeck(start.cardId);
        return;
      }
    };

    const beginDrag = (clientX: number, clientY: number) => {
      carryModeRef.current = "drag";
      carryMovedRef.current = true;
      lastTapRef.current = null;
      try {
        anchor.setPointerCapture(
          carryStartRef.current?.pointerId ?? e.pointerId,
        );
      } catch {
        /* ignore */
      }
      document.documentElement.classList.add("is-hand-dragging");
      setCarryDrag({
        cardId,
        from,
        x: clientX,
        y: clientY,
      });
      setDragOver(from === "book" ? "deck" : "case");
    };

    const onMove = (ev: PointerEvent) => {
      const start = carryStartRef.current;
      if (!start || start.pointerId !== ev.pointerId) return;
      lastX = ev.clientX;
      lastY = ev.clientY;
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;

      if (carryModeRef.current === "pending") {
        const dist2 = dx * dx + dy * dy;
        if (dist2 < CARRY_ARM_PX2) return;
        if (isTouch && start.from === "hand") {
          const absX = Math.abs(dx);
          const absY = Math.abs(dy);
          if (absX > absY * 1.05) {
            carryModeRef.current = "scroll";
            carryMovedRef.current = true;
            const zone = handScrollRef.current;
            if (zone) zone.scrollLeft = startScroll - dx;
            return;
          }
          beginDrag(ev.clientX, ev.clientY);
          return;
        }
        beginDrag(ev.clientX, ev.clientY);
        return;
      }

      if (carryModeRef.current === "scroll") {
        const zone = handScrollRef.current;
        if (zone) zone.scrollLeft = startScroll - dx;
        return;
      }

      if (carryModeRef.current !== "drag") return;
      ev.preventDefault();
      const ghost = carryGhostRef.current;
      if (ghost) {
        ghost.style.left = `${ev.clientX}px`;
        ghost.style.top = `${ev.clientY}px`;
      }
      const zone = hitCabinetDrop(ev.clientX, ev.clientY);
      if (start.from === "book") {
        setDragOver(zone === "hand" ? "deck" : null);
      } else {
        setDragOver(zone === "book" ? "case" : null);
      }
      setCarryDrag((prev) =>
        prev ? { ...prev, x: ev.clientX, y: ev.clientY } : null,
      );
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    carryUnbindRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  };

  /** Пустое место / промежуток руки — тоже листает влево-вправо. */
  const onHandRailPointerDown = (e: ReactPointerEvent) => {
    if (!mobileBook || calibrating) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const zone = handScrollRef.current;
    if (!zone) return;
    if ((e.target as Element).closest?.(".cabinet-hand-gesture-target")) return;
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
  };

  useEffect(() => {
    return () => {
      carryUnbindRef.current?.();
      clearCarryLock();
    };
  }, []);

  const openBookSchool = (s: School) => {
    if (s === bookSchool) return;
    const from = BOOK_SCHOOLS.indexOf(bookSchool);
    const to = BOOK_SCHOOLS.indexOf(s);
    setBookFlipDir(to >= from ? "fwd" : "back");
    setBookSchool(s);
    setBookSpread(0);
    setBookFlip((n) => n + 1);
  };

  const turnBookPage = (dir: "fwd" | "back") => {
    if (dir === "fwd") {
      if (bookSpread >= spreadCount - 1) return;
      setBookFlipDir("fwd");
      setBookSpread((i) => i + 1);
      setBookFlip((n) => n + 1);
      return;
    }
    if (bookSpread <= 0) return;
    setBookFlipDir("back");
    setBookSpread((i) => i - 1);
    setBookFlip((n) => n + 1);
  };

  const renderAbsSlot = (
    card: CardDef | null,
    slotIndex: number,
    boxOverride?: { x: number; y: number; w: number; h: number },
  ) => {
    const box = boxOverride ?? bookLayout.slots[slotIndex];
    if (!card) {
      return (
        <div
          key={`slot-${slotIndex}`}
          className="oracle-book-abs-slot is-empty"
          style={slotBoxStyle(box)}
          aria-hidden
        />
      );
    }
    const inDeck = deckCounts[card.id] ?? 0;
    const have = ownedCopies(owned, card.id);
    const cap = Math.min(maxCopiesForCard(card.id), have);
    const canAdd = inDeck < cap && deck.length < DECK_SIZE && have > 0;
    const upLv = isUpgradeableCard(card.id)
      ? getCardUpgradeLevel(owned, card.id)
      : null;
    const bonus =
      upLv != null ? upgradeStatBonus(card.id, upLv) : { atk: 0, hp: 0 };
    const atk = (card.attack ?? 0) + bonus.atk;
    const hp = (card.health ?? 0) + bonus.hp;
    const mana = card.manaCost ?? {};
    const mobileHero = mobileBook && !calibrating;
    const ico = mobileHero ? 18 : 16;
    const manaIco = mobileHero ? 16 : 15;
    return (
      <div
        key={`slot-${slotIndex}-${card.id}`}
        className={`oracle-book-abs-slot ${allowCardDrag ? "is-draggable" : ""} ${inDeck > 0 ? "in-deck" : ""} ${mobileHero ? "is-mobile-hero" : ""} ${slotIndex < 4 ? "is-left-page" : "is-right-page"} ${carryDrag?.cardId === card.id && carryDrag.from === "book" ? "is-dragging" : ""}`}
        style={slotBoxStyle(box)}
        draggable={allowCardDrag && !calibrating && !mobileHero}
        onDragStart={
          allowCardDrag && !calibrating && !mobileHero
            ? (e) => onCardDragStart(e, card.id, "case")
            : undefined
        }
        onDragEnd={allowCardDrag ? () => setDragOver(null) : undefined}
        onPointerDown={
          mobileHero
            ? (e) => onCarryPointerDown(e, card.id, "book")
            : undefined
        }
        title={
          mobileHero
            ? `${card.name} · перетащи в руку`
            : `${card.name} · в колоду`
        }
      >
        <div className="oracle-book-slot-frame">
          <div className="oracle-book-frame-stage">
            <div
              className="oracle-book-card-core"
              style={{
                backgroundImage: `url(${cardArtUrl(card)})`,
                ...cardArtStyle(card),
              }}
              aria-hidden
            />
            <div className="oracle-book-stat-hud" aria-label="Показатели карты">
              <div className="oracle-book-stat-top">
                <span className="oracle-book-stat-school">
                  <GameIcon name={card.school} size={ico} />
                  <ManaCostIcons cost={mana} size={manaIco} />
                </span>
                {card.kind === "creature" ? (
                  <span className="oracle-book-stat-combat">
                    {atk}/{hp}
                  </span>
                ) : (
                  <span className="oracle-book-stat-combat">✦</span>
                )}
              </div>
              <div className="oracle-book-stat-name">{card.name}</div>
            </div>
            <img
              className="oracle-book-card-frame"
              src={
                mobileHero
                  ? "/ui/card-frame-book-mobile.png?v=1"
                  : "/ui/card-frame-book.png?v=9"
              }
              alt=""
              draggable={false}
            />
            {!calibrating ? (
              <button
                type="button"
                className="flip-btn oracle-book-flip-btn"
                title="Изучить свойства"
                aria-label={`Описание: ${card.name}`}
                draggable={false}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setBookInspectId(card.id);
                }}
              >
                ↻
              </button>
            ) : null}
          </div>
        </div>
        {mobileHero ? null : (
          <div className="oracle-book-slot-meta">
            <div className="cabinet-card-actions">
              <button
                type="button"
                className="oracle-book-qty is-add"
                disabled={!canAdd || calibrating}
                onClick={(e) => {
                  e.stopPropagation();
                  addToDeck(card.id);
                }}
                title={inDeck > 0 ? `в колоде ×${inDeck}` : `добавить в руку`}
                aria-label="Добавить в руку"
              >
                +
              </button>
              <button
                type="button"
                className="oracle-book-qty is-sub"
                disabled={inDeck <= 0 || calibrating}
                onClick={(e) => {
                  e.stopPropagation();
                  removeFromDeck(card.id);
                }}
                title="Убрать из руки"
                aria-label="Убрать из руки"
              >
                −
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const inDeckOnly = useMemo(() => {
    return Object.entries(deckCounts)
      .map(([id, n]) => {
        try {
          return { card: getCard(id), n };
        } catch {
          return null;
        }
      })
      .filter((x): x is { card: ReturnType<typeof getCard>; n: number } => !!x)
      .sort((a, b) => compareCatalogCards(a.card, b.card));
  }, [deckCounts]);

  const clearDeck = () => {
    if (deck.length === 0) {
      say("Колода уже пуста");
      return;
    }
    const ok = window.confirm(
      `Убрать все ${deck.length} карт из колоды обратно в книгу?`,
    );
    if (!ok) return;
    onChange(saveDeck(owned, deckId, []));
    say("Колода очищена — карты в книге");
  };

  const onCardDragStart = (
    e: DragEvent,
    cardId: string,
    from: "deck" | "case",
  ) => {
    const payload: DragPayload = { cardId, from };
    e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
    e.dataTransfer.setData("text/plain", cardId);
    e.dataTransfer.effectAllowed = "move";
  };

  const parseDrag = (e: DragEvent): DragPayload | null => {
    try {
      const raw =
        e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData("text/plain");
      if (!raw) return null;
      if (raw.startsWith("{")) return JSON.parse(raw) as DragPayload;
      return { cardId: raw, from: "case" };
    } catch {
      return null;
    }
  };

  const onDropToDeck = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const p = parseDrag(e);
    if (!p?.cardId) return;
    if (p.from === "deck") return;
    addToDeck(p.cardId);
  };

  const onDropToCase = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const p = parseDrag(e);
    if (!p?.cardId) return;
    if (p.from === "case" && (deckCounts[p.cardId] ?? 0) === 0) return;
    removeFromDeck(p.cardId);
  };

  return (
    <div className="cabinet">
      <header className="page-bar">
        <button type="button" className="ghost" onClick={onBack}>
          ← Меню
        </button>
        <h1>Личный кабинет</h1>
        <div className="wallet-row">
          <span className="wallet-chip gold" title="Золото">
            <GameIcon name="gold" size={16} /> {owned.gold ?? 0}
          </span>
          <span className="wallet-chip dia" title="Кристаллы">
            <GameIcon name="diamond" size={16} /> {owned.diamonds ?? 0}
          </span>
        </div>
      </header>

      <div className="tabs">
        <button
          type="button"
          className={tab === "oracle" ? "primary" : "ghost"}
          onClick={() => setTab("oracle")}
        >
          Оракул
        </button>
        <button
          type="button"
          className={tab === "deck" ? "primary" : "ghost"}
          onClick={() => setTab("deck")}
        >
          Колода и книга
        </button>
      </div>

      {flash && <div className="cabinet-flash">{flash}</div>}

      {tab === "oracle" && (
        <section className="cabinet-oracle-showcase" aria-label="Карта оракула">
          <div className={`cabinet-oracle-card ${epic ? "is-epic" : ""}`}>
            <div className="cabinet-oracle-art-wrap is-skills-hit">
              <img
                className="cabinet-oracle-art"
                src={heroArt}
                alt={hero.name}
                draggable={false}
              />
              <span className="orakul-level-badge on-portrait">
                ур. {level}
              </span>
              {epic && <span className="orakul-epic-badge">Эпик</span>}
              <button
                type="button"
                className="cabinet-oracle-skills-hit"
                onClick={() => setSkillsOpen(true)}
                aria-label="Открыть умения оракула"
              >
                <span className="cabinet-oracle-skills-cta">Умения</span>
              </button>
            </div>
            <div className="cabinet-oracle-body">
              <p className="cabinet-oracle-eyebrow inline-icos">
                {displayName ?? "Оракул"} ·{" "}
                <SchoolBadge school={hero.faction} size={14} />
              </p>
              <h2 className="cabinet-oracle-title">{hero.name}</h2>
              <p className="cabinet-oracle-lore">{lore}</p>

              <div className="cabinet-oracle-stats" aria-label="Статы">
                <div className="cabinet-stat">
                  <span className="cabinet-stat-label">HP</span>
                  <span className="cabinet-stat-value">{hp}</span>
                </div>
                <div className="cabinet-stat">
                  <span className="cabinet-stat-label">Уровень</span>
                  <span className="cabinet-stat-value">{level}</span>
                </div>
                <div className="cabinet-stat">
                  <span className="cabinet-stat-label">Старт маны</span>
                  <span className="cabinet-stat-value">
                    +{1 + manaBonus}
                  </span>
                </div>
                <div className="cabinet-stat wide">
                  <span className="cabinet-stat-label">Опыт</span>
                  <XpBar
                    level={level}
                    xp={xp}
                    xpNeed={xpNeed}
                    className="cabinet-xp"
                  />
                </div>
              </div>

              <div className="cabinet-oracle-powers">
                <h3>Возможности</h3>
                <ul>
                  <li>
                    Нажми на портрет оракула — откроются умения школы.
                  </li>
                  <li>
                    Старт: только своя школа (цифра выше); чужие с нуля. Чужие
                    +1 через ход; своя +1 каждый ход.
                  </li>
                  {giftText ? (
                    <li>{giftText}</li>
                  ) : (
                    <li>
                      Уникальный дар фракции — только у эпического облика
                      (магазин / выбор оракула).
                    </li>
                  )}
                  {epic && (
                    <li>
                      Эпик: +1 маны школы на старте и чуть сильнее умения.
                    </li>
                  )}
                </ul>
              </div>

              <button
                type="button"
                className="primary large"
                onClick={() => setSkillsOpen(true)}
              >
                Умения оракула
              </button>

              {onChooseHero ? (
                <button
                  type="button"
                  className="primary large cabinet-oracle-cta"
                  onClick={onChooseHero}
                >
                  Сменить оракула
                </button>
              ) : null}

              <p className="hint cabinet-oracle-hint">
                Фракция зафиксирована при создании. Эпик своей школы — здесь
                («Сменить оракула») или в магазине.
              </p>
            </div>
          </div>
        </section>
      )}

      {skillsOpen && (
        <div
          className="cabinet-skills-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Умения оракула"
        >
          <button
            type="button"
            className="cabinet-skills-backdrop"
            aria-label="Закрыть"
            onClick={() => setSkillsOpen(false)}
          />
          <div className="cabinet-skills-panel">
            <header className="cabinet-skills-head">
              <h3>Умения · {hero.name}</h3>
              <button
                type="button"
                className="ghost"
                onClick={() => setSkillsOpen(false)}
              >
                Закрыть
              </button>
            </header>
            <p className="hint">
              Очки:{" "}
              <strong>
                {normalizeOracleSkillState(owned, hero.faction).willPoints}
              </strong>
              . В бой — до 4. Активки 1× за бой. Купить: {SKILL_UNLOCK_COST}{" "}
              очков. Сброс: {SKILL_RESET_DIAMONDS}💎.
            </p>
            <div className="cabinet-skill-loadout" aria-label="Слоты в бой">
              {Array.from({ length: 4 }, (_, i) => {
                const st = normalizeOracleSkillState(owned, hero.faction);
                const id = st.loadout[i];
                const def = id ? getSkill(id) : null;
                return (
                  <button
                    key={`load-${i}`}
                    type="button"
                    className={`cabinet-skill-chip ${def ? "" : "is-empty"}`}
                    title={def ? `${def.name}: снять` : "Пустой слот"}
                    onClick={() => {
                      if (!def) return;
                      const r = setOracleSkillLoadoutSlot(
                        owned,
                        hero.faction,
                        i,
                        null,
                      );
                      if (r.ok) onChange(r.owned);
                    }}
                  >
                    {def ? (
                      <>
                        <SkillIcon icon={def.icon} size={16} />
                        <span>{def.name}</span>
                      </>
                    ) : (
                      <span>Слот {i + 1}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <ul className="cabinet-skill-list">
              {skillsForFaction(hero.faction).map((def) => {
                const st = normalizeOracleSkillState(owned, hero.faction);
                const visible = isSkillVisible(hero.faction, def.id, level);
                const bought = st.ownedSkills.includes(def.id);
                const equipped = st.loadout.includes(def.id);
                const unlockAt = skillUnlockLevel(hero.faction, def.id);
                return (
                  <li
                    key={def.id}
                    className={`cabinet-skill-row ${!visible ? "is-locked" : ""} ${bought ? "is-owned" : ""}`}
                  >
                    <SkillIcon icon={def.icon} size={18} />
                    <div className="cabinet-skill-meta">
                      <strong>
                        {def.name}{" "}
                        <span className="muted">
                          {def.kind === "active" ? "актив 1×" : "пассив"}
                        </span>
                      </strong>
                      <span>{def.text}</span>
                      {!visible ? (
                        <span className="muted">С ур. {unlockAt}</span>
                      ) : null}
                    </div>
                    <div className="cabinet-skill-actions">
                      {visible && !bought ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            const r = buyOracleSkill(
                              owned,
                              hero.faction,
                              def.id,
                            );
                            if (!r.ok) {
                              window.alert(r.reason ?? "Нельзя");
                              return;
                            }
                            onChange(r.owned);
                          }}
                        >
                          Купить {SKILL_UNLOCK_COST}
                        </button>
                      ) : null}
                      {bought && !equipped ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            const empty = st.loadout.findIndex((x) => !x);
                            if (empty < 0) {
                              window.alert("Все 4 слота заняты");
                              return;
                            }
                            const r = setOracleSkillLoadoutSlot(
                              owned,
                              hero.faction,
                              empty,
                              def.id,
                            );
                            if (r.ok) onChange(r.owned);
                          }}
                        >
                          В бой
                        </button>
                      ) : null}
                      {bought ? (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Сброс «${def.name}» за ${SKILL_RESET_DIAMONDS} алмазов?`,
                              )
                            ) {
                              return;
                            }
                            const r = resetOracleSkill(
                              owned,
                              hero.faction,
                              def.id,
                            );
                            if (!r.ok) {
                              window.alert(r.reason ?? "Нельзя");
                              return;
                            }
                            onChange(r.owned);
                          }}
                        >
                          Сброс {SKILL_RESET_DIAMONDS}💎
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {tab === "deck" && (
        <div className="cabinet-cards" data-tut="hub-deck-board">
          <section
            className={`cabinet-card-section cabinet-zone-deck cabinet-deck-hand drop-zone ${dragOver === "deck" ? "is-drop-target" : ""}`}
            data-cabinet-drop="hand"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOver("deck");
            }}
            onDragLeave={() => setDragOver((z) => (z === "deck" ? null : z))}
            onDrop={onDropToDeck}
          >
            <div className="cabinet-section-head cabinet-deck-hand-head">
              <h2>
                Колода{" "}
                <span className="cabinet-count">
                  {deck.length}/{DECK_SIZE}
                </span>
              </h2>
              <button
                type="button"
                className="ghost"
                disabled={deck.length === 0}
                onClick={clearDeck}
              >
                Очистить
              </button>
            </div>
            {inDeckOnly.length === 0 ? (
              <p className="hint drop-placeholder cabinet-deck-hand-empty">
                Карты из книги → сюда
              </p>
            ) : (
              <div
                ref={handScrollRef}
                className={`cabinet-deck-hand-scroll ${mobileBook ? "is-mobile-hand-scroll" : ""}`}
                onPointerDown={mobileBook ? onHandRailPointerDown : undefined}
              >
                {inDeckOnly.map(({ card, n }) => {
                  const have = ownedCopies(owned, card.id);
                  const cap = Math.min(maxCopiesForCard(card.id), have);
                  return (
                    <div
                      key={card.id}
                      className={`cabinet-hand-card ${allowCardDrag ? "is-draggable" : ""} ${mobileBook ? "is-mobile-gestures" : ""} ${carryDrag?.cardId === card.id && carryDrag.from === "hand" ? "is-dragging" : ""}`}
                      draggable={allowCardDrag && !mobileBook}
                      onDragStart={
                        allowCardDrag && !mobileBook
                          ? (e) => onCardDragStart(e, card.id, "deck")
                          : undefined
                      }
                      onDragEnd={
                        allowCardDrag ? () => setDragOver(null) : undefined
                      }
                      title={
                        mobileBook
                          ? `${card.name} · перетащи в книгу`
                          : card.name
                      }
                    >
                      <div
                        className="cabinet-hand-gesture-target"
                        onPointerDown={
                          mobileBook
                            ? (e) => onCarryPointerDown(e, card.id, "hand")
                            : undefined
                        }
                      >
                        <CardView
                          card={card}
                          compact
                          flippable={false}
                          upgradeLevel={
                            isUpgradeableCard(card.id)
                              ? getCardUpgradeLevel(owned, card.id)
                              : null
                          }
                        />
                      </div>
                      {!mobileBook ? (
                        <div className="cabinet-hand-actions">
                          <button
                            type="button"
                            className="primary"
                            disabled={n >= cap || deck.length >= DECK_SIZE}
                            onClick={(e) => {
                              e.stopPropagation();
                              addToDeck(card.id);
                            }}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromDeck(card.id);
                            }}
                          >
                            −
                          </button>
                        </div>
                      ) : n > 1 ? (
                        <span className="cabinet-hand-qty">×{n}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section
            className={`cabinet-card-section cabinet-zone-case oracle-book drop-zone ${dragOver === "case" ? "is-drop-target" : ""}`}
            data-tut="hub-deck-case"
            data-cabinet-drop="book"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOver("case");
            }}
            onDragLeave={() => setDragOver((z) => (z === "case" ? null : z))}
            onDrop={onDropToCase}
          >
            <div className="oracle-folio" aria-label="Фолиант оракула">
              <button
                type="button"
                className={`ob-cal-toggle ${calibrating ? "primary" : "ghost"}`}
                onClick={() => setCalibrating((v) => !v)}
                title="Подогнать книгу мышкой, как в Paint"
              >
                {calibrating ? "Калибровка: вкл" : "Подогнать мышкой"}
              </button>
              <div
                ref={folioCoverRef}
                className={`oracle-folio-cover ${calibrating ? "is-calibrating" : ""}`}
                style={bookLayoutToCssVars(bookLayout)}
              >
                <img
                  className="oracle-folio-art"
                  src="/ui/oracle-book.png"
                  alt=""
                  draggable={false}
                />
                {calibrating ? (
                  <OracleBookCalibrate
                    layout={bookLayout}
                    onChange={setBookLayout}
                    onClose={() => {
                      saveBookLayout(bookLayout);
                      setCalibrating(false);
                    }}
                    coverRef={folioCoverRef}
                  />
                ) : null}
                <nav className="oracle-book-ribbons" aria-label="Школы">
                  {BOOK_SCHOOLS.map((s, i) => {
                    const n = schoolCounts[s];
                    const on = bookSchool === s;
                    const box = bookLayout.ribbons[i];
                    return (
                      <button
                        key={s}
                        type="button"
                        className={`oracle-book-ribbon ${on ? "is-on" : ""}`}
                        style={ribbonButtonStyle(box, SCHOOL_COLOR[s])}
                        onClick={() => openBookSchool(s)}
                        title={`${SCHOOL_LABEL[s]} · ${n}`}
                        aria-label={`${SCHOOL_LABEL[s]}, ${n} карт`}
                        aria-pressed={on}
                      >
                        <span className="oracle-book-ribbon-name">
                          {SCHOOL_LABEL[s]}
                        </span>
                      </button>
                    );
                  })}
                </nav>

                <button
                  type="button"
                  className="oracle-book-turn is-back"
                  style={turnButtonStyle(bookLayout.btnBack)}
                  disabled={bookSpread <= 0 || calibrating}
                  onClick={() => turnBookPage("back")}
                  aria-label="Назад"
                >
                  НАЗАД
                </button>
                <button
                  type="button"
                  className="oracle-book-turn is-fwd"
                  style={turnButtonStyle(
                    mobileBook && !calibrating
                      ? {
                          ...bookLayout.btnFwd,
                          x: Math.max(0, bookLayout.btnFwd.x - 1.4),
                          w: Math.min(28, bookLayout.btnFwd.w + 3.6),
                        }
                      : bookLayout.btnFwd,
                  )}
                  disabled={
                    bookSpread >= spreadCount - 1 ||
                    calibrating ||
                    bookSchoolCards.length === 0
                  }
                  onClick={() => turnBookPage("fwd")}
                  aria-label="Вперёд"
                >
                  ВПЕРЕД
                </button>

                <div
                  key={bookFlip}
                  className={`oracle-book-spread is-flip is-turn-${bookFlipDir}`}
                  data-school={bookSchool}
                >
                  <div className="oracle-book-leaf" aria-hidden="true" />
                  {bookSchoolCards.length === 0 ? (
                    <p className="oracle-book-empty is-abs">
                      Пустая глава «{SCHOOL_LABEL[bookSchool]}»
                    </p>
                  ) : mobileBook && !calibrating ? (
                    <>
                      {renderAbsSlot(
                        leftPageCards[0] ?? null,
                        0,
                        MOBILE_SLOT_LEFT,
                      )}
                      {renderAbsSlot(
                        rightPageCards[0] ?? null,
                        4,
                        MOBILE_SLOT_RIGHT,
                      )}
                    </>
                  ) : (
                    <>
                      {Array.from({ length: cardsPerLeaf }, (_, i) =>
                        renderAbsSlot(leftPageCards[i] ?? null, i),
                      )}
                      {Array.from({ length: cardsPerLeaf }, (_, i) =>
                        renderAbsSlot(rightPageCards[i] ?? null, i + 4),
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {carryDrag ? (
        <div
          ref={carryGhostRef}
          className="hand-drag-ghost"
          style={{ left: carryDrag.x, top: carryDrag.y }}
          aria-hidden
        >
          <CardView
            card={getCard(carryDrag.cardId)}
            compact
            flippable={false}
            upgradeLevel={
              isUpgradeableCard(carryDrag.cardId)
                ? getCardUpgradeLevel(owned, carryDrag.cardId)
                : null
            }
          />
        </div>
      ) : null}

      {bookInspectId ? (
        <CardView
          key={`inspect-${bookInspectId}`}
          cardId={bookInspectId}
          flippable={false}
          autoOpenDesc
          onDescClose={() => setBookInspectId(null)}
          upgradeLevel={
            isUpgradeableCard(bookInspectId)
              ? getCardUpgradeLevel(owned, bookInspectId)
              : null
          }
        />
      ) : null}
    </div>
  );
}
