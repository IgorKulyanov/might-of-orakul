import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { CardView } from "./CardView";
import {
  CARDS,
  DECK_SIZE,
  SCHOOL_COLOR,
  SCHOOL_LABEL,
  compareCatalogCards,
  getCard,
  maxCopiesForCard,
  sortCatalogCards,
} from "../game/cards";
import {
  getCardUpgradeLevel,
  isUpgradeableCard,
} from "../game/cardUpgrades";
import {
  activeDeck,
  activeHeroId,
  homeFactionOf,
  isUnlocked,
  ownedCopies,
  playerLevel,
  resetCaseToStarters,
  saveDeck,
} from "../game/owned";
import { getHero, oracleLore, orakulArtUrl } from "../game/heroes";
import { GameIcon, SchoolBadge } from "./GameIcon";
import {
  oracleGiftCardText,
  orakulBattleHp,
  waterGiftStartMana,
} from "../game/oracleGifts";
import {
  UNIT_TIER_LABEL,
  startManaBonus,
  xpToNextLevel,
} from "../game/progression";
import type { CardDef, OwnedState, School } from "../game/types";
import { XpBar } from "./XpBar";

const BOOK_SCHOOLS: School[] = [
  "life",
  "death",
  "water",
  "hell",
  "nature",
  "neutral",
];

const BOOK_TIERS = [1, 2, 3, 4, 5] as const;
type BookTier = (typeof BOOK_TIERS)[number];

function cardBookTier(card: CardDef): BookTier {
  const n = Math.floor(Number(card.unitLevel) || 0);
  if (n >= 5) return 5;
  if (n >= 4) return 4;
  if (n >= 3) return 3;
  if (n >= 2) return 2;
  return 1;
}

function GemTitle({ text }: { text: string }) {
  return (
    <h2 className="oracle-book-gem-title" aria-label={text}>
      {[...text].map((ch, i) => (
        <span
          key={`${ch}-${i}`}
          className={`oracle-gem-bezel is-gem-${(i % 5) + 1}`}
          style={{ animationDelay: `${i * 0.07}s` }}
        >
          <span className="oracle-gem-facet" aria-hidden="true" />
          <span className="oracle-gem-letter">{ch === " " ? "\u00a0" : ch}</span>
        </span>
      ))}
    </h2>
  );
}

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
  const [flash, setFlash] = useState<string | null>(null);
  const homeSchool = homeFactionOf(owned);
  const [bookSchool, setBookSchool] = useState<School>(homeSchool);
  const [bookTier, setBookTier] = useState<BookTier | "all">("all");
  const [bookFlip, setBookFlip] = useState(0);
  /** На телефоне drag блокирует скролл — только кнопки. */
  const [allowCardDrag, setAllowCardDrag] = useState(true);

  useEffect(() => {
    if (forcedTab) setTab(forcedTab);
  }, [forcedTab]);

  useEffect(() => {
    setBookSchool(homeSchool);
  }, [homeSchool]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setAllowCardDrag(!mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

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

  const bookPageCards = useMemo(() => {
    const pool = bookCardsBySchool[bookSchool] ?? [];
    const filtered =
      bookTier === "all"
        ? pool
        : pool.filter((c) => cardBookTier(c) === bookTier);
    return sortCatalogCards(filtered);
  }, [bookCardsBySchool, bookSchool, bookTier]);

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

  const tierCounts = useMemo(() => {
    const pool = bookCardsBySchool[bookSchool] ?? [];
    const m: Record<BookTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const c of pool) m[cardBookTier(c)] += 1;
    return m;
  }, [bookCardsBySchool, bookSchool]);

  const openBookSchool = (s: School) => {
    if (s === bookSchool) return;
    setBookSchool(s);
    setBookTier("all");
    setBookFlip((n) => n + 1);
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

  const wipeCaseToStart = () => {
    const ok = window.confirm(
      "Сбросить книгу и колоду до старта школы (4 карты ×1)? Купленное пропадёт.",
    );
    if (!ok) return;
    onChange(resetCaseToStarters(owned));
    say("Стартовые 4 карты восстановлены");
  };

  const [dragOver, setDragOver] = useState<"deck" | "case" | null>(null);

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
            <div className="cabinet-oracle-art-wrap">
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
                    Своя школа +1 маны каждый ход; чужие — через ход. На старте
                    у всех школ база 1, своя чуть сильнее.
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
                    <li>Эпический облик: ещё +1 маны своей школы на старте.</li>
                  )}
                </ul>
              </div>

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

      {tab === "deck" && (
        <div className="cabinet-cards" data-tut="hub-deck-board">
          <p className="hint cabinet-transfer-hint">
            Колода до {DECK_SIZE} карт, по <strong>1 копии</strong> каждой —
            сила через прокачку осколками. Сейчас: {deck.length}/{DECK_SIZE}.
          </p>

          <section
            className={`cabinet-card-section cabinet-zone-deck drop-zone ${dragOver === "deck" ? "is-drop-target" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOver("deck");
            }}
            onDragLeave={() => setDragOver((z) => (z === "deck" ? null : z))}
            onDrop={onDropToDeck}
          >
            <div className="cabinet-section-head">
              <h2>
                В колоде{" "}
                <span className="cabinet-count">
                  {deck.length}/{DECK_SIZE} · из книги
                </span>
              </h2>
              <div className="cabinet-section-actions">
                <button
                  type="button"
                  className="ghost"
                  disabled={deck.length === 0}
                  onClick={clearDeck}
                >
                  Очистить колоду
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={wipeCaseToStart}
                >
                  Сброс книги до старта
                </button>
              </div>
            </div>
            {inDeckOnly.length === 0 ? (
              <p className="hint drop-placeholder">
                Добавь карты из книги кнопкой или перетаскиванием
              </p>
            ) : (
              <div className="cabinet-card-grid">
                {inDeckOnly.map(({ card, n }) => {
                  const have = ownedCopies(owned, card.id);
                  const cap = Math.min(maxCopiesForCard(card.id), have);
                  return (
                    <div
                      key={card.id}
                      className={`cabinet-card-item in-deck ${allowCardDrag ? "is-draggable" : ""}`}
                      draggable={allowCardDrag}
                      onDragStart={
                        allowCardDrag
                          ? (e) => onCardDragStart(e, card.id, "deck")
                          : undefined
                      }
                      onDragEnd={
                        allowCardDrag ? () => setDragOver(null) : undefined
                      }
                      title="Убрать одну копию из колоды"
                    >
                      <CardView
                        card={card}
                        compact
                        flippable
                        upgradeLevel={
                          isUpgradeableCard(card.id)
                            ? getCardUpgradeLevel(owned, card.id)
                            : null
                        }
                      />
                      <div className="cabinet-card-meta">
                        <strong>{card.name}</strong>
                        <span className="badge-in-deck">
                          В колоде ×{n}
                          {cap > 1 ? ` / ${cap}` : ""}
                        </span>
                        {card.unitLevel != null && (
                          <span className="tier-chip">
                            {UNIT_TIER_LABEL[card.unitLevel]}
                          </span>
                        )}
                        <div className="cabinet-card-actions">
                          <button
                            type="button"
                            className="primary"
                            disabled={n >= cap || deck.length >= DECK_SIZE}
                            onClick={(e) => {
                              e.stopPropagation();
                              addToDeck(card.id);
                            }}
                          >
                            + копия
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromDeck(card.id);
                            }}
                          >
                            − копия
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section
            className={`cabinet-card-section cabinet-zone-case oracle-book drop-zone ${dragOver === "case" ? "is-drop-target" : ""}`}
            data-tut="hub-deck-case"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOver("case");
            }}
            onDragLeave={() => setDragOver((z) => (z === "case" ? null : z))}
            onDrop={onDropToCase}
          >
            <div className="oracle-folio" aria-label="Фолиант оракула">
              <div className="oracle-folio-cover">
                <div className="oracle-folio-spine" aria-hidden="true">
                  <span className="oracle-folio-spine-band" />
                  <span className="oracle-folio-spine-band" />
                  <span className="oracle-folio-spine-band" />
                </div>
                <div className="oracle-folio-clasp" aria-hidden="true" />
                <div className="oracle-folio-corner oracle-folio-corner-tl" />
                <div className="oracle-folio-corner oracle-folio-corner-tr" />
                <div className="oracle-folio-corner oracle-folio-corner-bl" />
                <div className="oracle-folio-corner oracle-folio-corner-br" />

                <header className="oracle-book-head">
                  <div className="oracle-title-plaque">
                    <GemTitle text="ОРАКУЛ" />
                  </div>
                  <p className="oracle-book-sub">
                    Древний фолиант · {caseCards.length}{" "}
                    {caseCards.length === 1 ? "лист" : "листов"}
                  </p>
                </header>

                <nav className="oracle-book-ribbons" aria-label="Школы">
                  {BOOK_SCHOOLS.map((s) => {
                    const n = schoolCounts[s];
                    const on = bookSchool === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        className={`oracle-book-ribbon ${on ? "is-on" : ""}`}
                        style={
                          {
                            "--school": SCHOOL_COLOR[s],
                          } as CSSProperties
                        }
                        onClick={() => openBookSchool(s)}
                        title={`${SCHOOL_LABEL[s]} · ${n}`}
                        aria-pressed={on}
                      >
                        <SchoolBadge school={s} size={12} hideLabel />
                        <span className="oracle-book-ribbon-name">
                          {SCHOOL_LABEL[s]}
                        </span>
                        <span className="oracle-book-ribbon-n">{n}</span>
                      </button>
                    );
                  })}
                </nav>

                <div
                  key={bookFlip}
                  className="oracle-book-spread is-flip"
                  data-school={bookSchool}
                >
                  <div className="oracle-book-page-edge" aria-hidden="true" />
                  <div className="oracle-book-page">
                    <div className="oracle-book-page-head">
                      <span className="oracle-book-page-school">
                        <SchoolBadge
                          school={bookSchool}
                          size={16}
                          hideLabel
                        />{" "}
                        {SCHOOL_LABEL[bookSchool]}
                      </span>
                      <span className="oracle-book-page-hint">
                        Глава школы
                      </span>
                    </div>

                    <div className="oracle-book-tiers" role="tablist">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={bookTier === "all"}
                        className={`oracle-book-tier ${bookTier === "all" ? "is-on" : ""}`}
                        onClick={() => setBookTier("all")}
                      >
                        Все · {schoolCounts[bookSchool]}
                      </button>
                      {BOOK_TIERS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          role="tab"
                          aria-selected={bookTier === t}
                          className={`oracle-book-tier ${bookTier === t ? "is-on" : ""}`}
                          onClick={() => setBookTier(t)}
                          disabled={tierCounts[t] === 0}
                        >
                          {UNIT_TIER_LABEL[t].split(" · ")[0]} · {tierCounts[t]}
                        </button>
                      ))}
                    </div>

                    {bookPageCards.length === 0 ? (
                      <p className="oracle-book-empty">
                        Пустая глава этой школы
                        {bookTier !== "all"
                          ? ` · ${UNIT_TIER_LABEL[bookTier]}`
                          : ""}
                        . Купленные и прокачанные карты появятся здесь.
                      </p>
                    ) : (
                      <div className="oracle-book-slots">
                        {bookPageCards.map((card) => {
                          const inDeck = deckCounts[card.id] ?? 0;
                          const have = ownedCopies(owned, card.id);
                          const cap = Math.min(
                            maxCopiesForCard(card.id),
                            have,
                          );
                          const canAdd =
                            inDeck < cap &&
                            deck.length < DECK_SIZE &&
                            have > 0;
                          return (
                            <div
                              key={card.id}
                              className={`oracle-book-slot ${allowCardDrag ? "is-draggable" : ""} ${inDeck > 0 ? "in-deck" : ""}`}
                              draggable={allowCardDrag}
                              onDragStart={
                                allowCardDrag
                                  ? (e) =>
                                      onCardDragStart(e, card.id, "case")
                                  : undefined
                              }
                              onDragEnd={
                                allowCardDrag
                                  ? () => setDragOver(null)
                                  : undefined
                              }
                              title={`${card.name} · в колоду`}
                            >
                              <div className="oracle-book-slot-frame">
                                <CardView
                                  card={card}
                                  compact
                                  flippable
                                  upgradeLevel={
                                    isUpgradeableCard(card.id)
                                      ? getCardUpgradeLevel(owned, card.id)
                                      : null
                                  }
                                />
                              </div>
                              <div className="oracle-book-slot-meta">
                                <span
                                  className={
                                    inDeck > 0
                                      ? "badge-in-deck"
                                      : "badge-in-case"
                                  }
                                >
                                  {inDeck > 0
                                    ? `колода ×${inDeck}`
                                    : `×${have}`}
                                </span>
                                <div className="cabinet-card-actions">
                                  <button
                                    type="button"
                                    className="primary"
                                    disabled={!canAdd}
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
                                    disabled={inDeck <= 0}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeFromDeck(card.id);
                                    }}
                                  >
                                    −
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
