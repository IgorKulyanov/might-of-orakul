import { useMemo, useState } from "react";
import {
  CARDS,
  DECK_SIZE,
  MIN_DECK_SIZE,
  getCard,
  sortCatalogCards,
} from "../game/cards";
import {
  defaultUpgradeLevel,
  isUpgradeableCard,
} from "../game/cardUpgrades";
import {
  allTestHeroes,
  loadDevCardUpgrades,
  loadDevCustomDeckRaw,
  saveDevCardUpgrades,
  saveDevCustomDeck,
  type DevBattleSetup,
  type DevDeckMode,
} from "../game/devMode";
import { FACTIONS, getHero, orakulArtUrl } from "../game/heroes";
import type { Faction, School } from "../game/types";
import { CardView } from "./CardView";
import { DevVfxLab } from "./DevVfxLab";
import { SchoolBadge } from "./GameIcon";

type Props = {
  onBack: () => void;
  onStart: (setup: DevBattleSetup) => void;
};

type SandboxTab = "battle" | "vfx";

const DECK_MODES: Array<{ id: DevDeckMode; label: string }> = [
  { id: "starter", label: "Старт (4 карты)" },
  { id: "school", label: "Вся школа (до 12)" },
  { id: "bot_pool", label: "Как бот уровня" },
  { id: "custom", label: "Свои карты (все)" },
];

const SCHOOLS: Array<School | "all"> = [
  "all",
  "water",
  "hell",
  "death",
  "life",
  "nature",
  "neutral",
];

function CustomDeckPicker({
  title,
  deck,
  onChange,
  upgrades,
  onUpgradesChange,
}: {
  title: string;
  deck: string[];
  onChange: (next: string[]) => void;
  upgrades: Record<string, number>;
  onUpgradesChange: (next: Record<string, number>) => void;
}) {
  const [q, setQ] = useState("");
  const [school, setSchool] = useState<School | "all">("all");
  const [kind, setKind] = useState<"all" | "creature" | "spell">("all");

  const catalog = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return sortCatalogCards(
      CARDS.filter((c) => {
        if (c.kind !== "creature" && c.kind !== "spell") return false;
        if (school !== "all" && c.school !== school) return false;
        if (kind !== "all" && c.kind !== kind) return false;
        if (!qq) return true;
        return (
          c.id.toLowerCase().includes(qq) ||
          c.name.toLowerCase().includes(qq) ||
          (c.text ?? "").toLowerCase().includes(qq)
        );
      }),
    );
  }, [q, school, kind]);

  const upgradeableInDeck = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of deck) {
      if (seen.has(id) || !isUpgradeableCard(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }, [deck]);

  const levelOf = (id: string) =>
    upgrades[id] ?? defaultUpgradeLevel(id);

  const setLevel = (id: string, lv: 1 | 2 | 3) => {
    onUpgradesChange({ ...upgrades, [id]: lv });
  };

  const add = (id: string) => {
    if (deck.length >= DECK_SIZE) return;
    onChange([...deck, id]);
  };

  const removeAt = (index: number) => {
    onChange(deck.filter((_, i) => i !== index));
  };

  const clear = () => onChange([]);

  const fillFiltered = () => {
    const next = [...deck];
    for (const c of catalog) {
      if (next.length >= DECK_SIZE) break;
      next.push(c.id);
    }
    onChange(next.slice(0, DECK_SIZE));
  };

  return (
    <section className="dev-custom-panel" aria-label={title}>
      <div className="dev-custom-head">
        <h3>{title}</h3>
        <span className={deck.length >= MIN_DECK_SIZE ? "ok" : "bad"}>
          {deck.length}/{DECK_SIZE}
          {deck.length < MIN_DECK_SIZE
            ? ` · нужно ≥${MIN_DECK_SIZE}`
            : " · готово"}
        </span>
      </div>

      <div className="dev-custom-deck" aria-label="Собранная колода">
        {deck.length === 0 ? (
          <p className="hint">
            Кликни карту в каталоге — добавится сюда. ↻ — читать умение.
          </p>
        ) : (
          deck.map((id, i) => (
            <div key={`${id}-${i}`} className="dev-custom-deck-slot">
              <div
                className="dev-custom-deck-hit"
                title="Клик по карте — убрать; ↻ — описание"
                role="button"
                tabIndex={0}
                onClick={() => removeAt(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    removeAt(i);
                  }
                }}
              >
                <CardView
                  cardId={id}
                  compact
                  flippable
                  upgradeLevel={
                    isUpgradeableCard(id)
                      ? (levelOf(id) as 1 | 2 | 3)
                      : null
                  }
                />
              </div>
            </div>
          ))
        )}
      </div>

      {upgradeableInDeck.length > 0 ? (
        <div className="dev-upgrade-panel" aria-label="Уровни юнитов">
          <strong>Уровни юнитов в колоде</strong>
          <p className="hint">
            Способности зависят от ур.1–3. Жми ↻ на карте, чтобы прочитать.
          </p>
          <div className="dev-upgrade-list">
            {upgradeableInDeck.map((id) => {
              const c = getCard(id);
              const lv = levelOf(id);
              return (
                <div key={id} className="dev-upgrade-row">
                  <span className="dev-upgrade-name">{c.name}</span>
                  <div className="filters">
                    {([1, 2, 3] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={lv === n ? "chip on" : "chip"}
                        onClick={() => setLevel(id, n)}
                      >
                        Ур.{n}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="dev-custom-tools">
        <input
          type="search"
          className="dev-custom-search"
          placeholder="Поиск: имя / id / текст…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="filters">
          {SCHOOLS.map((s) => (
            <button
              key={s}
              type="button"
              className={school === s ? "chip on" : "chip"}
              onClick={() => setSchool(s)}
            >
              {s === "all" ? (
                "Все"
              ) : s === "neutral" ? (
                "Нейтрал"
              ) : (
                <SchoolBadge school={s} size={13} />
              )}
            </button>
          ))}
        </div>
        <div className="filters">
          {(
            [
              ["all", "Все типы"],
              ["creature", "Юниты"],
              ["spell", "Магия"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={kind === id ? "chip on" : "chip"}
              onClick={() => setKind(id)}
            >
              {label}
            </button>
          ))}
          <button type="button" className="ghost" onClick={fillFiltered}>
            Добить фильтром
          </button>
          <button type="button" className="ghost" onClick={clear}>
            Очистить
          </button>
        </div>
      </div>

      <div className="dev-custom-catalog" aria-label="Каталог карт">
        {catalog.map((c) => {
          const full = deck.length >= DECK_SIZE;
          const up = isUpgradeableCard(c.id)
            ? (levelOf(c.id) as 1 | 2 | 3)
            : null;
          return (
            <div
              key={c.id}
              className={`dev-custom-card${full ? " is-full" : ""}`}
            >
              <div
                className="dev-custom-card-hit"
                role="button"
                tabIndex={full ? -1 : 0}
                title={full ? `Максимум ${DECK_SIZE}` : `Добавить ${c.name}`}
                aria-disabled={full}
                onClick={() => {
                  if (!full) add(c.id);
                }}
                onKeyDown={(e) => {
                  if (full) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    add(c.id);
                  }
                }}
              >
                <CardView card={c} compact flippable upgradeLevel={up} />
              </div>
              <span className="dev-custom-card-meta">
                <strong>{c.name}</strong>
                <em>
                  {c.kind === "spell" ? "магия" : "юнит"} · {c.id}
                </em>
              </span>
            </div>
          );
        })}
        {catalog.length === 0 ? (
          <p className="hint">Ничего не найдено.</p>
        ) : null}
      </div>
    </section>
  );
}

export function DevSandbox({ onBack, onStart }: Props) {
  const heroes = useMemo(() => allTestHeroes(), []);
  const [tab, setTab] = useState<SandboxTab>("vfx");
  const [yourHeroId, setYourHeroId] = useState("hero_death");
  const [enemyHeroId, setEnemyHeroId] = useState("hero_hell");
  const [yourLevel, setYourLevel] = useState(10);
  const [enemyLevel, setEnemyLevel] = useState(10);
  const [yourDeckMode, setYourDeckMode] = useState<DevDeckMode>("custom");
  const [enemyDeckMode, setEnemyDeckMode] = useState<DevDeckMode>("custom");
  const [yourCustom, setYourCustom] = useState<string[]>(() =>
    loadDevCustomDeckRaw("you"),
  );
  const [enemyCustom, setEnemyCustom] = useState<string[]>(() =>
    loadDevCustomDeckRaw("enemy"),
  );
  const [yourUps, setYourUps] = useState<Record<string, number>>(() =>
    loadDevCardUpgrades("you"),
  );
  const [enemyUps, setEnemyUps] = useState<Record<string, number>>(() =>
    loadDevCardUpgrades("enemy"),
  );

  const yourHero = getHero(yourHeroId);
  const enemyHero = getHero(enemyHeroId);

  const setYourDeck = (next: string[]) => {
    setYourCustom(next);
    saveDevCustomDeck("you", next);
  };
  const setEnemyDeck = (next: string[]) => {
    setEnemyCustom(next);
    saveDevCustomDeck("enemy", next);
  };
  const setYourUpgrades = (next: Record<string, number>) => {
    setYourUps(next);
    saveDevCardUpgrades("you", next);
  };
  const setEnemyUpgrades = (next: Record<string, number>) => {
    setEnemyUps(next);
    saveDevCardUpgrades("enemy", next);
  };

  const pickFactionHero = (
    side: "you" | "enemy",
    faction: Faction,
    epic: boolean,
  ) => {
    const id = epic ? `hero_${faction}_epic` : `hero_${faction}`;
    if (side === "you") setYourHeroId(id);
    else setEnemyHeroId(id);
  };

  const youOk =
    yourDeckMode !== "custom" || yourCustom.length >= MIN_DECK_SIZE;
  const enemyOk =
    enemyDeckMode !== "custom" || enemyCustom.length >= MIN_DECK_SIZE;
  const canStart = youOk && enemyOk;

  return (
    <div className="dev-sandbox" aria-label="Песочница разработчика">
      <header className="page-bar">
        <button type="button" className="ghost" onClick={onBack}>
          ← Меню
        </button>
        <h1>🧪 Тест оракулов</h1>
        <span />
      </header>

      <div className="filters dev-sandbox-tabs">
        <button
          type="button"
          className={tab === "vfx" ? "chip on" : "chip"}
          onClick={() => setTab("vfx")}
        >
          Анимации
        </button>
        <button
          type="button"
          className={tab === "battle" ? "chip on" : "chip"}
          onClick={() => setTab("battle")}
        >
          Бой
        </button>
      </div>

      {tab === "vfx" ? <DevVfxLab /> : null}

      {tab === "battle" ? (
        <>
      <p className="hint dev-sandbox-warn">
        Бой <strong>не трогает</strong> сейв. Режим «Свои карты» — весь каталог:
        любая магия и любой юнит, дубликаты можно. Остальные пресеты как раньше.
      </p>

      <div className="dev-sandbox-grid">
        <section className="dev-panel">
          <h2>Ты</h2>
          <div className="dev-hero-preview">
            <img src={orakulArtUrl(yourHero)} alt="" draggable={false} />
            <div>
              <strong>{yourHero.name}</strong>
              <span className="inline-icos">
                <SchoolBadge school={yourHero.faction} size={13} /> ·{" "}
                {yourHero.tier === "epic" ? "эпик" : "база"}
              </span>
            </div>
          </div>
          <div className="filters">
            {FACTIONS.map((f) => (
              <button
                key={f}
                type="button"
                className={
                  yourHero.faction === f && yourHero.tier === "base"
                    ? "chip on"
                    : "chip"
                }
                onClick={() => pickFactionHero("you", f, false)}
              >
                <SchoolBadge school={f} size={13} />
              </button>
            ))}
          </div>
          <div className="filters">
            {FACTIONS.map((f) => (
              <button
                key={`e-${f}`}
                type="button"
                className={
                  yourHero.faction === f && yourHero.tier === "epic"
                    ? "chip on"
                    : "chip"
                }
                onClick={() => pickFactionHero("you", f, true)}
              >
                <span className="inline-icos">
                  Эпик <SchoolBadge school={f} size={13} />
                </span>
              </button>
            ))}
          </div>
          <label className="dev-field">
            Уровень
            <input
              type="number"
              min={1}
              max={50}
              value={yourLevel}
              onChange={(e) =>
                setYourLevel(
                  Math.min(
                    50,
                    Math.max(1, Math.floor(Number(e.target.value) || 1)),
                  ),
                )
              }
            />
          </label>
          <div className="filters">
            {DECK_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={yourDeckMode === m.id ? "chip on" : "chip"}
                onClick={() => setYourDeckMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </section>

        <section className="dev-panel">
          <h2>Враг</h2>
          <div className="dev-hero-preview">
            <img src={orakulArtUrl(enemyHero)} alt="" draggable={false} />
            <div>
              <strong>{enemyHero.name}</strong>
              <span className="inline-icos">
                <SchoolBadge school={enemyHero.faction} size={13} /> ·{" "}
                {enemyHero.tier === "epic" ? "эпик" : "база"}
              </span>
            </div>
          </div>
          <div className="filters">
            {FACTIONS.map((f) => (
              <button
                key={f}
                type="button"
                className={
                  enemyHero.faction === f && enemyHero.tier === "base"
                    ? "chip on"
                    : "chip"
                }
                onClick={() => pickFactionHero("enemy", f, false)}
              >
                <SchoolBadge school={f} size={13} />
              </button>
            ))}
          </div>
          <div className="filters">
            {FACTIONS.map((f) => (
              <button
                key={`ee-${f}`}
                type="button"
                className={
                  enemyHero.faction === f && enemyHero.tier === "epic"
                    ? "chip on"
                    : "chip"
                }
                onClick={() => pickFactionHero("enemy", f, true)}
              >
                <span className="inline-icos">
                  Эпик <SchoolBadge school={f} size={13} />
                </span>
              </button>
            ))}
          </div>
          <label className="dev-field">
            Уровень
            <input
              type="number"
              min={1}
              max={50}
              value={enemyLevel}
              onChange={(e) =>
                setEnemyLevel(
                  Math.min(
                    50,
                    Math.max(1, Math.floor(Number(e.target.value) || 1)),
                  ),
                )
              }
            />
          </label>
          <div className="filters">
            {DECK_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={enemyDeckMode === m.id ? "chip on" : "chip"}
                onClick={() => setEnemyDeckMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      {yourDeckMode === "custom" ? (
        <CustomDeckPicker
          title="Твоя тестовая колода — весь каталог"
          deck={yourCustom}
          onChange={setYourDeck}
          upgrades={yourUps}
          onUpgradesChange={setYourUpgrades}
        />
      ) : null}

      {enemyDeckMode === "custom" ? (
        <CustomDeckPicker
          title="Колода врага — весь каталог"
          deck={enemyCustom}
          onChange={setEnemyDeck}
          upgrades={enemyUps}
          onUpgradesChange={setEnemyUpgrades}
        />
      ) : null}

      <div className="dev-sandbox-actions">
        <button
          type="button"
          className="primary large"
          disabled={!canStart}
          onClick={() =>
            onStart({
              yourHeroId,
              enemyHeroId,
              yourLevel,
              enemyLevel,
              yourDeckMode,
              enemyDeckMode,
              yourCustomDeck: yourCustom,
              enemyCustomDeck: enemyCustom,
              yourCardUpgrades: yourUps,
              enemyCardUpgrades: enemyUps,
            })
          }
        >
          В бой (без наград)
        </button>
        {!canStart ? (
          <p className="hint bad">
            В режиме «Свои карты» набери минимум {MIN_DECK_SIZE} карт с каждой
            нужной стороны.
          </p>
        ) : (
          <p className="hint">
            Героев в списке: {heroes.length}. Каталог карт:{" "}
            {CARDS.filter((c) => c.kind === "creature" || c.kind === "spell")
              .length}
            . Сейв не меняется.
          </p>
        )}
      </div>
        </>
      ) : null}
    </div>
  );
}
