import { useEffect, useMemo, useState } from "react";
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
} from "../game/cardUpgrades";
import {
  buyCardWithDiamonds,
  buyCardWithGold,
  canBuyAnotherCopy,
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

  const buy = (id: string, withDiamonds = false) => {
    const card = CARDS.find((c) => c.id === id);
    if (!card) return;
    const lv = playerLevel(owned);
    if (!isCardAvailableInShop(card, lv)) {
      say(`«${card.name}» с ${minPlayerLevelForShopCard(card)} ур.`);
      return;
    }
    if (ownedCopies(owned, id) >= maxCopiesForCard(id)) {
      say(`«${card.name}» уже в оракуле`);
      return;
    }
    const label = `«${card.name}»`;
    if (withDiamonds) {
      const price = card.priceDiamonds ?? 0;
      if (!price) return;
      if ((owned.diamonds ?? 0) < price) {
        alert(`Не хватает алмазов (нужно ${diamondText(price)}).`);
        return;
      }
      const ok = window.confirm(`В оракул ${label} за ${diamondText(price)}?`);
      if (!ok) return;
      void commitBuy(id, "diamonds", () => buyCardWithDiamonds(owned, id));
      return;
    }
    const price = card.priceGold ?? 0;
    const gold = owned.gold ?? 0;
    if (gold < price) {
      alert(
        `Не хватает золота на ${label}.\nНужно ${goldText(price)}, у тебя ${goldText(gold)}`,
      );
      return;
    }
    const ok = window.confirm(`В оракул ${label} за ${goldText(price)}?`);
    if (!ok) return;
    void commitBuy(id, "gold", () => buyCardWithGold(owned, id));
  };

  const commitBuy = async (
    cardId: string,
    currency: "gold" | "diamonds",
    localBuy: () => OwnedState,
  ) => {
    const cardName =
      CARDS.find((c) => c.id === cardId)?.name ?? cardId;
    if (!authToken) {
      onChange(localBuy());
      say(`«${cardName}» теперь в оракуле`);
      return;
    }
    try {
      const { user } = await apiShopBuy(authToken, cardId, currency);
      if (!user.owned) {
        alert("Сервер не вернул сейв после покупки");
        return;
      }
      const next: OwnedState = {
        ...owned,
        ...user.owned,
        decks: user.owned.decks ?? owned.decks,
        activeDeckId: user.owned.activeDeckId ?? owned.activeDeckId,
        homeFaction: owned.homeFaction ?? user.owned.homeFaction,
      };
      onChange(next);
      say(`«${cardName}» теперь в оракуле`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Покупка не прошла");
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

      {(tab === "cards" || tab === "deck") && (
        <>
          <p className="hint catalog-status">
            Оракул: <strong>{catalogStats.unlocked}</strong> /{" "}
            {catalogStats.total} (
            {catalogStats.creatures} существ, {catalogStats.spells} заклинаний).
            По 1 карте (существа и магия) — дальше осколки L1–L3. Тиры
            существ: I с 1 · II с 10 · III с 15 · IV с 25 · V с 30. Магия — по
            редкости. Доступная ярче → в оракул.
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
            const canBuyMore = canBuyAnotherCopy(owned, c.id);
            const firstBuy =
              canBuyMore &&
              !list
                .slice(0, idx)
                .some((x) => canBuyAnotherCopy(owned, x.id));
            const needLv = minPlayerLevelForShopCard(c);
            return (
              <div key={c.id} className="grid-item">
                <CardView
                  card={c}
                  locked={locked}
                  shopReady={shopReady}
                  flippable={!locked}
                  upgradeLevel={
                    inOracle && isUpgradeableCard(c.id)
                      ? getCardUpgradeLevel(owned, c.id)
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
                        : " · доступна"}
                  </div>
                  {inOracle && isUpgradeableCard(c.id) ? (
                    <div className="shop-meta shop-meta-shards">
                      {(() => {
                        const lv = getCardUpgradeLevel(owned, c.id);
                        const need = shardsNeededForNext(c.id, lv);
                        const haveSh = getCardShards(owned, c.id);
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
                        const tone = ready
                          ? "is-ready"
                          : lv <= 1
                            ? "is-farm-green"
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
                                : `Осколки ${haveSh}/${need}`
                            }
                          >
                            {haveSh}/{need}
                          </button>
                        );
                      })()}
                    </div>
                  ) : null}
                  {canBuyMore ? (
                    <div
                      className="shop-meta"
                      data-tut={firstBuy ? "hub-shop-buy" : undefined}
                    >
                      <button
                        type="button"
                        className="primary"
                        onClick={() => buy(c.id, false)}
                      >
                        <GameIcon name="gold" size={14} /> {c.priceGold}
                      </button>
                      {c.priceDiamonds != null && c.priceDiamonds > 0 && (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => buy(c.id, true)}
                        >
                          <GameIcon name="diamond" size={14} /> {c.priceDiamonds}
                        </button>
                      )}
                    </div>
                  ) : null}
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
            убрать. Новые покупки сами попадают сюда, если есть место. В бою
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
