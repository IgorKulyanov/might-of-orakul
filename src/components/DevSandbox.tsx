import { useMemo, useState } from "react";
import {
  allTestHeroes,
  type DevBattleSetup,
  type DevDeckMode,
} from "../game/devMode";
import { FACTIONS, getHero, orakulArtUrl } from "../game/heroes";
import { SCHOOL_LABEL } from "../game/cards";
import type { Faction } from "../game/types";

type Props = {
  onBack: () => void;
  onStart: (setup: DevBattleSetup) => void;
};

const DECK_MODES: Array<{ id: DevDeckMode; label: string }> = [
  { id: "starter", label: "Старт (4 карты)" },
  { id: "school", label: "Вся школа (до 25)" },
  { id: "bot_pool", label: "Как бот уровня" },
];

export function DevSandbox({ onBack, onStart }: Props) {
  const heroes = useMemo(() => allTestHeroes(), []);
  const [yourHeroId, setYourHeroId] = useState("hero_death");
  const [enemyHeroId, setEnemyHeroId] = useState("hero_hell");
  const [yourLevel, setYourLevel] = useState(10);
  const [enemyLevel, setEnemyLevel] = useState(10);
  const [yourDeckMode, setYourDeckMode] = useState<DevDeckMode>("starter");
  const [enemyDeckMode, setEnemyDeckMode] = useState<DevDeckMode>("bot_pool");

  const yourHero = getHero(yourHeroId);
  const enemyHero = getHero(enemyHeroId);

  const pickFactionHero = (side: "you" | "enemy", faction: Faction, epic: boolean) => {
    const id = epic ? `hero_${faction}_epic` : `hero_${faction}`;
    if (side === "you") setYourHeroId(id);
    else setEnemyHeroId(id);
  };

  return (
    <div className="dev-sandbox" aria-label="Песочница разработчика">
      <header className="page-bar">
        <button type="button" className="ghost" onClick={onBack}>
          ← Меню
        </button>
        <h1>🧪 Тест оракулов</h1>
        <span />
      </header>

      <p className="hint dev-sandbox-warn">
        Бой <strong>не трогает</strong> твой основной сейв: ни золото, ни XP, ни
        колоду, ни расу. Только проверка механик. Режим «Старт (4 карты)» — короткий
        набор в руке; буйство крови из‑за «пустой колоды» на старте не включается.
      </p>

      <div className="dev-sandbox-grid">
        <section className="dev-panel">
          <h2>Ты</h2>
          <div className="dev-hero-preview">
            <img src={orakulArtUrl(yourHero)} alt="" draggable={false} />
            <div>
              <strong>{yourHero.name}</strong>
              <span>
                {SCHOOL_LABEL[yourHero.faction]} ·{" "}
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
                {SCHOOL_LABEL[f]}
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
                Эпик {SCHOOL_LABEL[f]}
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
                  Math.min(50, Math.max(1, Math.floor(Number(e.target.value) || 1))),
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
              <span>
                {SCHOOL_LABEL[enemyHero.faction]} ·{" "}
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
                {SCHOOL_LABEL[f]}
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
                Эпик {SCHOOL_LABEL[f]}
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
                  Math.min(50, Math.max(1, Math.floor(Number(e.target.value) || 1))),
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

      <div className="dev-sandbox-actions">
        <button
          type="button"
          className="primary large"
          onClick={() =>
            onStart({
              yourHeroId,
              enemyHeroId,
              yourLevel,
              enemyLevel,
              yourDeckMode,
              enemyDeckMode,
            })
          }
        >
          В бой (без наград)
        </button>
        <p className="hint">
          Героев в списке: {heroes.length}. Сейв аккаунта не меняется.
        </p>
      </div>
    </div>
  );
}
