import {
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  PATTERN_LABEL,
  SCHOOL_COLOR,
  SCHOOL_LABEL,
  cardArtUrl,
  cardFrameLevel,
  getCard,
} from "../game/cards";
import type {
  AttackPattern,
  CardDef,
  ManaCost,
  StatusEffect,
} from "../game/types";
import { GameIcon, ManaCostIcons } from "./GameIcon";

const PATTERN_ICON: Record<AttackPattern, string> = {
  melee: "⚔️",
  melee_lane3: "🗡️",
  ranged: "🏹",
  cleave3: "🔱",
  lane_cleave3: "🐕",
  aoe_all: "🌊",
};

const PATTERN_HINT: Record<AttackPattern, string> = {
  melee: "Бьёт только напротив, без ответки",
  melee_lane3: "Бьёт напротив / слева / справа",
  ranged: "Бьёт любую цель, без ответки",
  cleave3: "Бьёт цель и соседей слева/справа, без ответки",
  lane_cleave3: "Кусает сразу троих: напротив, слева и справа",
  aoe_all: "Бьёт всех вражеских существ",
};

type Props = {
  cardId?: string;
  card?: CardDef;
  selected?: boolean;
  locked?: boolean;
  compact?: boolean;
  board?: boolean;
  liveAttack?: number;
  liveHealth?: number;
  /** Макс. HP сейчас (база + бафы) — для метки раны */
  maxHealth?: number;
  /** Базовая атака с бафами — для метки ослабления */
  maxAttack?: number;
  permAttack?: number;
  permHealth?: number;
  packBonus?: number;
  statuses?: StatusEffect[];
  canAttack?: boolean;
  /** Разрешить просмотр описания */
  flippable?: boolean;
  /** Реальная стоимость в бою (арена и т.п.), иначе с карты. */
  manaCostOverride?: ManaCost;
  onClick?: () => void;
};

type EffectMark = {
  key: string;
  icon: ReactNode;
  label: string;
  title: string;
  tone: "bad" | "curse" | "buff" | "warn";
};

export function CardView({
  cardId,
  card,
  selected,
  locked,
  compact,
  board,
  liveAttack,
  liveHealth,
  maxHealth,
  maxAttack,
  permAttack = 0,
  permHealth = 0,
  packBonus = 0,
  statuses = [],
  canAttack,
  flippable = true,
  manaCostOverride,
  onClick,
}: Props) {
  const c = card ?? (cardId ? getCard(cardId) : null);
  const [showDesc, setShowDesc] = useState(false);
  if (!c) return null;

  const color = SCHOOL_COLOR[c.school];
  const frameLv = cardFrameLevel(c);
  const art = cardArtUrl(c);
  const atk = liveAttack ?? c.attack ?? 0;
  const hp = liveHealth ?? c.health ?? 0;
  const fullHp = maxHealth ?? c.health ?? hp;
  const fullAtk = maxAttack ?? c.attack ?? atk;
  const pattern = (c.attackPattern ?? "melee") as AttackPattern;
  const manaCost = manaCostOverride ?? c.manaCost ?? {};
  const interactive = Boolean(onClick) && !(locked && !onClick);

  const marks: EffectMark[] = [];
  const wound = Math.max(0, fullHp - hp);
  if (wound > 0) {
    marks.push({
      key: "wound",
      icon: "💥",
      label: `−${wound}`,
      title: `Ранение: −${wound} HP до конца хода`,
      tone: "bad",
    });
  }
  const poisonAmt = statuses
    .filter((s) => s.type === "poison")
    .reduce((sum, s) => sum + s.amount, 0);
  if (poisonAmt > 0) {
    marks.push({
      key: "poison",
      icon: "🧪",
      label: `яд ${poisonAmt}`,
      title: `Яд: сейчас −${poisonAmt} HP в начале хода, затем сильнее (+1)`,
      tone: "curse",
    });
  }
  const slowAmt = statuses
    .filter((s) => s.type === "slow")
    .reduce((sum, s) => sum + s.amount, 0);
  const atkLost = Math.max(0, fullAtk - atk);
  if (slowAmt > 0 || atkLost > 0) {
    const n = slowAmt || atkLost;
    marks.push({
      key: "slow",
      icon: "🧊",
      label: `−${n} атк`,
      title: `Замедление: −${n} атаки до конца хода`,
      tone: "warn",
    });
  }
  const shieldLeft = statuses.find((s) => s.type === "shield");
  if (shieldLeft) {
    marks.push({
      key: "shield",
      icon: "🛡",
      label: `${shieldLeft.amount}х`,
      title: `Щит −50% урона, ещё ${shieldLeft.amount} хода`,
      tone: "buff",
    });
  }
  const asleep = statuses.find((s) => s.type === "sleep");
  if (asleep) {
    marks.push({
      key: "sleep",
      icon: "💤",
      label: "сон",
      title: "Усыплён — пропустит следующий ход",
      tone: "warn",
    });
  }
  if (permAttack > 0 || permHealth > 0) {
    marks.push({
      key: "buff",
      icon: "✨",
      label: `+${permAttack}/+${permHealth}`,
      title: `Постоянный баф +${permAttack}/+${permHealth}`,
      tone: "buff",
    });
  }
  if (packBonus > 0) {
    marks.push({
      key: "pack",
      icon: <GameIcon name="death" size={12} />,
      label: `стая +${packBonus}`,
      title: `Стая скелетов: +${packBonus}/+${packBonus}`,
      tone: "buff",
    });
  }

  const wounded = wound > 0;

  const openDesc = (e?: MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (!flippable) return;
    setShowDesc(true);
  };

  const closeDesc = () => setShowDesc(false);

  const onCardClick = () => {
    onClick?.();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    onCardClick();
  };

  return (
    <>
      <div
        className={[
          "card",
          c.kind,
          `frame-lv-${frameLv}`,
          selected ? "selected" : "",
          locked ? "locked" : "",
          compact ? "compact" : "",
          board ? "board" : "",
          canAttack ? "can-attack" : "",
          interactive || flippable ? "clickable" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ ["--school" as string]: color }}
        onClick={interactive ? onCardClick : undefined}
        onKeyDown={interactive ? onKey : undefined}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
      >
        <div className="card-inner">
          <span className="card-frame-ornament" aria-hidden />
          <div className="card-face card-front">
            <div className="card-stats" aria-label="Характеристики">
              <span className="stats-school" title={SCHOOL_LABEL[c.school]}>
                <GameIcon name={c.school} size={14} />
                <ManaCostIcons cost={manaCost} size={11} className="cost-mini" />
              </span>
              {c.kind === "creature" ? (
                <span
                  className={`stats-combat ${wounded ? "is-wounded" : ""}`}
                  title={PATTERN_HINT[pattern]}
                >
                  <span className="combat-nums">
                    {atk}/
                    <span className={wounded ? "hp-hurt" : undefined}>
                      {hp}
                    </span>
                  </span>
                  <span className="pattern-ico">{PATTERN_ICON[pattern]}</span>
                </span>
              ) : (
                <span className="stats-combat spell-badge" title="Заклинание">
                  ✦
                </span>
              )}
              {marks.length > 0 && (
                <div className="effect-marks" aria-label="Эффекты на карте">
                  {marks.map((m) => (
                    <span
                      key={m.key}
                      className={`effect-mark tone-${m.tone}`}
                      title={m.title}
                    >
                      <span className="effect-ico">{m.icon}</span>
                      <span className="effect-label">{m.label}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="card-art-wrap">
              <div
                className="card-art"
                style={{ backgroundImage: `url(${art})` }}
                aria-hidden
              />
              <div className="card-footer">
                <div className="card-name">{c.name}</div>
              </div>
            </div>
          </div>
        </div>
        {locked && <div className="lock-veil" aria-hidden>🔒</div>}
        {flippable && (
          <button
            type="button"
            className="flip-btn"
            title="Изучить свойства"
            aria-label={`Описание: ${c.name}`}
            draggable={false}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={openDesc}
          >
            ↻
          </button>
        )}
      </div>

      {showDesc &&
        createPortal(
          <div
            className="card-desc-overlay"
            onClick={closeDesc}
            role="presentation"
          >
            <article
              className={`card-desc-panel frame-lv-${frameLv}`}
              style={{ ["--school" as string]: color }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label={`Описание: ${c.name}`}
            >
              <div
                className="card-desc-art"
                style={{
                  backgroundImage: `url(${art})`,
                  backgroundSize: "contain",
                  backgroundPosition: "center center",
                  backgroundRepeat: "no-repeat",
                }}
                role="img"
                aria-label={c.name}
              />
              <div className="card-desc-body">
                <h2>
                  <GameIcon name={c.school} size={18} /> {c.name}
                </h2>
                <p className="card-desc-meta inline-icos">
                  {SCHOOL_LABEL[c.school]} · мана{" "}
                  <ManaCostIcons cost={manaCost} size={14} />
                  {c.kind === "creature" && (
                    <>
                      {" "}
                      · {atk}/{hp} {PATTERN_ICON[pattern]}
                    </>
                  )}
                </p>
                {c.kind === "creature" && (
                  <p className="card-desc-pattern">
                    {PATTERN_HINT[pattern] ?? PATTERN_LABEL[pattern]}
                  </p>
                )}
                <p className="card-desc-text">{c.text}</p>
                {marks.length > 0 && (
                  <ul className="card-desc-effects">
                    {marks.map((m) => (
                      <li key={m.key}>
                        {m.icon} {m.title}
                      </li>
                    ))}
                  </ul>
                )}
                {c.premium && (
                  <p className="card-desc-prem">★ Премиум</p>
                )}
                <button
                  type="button"
                  className="primary"
                  onClick={closeDesc}
                >
                  Закрыть
                </button>
              </div>
            </article>
          </div>,
          document.body,
        )}
    </>
  );
}

export function EmptySlot({
  label = "+",
  highlight,
  onClick,
}: {
  label?: string;
  highlight?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`card empty-slot ${highlight ? "targetable" : ""}`}
      onClick={onClick}
    >
      <span>{label}</span>
    </button>
  );
}
