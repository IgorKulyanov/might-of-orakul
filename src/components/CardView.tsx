import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  SCHOOL_COLOR,
  SCHOOL_LABEL,
  cardArtStyle,
  cardArtUrl,
  cardFrameLevel,
  getCard,
} from "../game/cards";
import {
  syncPlanStatNumbers,
  upgradePlanBody,
  upgradePlanFor,
} from "../game/cardUpgradePlan";
import {
  creatureFaceStats,
  defaultUpgradeLevel,
  isUpgradeableCard,
  upgradeStatBonus,
} from "../game/cardUpgrades";
import { patternGlyphForCard } from "../game/rangedStyle";
import type {
  AttackPattern,
  CardDef,
  ManaCost,
  StatusEffect,
} from "../game/types";
import { GameIcon, ManaCostIcons, SchoolBadge } from "./GameIcon";

type Props = {
  cardId?: string;
  card?: CardDef;
  selected?: boolean;
  locked?: boolean;
  /** Магазин: карта открыта по уровню, ещё не в оракуле — ярче. */
  shopReady?: boolean;
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
  /** Уровень прокачки карты (1…3) — бейдж на арте. */
  upgradeLevel?: 1 | 2 | 3 | null;
  /** Сразу открыть описание (книга оракула и т.п.). */
  autoOpenDesc?: boolean;
  onDescClose?: () => void;
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
  shopReady,
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
  upgradeLevel = null,
  autoOpenDesc = false,
  onDescClose,
  onClick,
}: Props) {
  const c = card ?? (cardId ? getCard(cardId) : null);
  const [showDesc, setShowDesc] = useState(autoOpenDesc);
  const [floatDmg, setFloatDmg] = useState<number | null>(null);
  const prevHpRef = useRef<number | null>(null);
  const trackedHp =
    liveHealth ??
    (c
      ? (c.health ?? 0) +
        (upgradeLevel != null && upgradeLevel >= 1
          ? upgradeStatBonus(c.id, upgradeLevel).hp
          : c.kind === "creature" && isUpgradeableCard(c.id)
            ? upgradeStatBonus(c.id, defaultUpgradeLevel(c.id)).hp
            : 0)
      : 0);
  useEffect(() => {
    if (autoOpenDesc) setShowDesc(true);
  }, [autoOpenDesc, c?.id]);
  useEffect(() => {
    if (!board || !c) {
      prevHpRef.current = trackedHp;
      return;
    }
    const prev = prevHpRef.current;
    prevHpRef.current = trackedHp;
    if (prev == null || trackedHp >= prev) return;
    const lost = prev - trackedHp;
    setFloatDmg(lost);
    const t = window.setTimeout(() => setFloatDmg(null), 1600);
    return () => window.clearTimeout(t);
  }, [board, trackedHp, c?.id]);
  if (!c) return null;

  const color = SCHOOL_COLOR[c.school];
  const frameLv = cardFrameLevel(c);
  const art = cardArtUrl(c);
  const artStyle = cardArtStyle(c);
  // JSON ≈ статы ур.2. На лице — статы текущего/стартового уровня прокачки.
  const displayLv =
    upgradeLevel != null && upgradeLevel >= 1
      ? upgradeLevel
      : c.kind === "creature" && isUpgradeableCard(c.id)
        ? defaultUpgradeLevel(c.id)
        : null;
  const statBonus =
    displayLv != null ? upgradeStatBonus(c.id, displayLv) : { atk: 0, hp: 0 };
  const baseAtk = (c.attack ?? 0) + statBonus.atk;
  const baseHp = (c.health ?? 0) + statBonus.hp;
  const atk = liveAttack ?? baseAtk;
  const hp = liveHealth ?? baseHp;
  const fullHp = maxHealth ?? baseHp;
  const fullAtk = maxAttack ?? baseAtk;
  const pattern = (c.attackPattern ?? "melee") as AttackPattern;
  const patternGlyph = patternGlyphForCard(c.id, pattern);
  const manaCost = manaCostOverride ?? c.manaCost ?? {};
  const interactive = Boolean(onClick) && !(locked && !onClick);

  const marks: EffectMark[] = [];
  const wound = Math.max(0, fullHp - hp);
  /* На столе: без вечной плашки −N (закрывает арт). Всплывающий урон — ниже. */
  if (wound > 0 && !board) {
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
      title: `Яд: в начале хода жертвы −${poisonAmt} от текущих HP, потом сильнее (+1), пока не снимут`,
      tone: "curse",
    });
  }
  const burn = statuses.find((s) => s.type === "burn");
  if (burn) {
    const left = burn.turns ?? 1;
    marks.push({
      key: "burn",
      icon: "🔥",
      label: `огонь ${burn.amount}×${left}`,
      title: `Горение: в начале хода −${burn.amount} HP, ещё ${left} ход.`,
      tone: "bad",
    });
  }
  const slowLayers = statuses.filter((s) => s.type === "slow");
  const slowAmt = slowLayers.reduce((sum, s) => sum + s.amount, 0);
  const atkLost = Math.max(0, fullAtk - atk);
  if (slowAmt > 0 || atkLost > 0) {
    const n = slowAmt || atkLost;
    const maxTurns = slowLayers.reduce(
      (m, s) => Math.max(m, s.turns ?? 1),
      0,
    );
    const layers = slowLayers.length;
    marks.push({
      key: "slow",
      icon: "🧊",
      label:
        layers > 1
          ? `−${n}×${layers}`
          : maxTurns > 1
            ? `−${n}/${maxTurns}х`
            : `−${n} атк`,
      title:
        layers > 1
          ? `Замедление: ${layers} слоя, суммарно −${n} атаки (макс. ${maxTurns} х.)`
          : `Замедление: −${n} атаки ещё ${maxTurns || 1} ход.`,
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

  const closeDesc = (e?: MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    setShowDesc(false);
    onDescClose?.();
  };

  useEffect(() => {
    if (!showDesc) return;
    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        setShowDesc(false);
        onDescClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showDesc, onDescClose]);

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
          shopReady && !locked ? "shop-ready" : "",
          compact ? "compact" : "",
          board ? "board" : "",
          canAttack ? "can-attack" : "",
          interactive || flippable ? "clickable" : "",
          autoOpenDesc ? "is-desc-host" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-card={c.id}
        style={{ ["--school" as string]: color }}
        onClick={interactive ? onCardClick : undefined}
        onKeyDown={interactive ? onKey : undefined}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
      >
        {upgradeLevel != null && upgradeLevel >= 1 ? (
          <span
            className={`card-upgrade-badge is-lv-${upgradeLevel}`}
            title={`Прокачка: ур.${upgradeLevel}`}
          >
            Ур.{upgradeLevel}
          </span>
        ) : null}
        {board && floatDmg != null && floatDmg > 0 ? (
          <span
            key={`fd-${floatDmg}-${hp}`}
            className="card-float-dmg"
            aria-hidden
          >
            −{floatDmg}
          </span>
        ) : null}
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
                  title={patternGlyph.title}
                >
                  <span className="combat-nums">
                    {atk}/
                    <span className={wounded ? "hp-hurt" : undefined}>
                      {hp}
                    </span>
                  </span>
                  <span className="pattern-ico">{patternGlyph.icon}</span>
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
                style={{
                  backgroundImage: `url(${art})`,
                  ...artStyle,
                }}
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
            onPointerDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <article
              className={`card-desc-panel frame-lv-${frameLv}`}
              style={{ ["--school" as string]: color }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={`Описание: ${c.name}`}
            >
              <button
                type="button"
                className="card-desc-x ghost"
                aria-label="Закрыть"
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={closeDesc}
              >
                ✕
              </button>
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
                <div className="card-desc-scroll">
                  <h2>
                    <GameIcon name={c.school} size={18} /> {c.name}
                  </h2>
                  <p className="card-desc-meta inline-icos">
                    <SchoolBadge school={c.school} size={14} /> · мана{" "}
                    <ManaCostIcons cost={manaCost} size={14} />
                    {c.kind === "creature" && (
                      <>
                        {" "}
                        · атака {baseAtk} · жизни {baseHp} {patternGlyph.icon}
                        {wounded ? (
                          <>
                            {" "}
                            · сейчас {atk}/{hp}
                          </>
                        ) : null}
                      </>
                    )}
                  </p>
                  {c.text ? <p className="card-desc-text">{c.text}</p> : null}
                  {(() => {
                    const plan = upgradePlanFor(c.id);
                    const cur =
                      upgradeLevel != null && upgradeLevel >= 1
                        ? upgradeLevel
                        : 1;
                    const tone =
                      cur >= 3 ? "is-lv-3" : cur === 2 ? "is-lv-2" : "is-lv-1";
                    if (!plan) return null;
                    const face = creatureFaceStats(c.id, cur);
                    const skill = syncPlanStatNumbers(
                      upgradePlanBody(c.id, cur),
                      face.atk,
                      face.hp,
                    );
                    if (!skill) return null;
                    return (
                      <p className={`card-desc-level ${tone}`}>
                        <span className="card-desc-level-line">
                          Ур.{cur} — {skill}
                        </span>
                      </p>
                    );
                  })()}
                  {(() => {
                    const plan = upgradePlanFor(c.id);
                    if (!plan) return null;
                    const cur =
                      upgradeLevel != null && upgradeLevel >= 1
                        ? upgradeLevel
                        : 1;
                    return (
                      <ul className="card-desc-upgrade-list" aria-label="Уровни">
                        {(
                          [
                            [1, plan.l1],
                            [2, plan.l2],
                            [3, plan.l3],
                          ] as const
                        ).map(([lv, text]) => {
                          const face = creatureFaceStats(c.id, lv);
                          const synced = syncPlanStatNumbers(
                            text,
                            face.atk,
                            face.hp,
                          );
                          return (
                            <li
                              key={lv}
                              className={`card-desc-upgrade-item is-lv-${lv}${
                                cur === lv ? " is-current" : ""
                              }`}
                            >
                              <span className="card-desc-upgrade-lv">
                                Ур.{lv}
                              </span>
                              <span className="card-desc-upgrade-txt">
                                {synced}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    );
                  })()}
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
                </div>
                <div className="card-desc-footer">
                  <button
                    type="button"
                    className="primary"
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={closeDesc}
                  >
                    Закрыть
                  </button>
                </div>
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
