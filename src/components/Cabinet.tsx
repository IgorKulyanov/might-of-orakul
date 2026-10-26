import { useEffect, useMemo, useState, type DragEvent } from "react";
import { CardView } from "./CardView";
import {
  CARDS,
  DECK_SIZE,
  SCHOOL_LABEL,
  compareCatalogCards,
  getCard,
  maxCopiesForCard,
  sortCatalogCards,
} from "../game/cards";
import {
  activeDeck,
  activeHeroId,
  isUnlocked,
  ownedCopies,
  playerLevel,
  resetCaseToStarters,
  saveDeck,
} from "../game/owned";
import { getHero, oracleLore, orakulArtUrl } from "../game/heroes";
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
import type { OwnedState } from "../game/types";
import { XpBar } from "./XpBar";

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

  useEffect(() => {
    if (forcedTab) setTab(forcedTab);
  }, [forcedTab]);
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
      `Сбросить все ${deck.length} карт из колоды в кейс?`,
    );
    if (!ok) return;
    onChange(saveDeck(owned, deckId, []));
    say("Колода очищена — всё в кейсе");
  };

  const wipeCaseToStart = () => {
    const ok = window.confirm(
      "Сбросить кейс и колоду до старта школы (4 карты ×1)? Купленное пропадёт.",
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
            🪙 {owned.gold ?? 0}
          </span>
          <span className="wallet-chip dia" title="Кристаллы">
            💎 {owned.diamonds ?? 0}
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
          Колода и кейс
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
              <p className="cabinet-oracle-eyebrow">
                {displayName ?? "Оракул"} · {SCHOOL_LABEL[hero.faction]}
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
                    Каждый ход +1 маны своей фракции; остальные +1 раз в два
                    хода.
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
            Колода до {DECK_SIZE} карт. Обычные — до{" "}
            <strong>2 копий</strong>, эпик/легенда — 1. В бою колода мешается
            как есть (две одинаковые = чаще выпадают). Сейчас: {deck.length}/
            {DECK_SIZE}.
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
                  {deck.length}/{DECK_SIZE} · из кейса
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
                  Сброс кейса до старта
                </button>
              </div>
            </div>
            {inDeckOnly.length === 0 ? (
              <p className="hint drop-placeholder">
                Добавь карты из кейса кнопкой или перетаскиванием
              </p>
            ) : (
              <div className="cabinet-card-grid">
                {inDeckOnly.map(({ card, n }) => {
                  const have = ownedCopies(owned, card.id);
                  const cap = Math.min(maxCopiesForCard(card.id), have);
                  return (
                    <div
                      key={card.id}
                      className="cabinet-card-item in-deck is-draggable"
                      draggable
                      onDragStart={(e) => onCardDragStart(e, card.id, "deck")}
                      onDragEnd={() => setDragOver(null)}
                      title="Убрать одну копию из колоды"
                    >
                      <CardView card={card} compact flippable />
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
            className={`cabinet-card-section cabinet-zone-case drop-zone ${dragOver === "case" ? "is-drop-target" : ""}`}
            data-tut="hub-deck-case"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOver("case");
            }}
            onDragLeave={() => setDragOver((z) => (z === "case" ? null : z))}
            onDrop={onDropToCase}
          >
            <h2>
              В кейсе{" "}
              <span className="cabinet-count">
                {caseCards.length} · сюда из колоды
              </span>
            </h2>
            <div className="cabinet-card-grid">
              {caseCards.map((card) => {
                const inDeck = deckCounts[card.id] ?? 0;
                const have = ownedCopies(owned, card.id);
                const cap = Math.min(maxCopiesForCard(card.id), have);
                const canAdd =
                  inDeck < cap && deck.length < DECK_SIZE && have > 0;
                return (
                  <div
                    key={card.id}
                    className={`cabinet-card-item is-draggable ${inDeck > 0 ? "in-deck" : "in-case"}`}
                    draggable
                    onDragStart={(e) => onCardDragStart(e, card.id, "case")}
                    onDragEnd={() => setDragOver(null)}
                    title="Добавить копию в колоду"
                  >
                    <CardView card={card} compact flippable />
                    <div className="cabinet-card-meta">
                      <strong>{card.name}</strong>
                      <span
                        className={
                          inDeck > 0 ? "badge-in-deck" : "badge-in-case"
                        }
                      >
                        {inDeck > 0
                          ? `В колоде ×${inDeck}/${cap}`
                          : `В кейсе ×${have}`}
                      </span>
                      <span className="tier-chip">
                        есть {have}/{maxCopiesForCard(card.id)}
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
                          disabled={!canAdd}
                          onClick={(e) => {
                            e.stopPropagation();
                            addToDeck(card.id);
                          }}
                        >
                          + в колоду
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
                          − из колоды
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
