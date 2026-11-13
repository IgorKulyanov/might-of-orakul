import { useEffect, useMemo, useRef, useState } from "react";
import { CardView } from "./CardView";
import {
  CARDS,
  DECK_SIZE,
  MIN_DECK_SIZE,
  SCHOOL_LABEL,
  maxCopiesForCard,
  sortCatalogCards,
} from "../game/cards";
import {
  GameIcon,
  SchoolBadge,
  diamondText,
  goldText,
} from "./GameIcon";
import { analyzeDeck } from "../game/deckStats";
import { getHero } from "../game/heroes";
import {
  UNIT_TIER_LABEL,
  isCardAvailableInShop,
  minPlayerLevelForShopCard,
  starterDeckForFaction,
} from "../game/progression";
import { apiCreatePayment, apiShopBuy } from "../game/api";
import {
  getCardShards,
  getCardUpgradeLevel,
  isUpgradeableCard,
  shardsNeededForNext,
  shardsNeededForUnlock,
  shardsPerShopBuy,
} from "../game/cardUpgrades";
import {
  buyShardsWithDiamonds,
  buyShardsWithGold,
  canBuyShardsForCard,
  exchangeDiamondsAmount,
  isUnlocked,
  ownedCopies,
  playerLevel,
  saveDeck,
  tryUpgradeCard,
} from "../game/owned";
import type { CardKind, OwnedState, School } from "../game/types";
import { USER_AGREEMENT_URL } from "../game/legal";
import {
  DIAMOND_PACKS,
  EXCHANGE_QUICK_AMOUNTS,
  GOLD_PER_DIAMOND,
  goldForDiamonds,
} from "../game/shop";

type KindFilter = "all" | CardKind;
type ShopTab = "cards" | "deck" | "currency";

type Props = {
  owned: OwnedState;
  onChange: (o: OwnedState) => void;
  onBack: () => void;
  /** Обучалка хаба: принудительно открыть вкладку */
  forcedTab?: ShopTab;
  /** Токен сессии — для оплаты ЮKassa. */
  authToken?: string | null;
};

const SCHOOLS: Array<School | "all"> = [
  "all",
  "water",
  "hell",
  "death",
  "life",
  "nature",
  "neutral",
];

export function Collection({
  owned,
  onChange,
  onBack,
  forcedTab,
  authToken = null,
}: Props) {
  const deckId = owned.activeDeckId;
  const [deck, setDeck] = useState<string[]>(
    () => owned.decks[deckId] ?? [],
  );
  const [filter, setFilter] = useState<School | "all">("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [tab, setTab] = useState<ShopTab>("cards");
  const [flash, setFlash] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState<string | null>(null);
  const [unlockReveal, setUnlockReveal] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const unlockTimer = useRef<number | null>(null);

  useEffect(() => {
    if (forcedTab) setTab(forcedTab);
  }, [forcedTab]);
  const diaBalance = owned.diamonds ?? 0;
  const [exchangeAmt, setExchangeAmt] = useState(1);

  const homeFaction = useMemo(() => {
    try {
      return (
        owned.homeFaction ??
        getHero(owned.heroId ?? "hero_life").faction
      );
    } catch {
      return "life" as const;
    }
  }, [owned.homeFaction, owned.heroId]);

  const deckStats = useMemo(
    () => analyzeDeck(deck, homeFaction),
    [deck, homeFaction],
  );

  useEffect(() => {
    setDeck(owned.decks[deckId] ?? []);
  }, [owned.decks, deckId]);

  useEffect(() => {
    setExchangeAmt((n) => Math.min(Math.max(1, n), Math.max(1, diaBalance)));
  }, [diaBalance]);

  const catalogStats = useMemo(() => {
    const creatures = CARDS.filter((c) => c.kind === "creature").length;
    const spells = CARDS.filter((c) => c.kind === "spell").length;
    const unlocked = owned.unlocked.filter((id) =>
      CARDS.some((c) => c.id === id),
    ).length;
    return { total: CARDS.length, creatures, spells, unlocked };
  }, [owned.unlocked]);

  const list = useMemo(() => {
    return sortCatalogCards(
      CARDS.filter((c) => {
        if (filter !== "all" && c.school !== filter) return false;
        if (kindFilter !== "all" && c.kind !== kindFilter) return false;
        return true;
      }),
    );
  }, [filter, kindFilter]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const id of deck) m[id] = (m[id] ?? 0) + 1;
    return m;
  }, [deck]);

  const say = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 2200);
  };

  const showUnlockReveal = (id: string, name: string) => {
    if (unlockTimer.current != null) {
      window.clearTimeout(unlockTimer.current);
    }
    setUnlockReveal({ id, name });
    unlockTimer.current = window.setTimeout(() => {
      setUnlockReveal(null);
      unlockTimer.current = null;
    }, 2800);
  };

  useEffect(() => {
    return () => {
      if (unlockTimer.current != null) window.clearTimeout(unlockTimer.current);
    };
  }, []);

  const commitDeck = (next: string[]) => {
    const saved = saveDeck(owned, deckId, next);
    const normalized = saved.decks[deckId] ?? [];
    setDeck(normalized);
    onChange(saved);
  };

  const addToDeck = (id: string) => {
    if (!isUnlocked(owned, id)) return;
    const inDeck = counts[id] ?? 0;
    const ownedN = ownedCopies(owned, id);
    const cap = Math.min(maxCopiesForCard(id), ownedN);
    if (inDeck >= cap) {
      say(
        inDeck >= ownedN
          ? `Нет свободных копий (в коллекции ${ownedN})`
          : `Лимит копий: ${cap}`,
      );
      return;
    }
    if (deck.length >= DECK_SIZE) {
      say(`В колоде максимум ${DECK_SIZE} карт`);
      return;
    }
    commitDeck([...deck, id]);
  };

  const removeFromDeck = (index: number) => {
    commitDeck(deck.filter((_, i) => i !== index));
  };

  const removeOneFromDeck = (id: string) => {
    const idx = deck.lastIndexOf(id);
    if (idx < 0) return;
    commitDeck(deck.filter((_, i) => i !== idx));
  };

  const upgrade = (id: string) => {
    const res = tryUpgradeCard(owned, id);
    if (!res.ok) {
      say(res.reason ?? "Нельзя улучшить");
      return;
    }
    onChange(res.owned);
    say(`«${CARDS.find((c) => c.id === id)?.name ?? id}» → ур.${getCardUpgradeLevel(res.owned, id)}`);
  };

  const shopBusy = useRef(false);

  /** Золото / алмазы: ровно 1 осколок за клик. В оракул — только после порога ур.1. */
  const buy = (id: string, withDiamonds = false) => {
    if (shopBusy.current) return;
    shopBusy.current = true;
    const card = CARDS.find((c) => c.id === id);
    if (!card) {
      shopBusy.current = false;
      return;
    }
    const lv = playerLevel(owned);
    if (!isCardAvailableInShop(card, lv)) {
      shopBusy.current = false;
      say(`«${card.name}» с ${minPlayerLevelForShopCard(card)} ур.`);
      return;
    }
    if (!canBuyShardsForCard(owned, id)) {
      shopBusy.current = false;
      say(
        ownedCopies(owned, id) > 0
          ? `«${card.name}» уже макс — ценник не нужен`
          : `«${card.name}» пока недоступна`,
      );
      return;
    }
    const shardN = shardsPerShopBuy(id);
    const currency = withDiamonds ? "diamonds" : "gold";
    if (withDiamonds) {
      const price = card.priceDiamonds ?? 0;
      if (!price) {
        shopBusy.current = false;
        return;
      }
      if ((owned.diamonds ?? 0) < price) {
        shopBusy.current = false;
        alert(`Не хватает алмазов (нужно ${diamondText(price)}).`);
        return;
      }
    } else {
      const price = card.priceGold ?? 0;
      const gold = owned.gold ?? 0;
      if (gold < price) {
        shopBusy.current = false;
        alert(
          `Не хватает золота.\nНужно ${goldText(price)}, у тебя ${goldText(gold)}`,
        );
        return;
      }
    }
    const localBuy = () =>
      withDiamonds
        ? buyShardsWithDiamonds(owned, id)
        : buyShardsWithGold(owned, id);
    void commitBuy(id, currency, localBuy, shardN);
  };

  const commitBuy = async (
    cardId: string,
    currency: "gold" | "diamonds",
    localBuy: () => OwnedState,
    shardN: number,
  ) => {
    const cardName =
      CARDS.find((c) => c.id === cardId)?.name ?? cardId;
    const before = owned;
    const hadCopy = ownedCopies(before, cardId) > 0;
    const flashAfter = (next: OwnedState) => {
      const opened = !hadCopy && ownedCopies(next, cardId) > 0;
      if (opened) {
        showUnlockReveal(cardId, cardName);
        say(`«${cardName}» открыта в оракуле (ур.1)`);
        return;
      }
      if (!hadCopy) {
        const need = shardsNeededForUnlock(cardId) ?? 0;
        const have = getCardShards(next, cardId);
        say(`«${cardName}» +${shardN} осколок · ${have}/${need} до оракула`);
        return;
      }
      say(`«${cardName}» +${shardN} осколок`);
    };
    try {
      // Офлайн: только локально. Онлайн: только API — иначе PUT сейва + POST покупки
      // начисляют осколок дважды за один клик.
      if (!authToken) {
        const next = localBuy();
        onChange(next);
        flashAfter(next);
        return;
      }
      const { user } = await apiShopBuy(authToken, cardId, currency);
      if (!user.owned) {
        alert("Сервер не вернул сейв после покупки");
        return;
      }
      const next: OwnedState = {
        ...before,
        ...user.owned,
        cardShards: user.owned.cardShards ?? before.cardShards,
        cardUpgrades: user.owned.cardUpgrades ?? before.cardUpgrades,
        decks: user.owned.decks ?? before.decks,
        activeDeckId: user.owned.activeDeckId ?? before.activeDeckId,
        homeFaction: before.homeFaction ?? user.owned.homeFaction,
      };
      onChange(next);
      flashAfter(next);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Покупка не прошла");
    } finally {
      shopBusy.current = false;
    }
  };

  const persist = () => {
    if (deck.length < MIN_DECK_SIZE) {
      alert(
        `В колоде мало карт (${deck.length}). Нужно хотя бы ${MIN_DECK_SIZE} (лучше ${DECK_SIZE}).`,
      );
      return;
    }
    onChange(saveDeck(owned, deckId, deck));
    say("Колода сохранена");
  };

  return (
    <div className="collection">
      <header className="page-bar">
        <button type="button" className="ghost" onClick={onBack}>
          ← Меню
        </button>
        <h1>{tab === "deck" ? "Колода" : "Магазин"}</h1>
        <div className="wallet-row">
          <span className="wallet-chip gold">
            <GameIcon name="gold" size={16} /> {owned.gold ?? 0}
          </span>
          <span className="wallet-chip dia">
            <GameIcon name="diamond" size={16} /> {owned.diamonds ?? 0}
          </span>
        </div>
        <div className="tabs">
          <button
            type="button"
            className={tab === "cards" ? "primary" : "ghost"}
            onClick={() => setTab("cards")}
          >
            Карты
          </button>
          <button
            type="button"
            className={tab === "deck" ? "primary" : "ghost"}
            onClick={() => setTab("deck")}
          >
            Колода ({deck.length}/{DECK_SIZE})
          </button>
          <button
            type="button"
            className={tab === "currency" ? "primary" : "ghost"}
            data-tut="hub-shop-currency"
            onClick={() => setTab("currency")}
            title="Алмазы и золото"
          >
            <span className="shop-tab-icons" aria-hidden>
              <GameIcon name="diamond" size={14} />
              <span className="shop-tab-slash">/</span>
              <GameIcon name="gold" size={14} />
            </span>
            <span className="shop-tab-label">Валюта</span>
          </button>
        </div>
      </header>

      {flash && <div className="cabinet-flash">{flash}</div>}

      {unlockReveal ? (
        <button
          type="button"
          className="shop-unlock-reveal"
          onClick={() => {
            if (unlockTimer.current != null) {
              window.clearTimeout(unlockTimer.current);
              unlockTimer.current = null;
            }
            setUnlockReveal(null);
          }}
          aria-label={`Карта «${unlockReveal.name}» открыта`}
        >
          <div className="shop-unlock-reveal-card">
            {(() => {
              const card = CARDS.find((c) => c.id === unlockReveal.id);
              if (!card) return null;
              return <CardView card={card} upgradeLevel={1} flippable={false} />;
            })()}
          </div>
          <div className="shop-unlock-reveal-text">
            <span className="shop-unlock-reveal-eyebrow">В оракуле</span>
            <strong>{unlockReveal.name}</strong>
            <span>Уровень 1 открыт</span>
          </div>
        </button>
      ) : null}

      {(tab === "cards" || tab === "deck") && (
        <>
          <p className="hint catalog-status">
            Оракул: <strong>{catalogStats.unlocked}</strong> /{" "}
            {catalogStats.total}. Ценник = <strong>1 осколок</strong>. Карта в
            оракуле — только когда наберёшь осколки на <strong>ур.1</strong>.
            Дальше осколки на ур.2/3. Тиры I–V: с 1 / 10 / 15 / 25 / 30 ур.
          </p>
          {tab === "cards" && (
            <>
              <div className="filters">
                {(
                  [
                    ["all", "Все типы"],
                    ["creature", "Существа"],
                    ["spell", "Заклинания"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={kindFilter === k ? "chip on" : "chip"}
                    onClick={() => setKindFilter(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="filters">
                {SCHOOLS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={filter === s ? "chip on" : "chip"}
                    onClick={() => setFilter(s)}
                  >
                    {s === "all" ? (
                      "Все школы"
                    ) : (
                      <SchoolBadge school={s} size={13} />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "cards" && (
        <div className="grid">
          {list.map((c, idx) => {
            const have = ownedCopies(owned, c.id);
            const inOracle = have > 0;
            const levelOk = isCardAvailableInShop(c, playerLevel(owned));
            const locked = !inOracle && !levelOk;
            const shopReady = !inOracle && levelOk;
            const canBuyShards = canBuyShardsForCard(owned, c.id);
            const showPrice = canBuyShards;
            const firstBuy =
              showPrice &&
              !list
                .slice(0, idx)
                .some((x) => canBuyShardsForCard(owned, x.id));
            const needLv = minPlayerLevelForShopCard(c);
            return (
              <div key={c.id} className="grid-item">
                <CardView
                  card={c}
                  locked={locked}
                  shopReady={shopReady}
                  flippable={!locked}
                  upgradeLevel={
                    isUpgradeableCard(c.id)
                      ? inOracle
                        ? getCardUpgradeLevel(owned, c.id)
                        : null
                      : null
                  }
                />
                <div className="grid-meta">
                  <div className="card-live-tag inline-icos">
                    <SchoolBadge school={c.school} size={12} />
                    {" · "}
                    {c.kind === "spell" ? "Заклинание" : "Существо"}
                    {c.unitLevel
                      ? ` · ${UNIT_TIER_LABEL[c.unitLevel]}`
                      : ""}
                    {locked
                      ? ` · с ${needLv} ур.`
                      : inOracle
                        ? " · в оракуле"
                        : " · копим на ур.1"}
                  </div>
                  {isUpgradeableCard(c.id) ? (
                    <div className="shop-meta shop-meta-shards">
                      {(() => {
                        const haveSh = getCardShards(owned, c.id);
                        if (!inOracle) {
                          const need = shardsNeededForUnlock(c.id);
                          if (need == null) return null;
                          return (
                            <button
                              type="button"
                              className="shard-upgrade-btn is-farm-green"
                              disabled
                              title={
                                locked
                                  ? `С ${needLv} ур. · в оракул: ${need} осколков`
                                  : `В оракул (ур.1): ${haveSh}/${need}`
                              }
                            >
                              {haveSh}/{need}
                            </button>
                          );
                        }
                        const lv = getCardUpgradeLevel(owned, c.id);
                        const need = shardsNeededForNext(c.id, lv);
                        if (need == null) {
                          return (
                            <button
                              type="button"
                              className="shard-upgrade-btn is-max"
                              disabled
                              title="Максимум"
                            >
                              макс
                            </button>
                          );
                        }
                        const ready = haveSh >= need;
                        // Зелёный — только до открытия; ур.2/3 копим синим.
                        const tone = ready
                          ? "is-ready"
                          : "is-farm-blue";
                        return (
                          <button
                            type="button"
                            className={`shard-upgrade-btn ${tone}`}
                            disabled={!ready}
                            onClick={() => ready && upgrade(c.id)}
                            title={
                              ready
                                ? `Улучшить до ур.${lv + 1}`
                                : `К ур.${lv + 1}: ${haveSh}/${need}`
                            }
                          >
                            {haveSh}/{need}
                          </button>
                        );
                      })()}
                    </div>
                  ) : null}
                  <div
                    className={`shop-meta${showPrice ? "" : " is-price-locked"}`}
                    data-tut={firstBuy ? "hub-shop-buy" : undefined}
                  >
                    <button
                      type="button"
                      className="primary"
                      disabled={!showPrice}
                      onClick={() => showPrice && buy(c.id, false)}
                      title={
                        locked
                          ? `С ${needLv} ур.`
                          : showPrice
                            ? `Купить ${shardsPerShopBuy(c.id)} осколок за золото`
                            : "Максимум"
                      }
                    >
                      <GameIcon name="gold" size={14} /> {c.priceGold}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={!showPrice || !(c.priceDiamonds != null && c.priceDiamonds > 0)}
                      onClick={() =>
                        showPrice &&
                        c.priceDiamonds != null &&
                        c.priceDiamonds > 0 &&
                        buy(c.id, true)
                      }
                      title={
                        locked
                          ? `С ${needLv} ур.`
                          : showPrice
                            ? `Купить ${shardsPerShopBuy(c.id)} осколок за алмазы`
                            : "Максимум"
                      }
                    >
                      <GameIcon name="diamond" size={14} />{" "}
                      {c.priceDiamonds ?? 0}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "deck" && (
        <div className="deck-edit">
          <p className="hint">
            Колода из оракула: до {DECK_SIZE} карт, по 1 копии. Кликни карту —
            убрать. Покупки идут в книгу — в колоду кладёшь сам. В бою
            колода крутится по кругу.
          </p>

          <div className="deck-builder-stats" aria-label="Анализ колоды">
            <div className="deck-stat-row">
              <span>
                Карт: <strong>{deckStats.size}/{DECK_SIZE}</strong>
              </span>
              <span>
                Существа {deckStats.creatures} · заклинания {deckStats.spells}
              </span>
              <span>
                Своя школа:{" "}
                <strong className="deck-school-pct inline-icos">
                  <SchoolBadge school={homeFaction} size={14} />{" "}
                  {deckStats.ownSchoolPct}%
                </strong>
              </span>
            </div>

            <ul className="deck-advice">
              {deckStats.advice
                .filter((a) => a.level !== "ok")
                .map((a, i) => (
                  <li key={i} className={`deck-advice-${a.level}`}>
                    {a.text}
                  </li>
                ))}
            </ul>
          </div>

          <div className="deck-edit-actions">
            <button type="button" className="primary" onClick={persist}>
              Сохранить колоду
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                const starter = starterDeckForFaction(homeFaction);
                commitDeck(starter);
                say(`Стартовая колода «${SCHOOL_LABEL[homeFaction]}»`);
              }}
            >
              Вернуть стартовую
            </button>
          </div>

          <div className="hand deck-list">
            {deck.length === 0 ? (
              <p className="hint">Колода пуста — добавь карты ниже.</p>
            ) : (
              deck.map((id, i) => (
                <CardView
                  key={`${id}-${i}`}
                  cardId={id}
                  compact
                  upgradeLevel={
                    isUpgradeableCard(id)
                      ? getCardUpgradeLevel(owned, id)
                      : null
                  }
                  onClick={() => removeFromDeck(i)}
                />
              ))
            )}
          </div>

          <h2 className="deck-pool-title">Открытые карты</h2>
          <div className="filters">
            {(
              [
                ["all", "Все"],
                ["creature", "Существа"],
                ["spell", "Заклинания"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={kindFilter === k ? "chip on" : "chip"}
                onClick={() => setKindFilter(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="filters">
            {SCHOOLS.map((s) => (
              <button
                key={s}
                type="button"
                className={filter === s ? "chip on" : "chip"}
                onClick={() => setFilter(s)}
              >
                {s === "all" ? (
                  "Все школы"
                ) : (
                  <SchoolBadge school={s} size={13} />
                )}
              </button>
            ))}
          </div>
          <div className="grid deck-pool-grid">
            {list
              .filter((c) => isUnlocked(owned, c.id))
              .map((c) => {
                const have = ownedCopies(owned, c.id);
                const inDeck = counts[c.id] ?? 0;
                const cap = Math.min(maxCopiesForCard(c.id), have);
                return (
                  <div key={c.id} className="grid-item">
                    <CardView
                      card={c}
                      flippable
                      upgradeLevel={
                        isUpgradeableCard(c.id)
                          ? getCardUpgradeLevel(owned, c.id)
                          : null
                      }
                      onClick={() => addToDeck(c.id)}
                    />
                    <div className="grid-meta">
                      <div className="card-live-tag inline-icos">
                        <SchoolBadge school={c.school} size={12} />
                        {c.school === homeFaction ? " · своя" : ""}
                        {" · "}
                        в колоде {inDeck}/{cap} (есть {have})
                      </div>
                      <div className="shop-meta">
                        <button
                          type="button"
                          className="primary"
                          disabled={inDeck >= cap || deck.length >= DECK_SIZE}
                          onClick={() => addToDeck(c.id)}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          disabled={inDeck <= 0}
                          onClick={() => removeOneFromDeck(c.id)}
                        >
                          −
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {tab === "currency" && (
        <div className="currency-shop" data-tut="hub-shop-packs">

          <section className="currency-panel exchange-panel">
            <h2 className="currency-heading">
              Обмен <GameIcon name="diamond" size={20} /> →{" "}
              <GameIcon name="gold" size={20} />
            </h2>
            <p className="hint">
              Курс:{" "}
              <strong className="inline-icos">
                1 <GameIcon name="diamond" size={14} /> = {GOLD_PER_DIAMOND}{" "}
                <GameIcon name="gold" size={14} />
              </strong>
              . Выбери сколько алмазов списать — хоть 5, хоть всё.
            </p>
            <div className="exchange-stepper" aria-label="Счётчик алмазов">
              <button
                type="button"
                className="ghost exchange-step"
                disabled={exchangeAmt <= 1}
                onClick={() => setExchangeAmt((n) => Math.max(1, n - 1))}
              >
                −
              </button>
              <label className="exchange-amount">
                <span className="sr-only">Алмазов к обмену</span>
                <input
                  type="number"
                  min={1}
                  max={Math.max(1, diaBalance)}
                  value={exchangeAmt}
                  onChange={(e) => {
                    const v = Math.floor(Number(e.target.value) || 0);
                    setExchangeAmt(
                      Math.min(Math.max(1, v), Math.max(1, diaBalance)),
                    );
                  }}
                />
                <span className="exchange-unit">
                  <GameIcon name="diamond" size={16} />
                </span>
              </label>
              <button
                type="button"
                className="ghost exchange-step"
                disabled={exchangeAmt >= diaBalance}
                onClick={() =>
                  setExchangeAmt((n) => Math.min(diaBalance, n + 1))
                }
              >
                +
              </button>
            </div>
            <div className="exchange-quick">
              {EXCHANGE_QUICK_AMOUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`chip ${exchangeAmt === n ? "on" : ""}`}
                  disabled={diaBalance < n}
                  onClick={() => setExchangeAmt(n)}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                className={`chip ${exchangeAmt === diaBalance && diaBalance > 0 ? "on" : ""}`}
                disabled={diaBalance < 1}
                onClick={() => setExchangeAmt(diaBalance)}
              >
                Всё ({diaBalance})
              </button>
            </div>
            <p className="exchange-preview">
              Отдаёшь{" "}
              <strong className="inline-icos">
                {exchangeAmt} <GameIcon name="diamond" size={14} />
              </strong>{" "}
              → получишь{" "}
              <strong className="inline-icos">
                {goldForDiamonds(exchangeAmt)} <GameIcon name="gold" size={14} />
              </strong>
            </p>
            <button
              type="button"
              className="primary large exchange-confirm"
              disabled={diaBalance < 1 || exchangeAmt > diaBalance}
              onClick={() => {
                const next = exchangeDiamondsAmount(owned, exchangeAmt);
                if (next === owned) {
                  say(`Нужно ${diamondText(exchangeAmt)}`);
                  return;
                }
                const gained = goldForDiamonds(exchangeAmt);
                onChange(next);
                say(`Обмен: −${diamondText(exchangeAmt)} → +${goldText(gained)}`);
                setExchangeAmt(1);
              }}
            >
              Обменять
            </button>
          </section>

          <section className="currency-panel">
            <h2 className="currency-heading">
              Купить <GameIcon name="diamond" size={20} />
            </h2>
            <p className="hint">
              Оплата через ЮKassa (карта / СБП). После оплаты алмазы
              появятся на аккаунте — обнови магазин или зайди снова.
              Оплачивая, вы принимаете{" "}
              <a
                href={USER_AGREEMENT_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                пользовательское соглашение
              </a>{" "}
              (лицензия на ресурс, возврат после зачисления — по правилам
              соглашения).
            </p>
            <div className="pack-grid">
              {DIAMOND_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  className="pack-card"
                  disabled={!!payBusy}
                  onClick={() => {
                    if (!authToken) {
                      say("Нужен вход в аккаунт, чтобы купить алмазы");
                      return;
                    }
                    const ok = window.confirm(
                      `Купить «${pack.title}»?\n\n${diamondText(pack.diamonds)} за ${pack.priceLabel}\n\nОткроется ЮKassa. Оплата = согласие с пользовательским соглашением; после зачисления алмазов возврат по общему правилу не производится.`,
                    );
                    if (!ok) return;
                    setPayBusy(pack.id);
                    say("Открываем ЮKassa… подожди до минуты, не жми снова");
                    void apiCreatePayment(authToken, pack.id)
                      .then((res) => {
                        try {
                          sessionStorage.setItem(
                            "orakul_pending_order",
                            res.orderId,
                          );
                        } catch {
                          /* ignore */
                        }
                        say("Переходим на оплату…");
                        window.location.assign(res.confirmationUrl);
                      })
                      .catch((e) => {
                        say(
                          e instanceof Error
                            ? e.message
                            : "Не удалось создать оплату — нажми ещё раз",
                        );
                        setPayBusy(null);
                      });
                  }}
                >
                  <strong>{pack.title}</strong>
                  <span className="pack-amount inline-icos">
                    <GameIcon name="diamond" size={16} /> {pack.diamonds}
                  </span>
                  <span className="pack-price">
                    {payBusy === pack.id ? "…" : pack.priceLabel}
                  </span>
                  <span className="pack-note">{pack.note}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
