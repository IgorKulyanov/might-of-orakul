import { useState } from "react";
import { SCHOOL_COLOR, SCHOOL_LABEL } from "../game/cards";
import {
  BASE_HEROES,
  EPIC_HEROES,
  EPIC_HERO_DIAMONDS,
  EPIC_HERO_GOLD,
  orakulArtUrl,
} from "../game/heroes";
import {
  activeHeroId,
  buyEpicHero,
  canSelectHero,
  homeFactionOf,
  isHeroUnlocked,
  playerLevel,
  setHero,
} from "../game/owned";
import { orakulBattleHp } from "../game/oracleGifts";
import { xpToNextLevel } from "../game/progression";
import type { HeroDef, OwnedState } from "../game/types";
import { XpBar } from "./XpBar";

type Props = {
  owned: OwnedState;
  onChange: (o: OwnedState) => void;
  onBack: () => void;
  onBattle: () => void;
};

function HeroCard({
  h,
  owned,
  onChange,
  level,
  foreign,
}: {
  h: HeroDef;
  owned: OwnedState;
  onChange: (o: OwnedState) => void;
  level: number;
  /** Чужая фракция — только витрина, выбрать нельзя. */
  foreign?: boolean;
}) {
  const hp = orakulBattleHp(h.faction, level, h.tier);
  const heroId = activeHeroId(owned);
  const on = heroId === h.id;
  const color = SCHOOL_COLOR[h.faction];
  const epic = h.tier === "epic";
  const unlocked = isHeroUnlocked(owned, h.id);
  const selectable = !foreign && canSelectHero(owned, h.id);
  const [hint, setHint] = useState<string | null>(null);

  const buy = (pay: "gold" | "diamonds") => {
    const res = buyEpicHero(owned, h.id, pay);
    if (!res.ok) {
      setHint(
        pay === "gold" ? "Недостаточно золота" : "Недостаточно кристаллов",
      );
      return;
    }
    if (res.owned.heroId !== h.id) {
      setHint("Куплено, но облик не сменился — нажми на карту");
      onChange(res.owned);
      return;
    }
    setHint(null);
    onChange(res.owned);
  };

  return (
    <div
      className={`hero-card hero-card-portrait ${on ? "on" : ""} ${epic ? "is-epic" : ""} ${!unlocked || foreign ? "is-locked" : ""}`}
      style={{ ["--faction" as string]: color }}
    >
      <button
        type="button"
        className="hero-card-hit"
        disabled={!selectable}
        onClick={() => selectable && onChange(setHero(owned, h.id))}
      >
        <div className="orakul-portrait-wrap">
          <img
            className="orakul-portrait"
            src={orakulArtUrl(h)}
            alt={h.name}
            draggable={false}
          />
          {epic && <span className="orakul-epic-badge">Эпик</span>}
          <span className="orakul-level-badge on-portrait">ур. {level}</span>
        </div>
        <div className="hero-card-top">
          <strong>{h.name}</strong>
          {on && <span className="hero-picked">выбран</span>}
        </div>
        <span className="hero-faction">
          Оракул · {SCHOOL_LABEL[h.faction]} · ур. {level}
        </span>
        <span className="hero-hp">HP {hp}</span>
        <p>{h.text}</p>
        {foreign && (
          <p className="hero-lock-note">Другая фракция — недоступно</p>
        )}
      </button>
      {epic && !foreign && !unlocked && (
        <div className="hero-buy">
          <div className="hero-buy-row">
            <div className="hero-buy-col">
              <span className="hero-buy-label">
                {EPIC_HERO_GOLD.toLocaleString("ru-RU")} 🪙
              </span>
              <button
                type="button"
                className="ghost"
                onClick={() => buy("gold")}
              >
                Купить за золото
              </button>
            </div>
            <div className="hero-buy-col">
              <span className="hero-buy-label">
                {EPIC_HERO_DIAMONDS.toLocaleString("ru-RU")} 💎
              </span>
              <button
                type="button"
                className="ghost"
                onClick={() => buy("diamonds")}
              >
                Купить за кристаллы
              </button>
            </div>
          </div>
          {hint && <span className="hero-buy-hint">{hint}</span>}
        </div>
      )}
    </div>
  );
}

export function HeroSelect({ owned, onChange, onBack, onBattle }: Props) {
  const level = playerLevel(owned);
  const xp = owned.xp ?? 0;
  const xpNeed = xpToNextLevel(level);
  const home = homeFactionOf(owned);
  const hero = BASE_HEROES.concat(EPIC_HEROES).find(
    (h) => h.id === activeHeroId(owned),
  );
  const hp = orakulBattleHp(
    hero?.faction ?? home,
    level,
    hero?.tier,
  );
  // Все базовые — чтобы можно было вернуть свою школу после бага смены расы
  const myBase = BASE_HEROES;
  const myEpic = EPIC_HEROES.filter((h) => h.faction === home);

  return (
    <div className="hero-screen">
      <header className="page-bar">
        <button type="button" className="ghost" onClick={onBack}>
          ← Кабинет
        </button>
        <h1>Твой оракул</h1>
        <button type="button" className="primary" onClick={onBattle}>
          В бой
        </button>
      </header>

      <div className="hero-level-panel">
        <p className="hint hero-screen-hint">
          Сейчас школа: <strong>{SCHOOL_LABEL[home]}</strong>. Базового оракула
          можно сменить (колода станет стартовой новой школы). Эпик — только
          своей школы. Ур. {level}, в бою <strong>{hp} HP</strong>.{" "}
          <span className="hero-wallet">
            {owned.gold ?? 0} 🪙 · {owned.diamonds ?? 0} 💎
          </span>
        </p>
        <XpBar level={level} xp={xp} xpNeed={xpNeed} />
      </div>

      <h2 className="hero-section-title">Базовые оракулы</h2>
      <div className="hero-grid hero-grid-lg">
        {myBase.map((h) => (
          <HeroCard
            key={h.id}
            h={h}
            owned={owned}
            onChange={onChange}
            level={level}
          />
        ))}
      </div>

      <h2 className="hero-section-title">Эпик своей фракции</h2>
      <p className="hint hero-epic-hint">
        Уникальный дар + ещё +1 мана на старте.
      </p>
      <div className="hero-grid hero-grid-lg">
        {myEpic.map((h) => (
          <HeroCard
            key={h.id}
            h={h}
            owned={owned}
            onChange={onChange}
            level={level}
          />
        ))}
      </div>
    </div>
  );
}
