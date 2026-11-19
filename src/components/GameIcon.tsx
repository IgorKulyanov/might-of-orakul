import { SCHOOL_LABEL } from "../game/cards";
import type { Faction, ManaCost, School } from "../game/types";

export type GameIconName =
  | Faction
  | School
  | "gold"
  | "diamond";

/** Версия ассетов — сброс кэша браузера после правок эмблем. */
const UI_VER = "9";

const SCHOOLS = new Set(["water", "hell", "death", "life", "nature"]);

/** Мобилка — PNG как было. Десктоп (мышь) — SVG. */
const SRC_MOBILE: Record<string, string> = {
  water: `/ui/water.png?v=${UI_VER}`,
  hell: `/ui/hell.png?v=${UI_VER}`,
  death: `/ui/death.png?v=${UI_VER}`,
  life: `/ui/life.png?v=${UI_VER}`,
  nature: `/ui/nature.png?v=${UI_VER}`,
  neutral: `/ui/neutral.svg?v=${UI_VER}`,
  gold: `/ui/gold.svg?v=${UI_VER}`,
  diamond: `/ui/diamond.svg?v=${UI_VER}`,
};

const SRC_DESKTOP: Record<string, string> = {
  water: `/ui/water.svg?v=${UI_VER}`,
  hell: `/ui/hell.svg?v=${UI_VER}`,
  death: `/ui/death.svg?v=${UI_VER}`,
  life: `/ui/life.svg?v=${UI_VER}`,
  nature: `/ui/nature.svg?v=${UI_VER}`,
  neutral: `/ui/neutral.svg?v=${UI_VER}`,
  gold: `/ui/gold.svg?v=${UI_VER}`,
  diamond: `/ui/diamond.svg?v=${UI_VER}`,
};

const ALT: Record<string, string> = {
  water: "вода",
  hell: "огонь",
  death: "смерть",
  life: "жизнь",
  nature: "природа",
  neutral: "нейтрал",
  gold: "золото",
  diamond: "алмаз",
};

const MANA_ORDER: Faction[] = [
  "water",
  "hell",
  "death",
  "life",
  "nature",
];

const DESKTOP_MQ = "(hover: hover) and (pointer: fine)";

type Props = {
  name: GameIconName;
  className?: string;
  /** px, default 16 */
  size?: number;
  title?: string;
};

/** Свои иконки вместо эмодзи — одинаково на всех устройствах. */
export function GameIcon({ name, className = "", size = 16, title }: Props) {
  const mobileSrc = SRC_MOBILE[name] ?? SRC_MOBILE.neutral;
  const desktopSrc = SRC_DESKTOP[name] ?? SRC_DESKTOP.neutral;
  const alt = title ?? ALT[name] ?? "";
  const cls = `game-ico ${className}`.trim();
  const isSchool = SCHOOLS.has(name);

  if (isSchool) {
    return (
      <picture className={cls} style={{ width: size, height: size, display: "inline-block", lineHeight: 0 }}>
        <source media={DESKTOP_MQ} srcSet={desktopSrc} />
        <img
          src={mobileSrc}
          alt={alt}
          title={alt}
          width={size}
          height={size}
          className="game-ico"
          draggable={false}
          style={{ width: size, height: size, verticalAlign: "-0.2em" }}
        />
      </picture>
    );
  }

  return (
    <img
      src={mobileSrc}
      alt={alt}
      title={alt}
      width={size}
      height={size}
      className={cls}
      draggable={false}
    />
  );
}

/** Иконка школы + подпись (Жизнь / Смерть / …). */
export function SchoolBadge({
  school,
  size = 14,
  className = "",
  hideLabel = false,
}: {
  school: School;
  size?: number;
  className?: string;
  hideLabel?: boolean;
}) {
  return (
    <span className={`inline-icos school-badge ${className}`.trim()}>
      <GameIcon name={school} size={size} title={SCHOOL_LABEL[school]} />
      {!hideLabel ? <span>{SCHOOL_LABEL[school]}</span> : null}
    </span>
  );
}

/** Стоимость карты: иконки школ + цифры (вместо букв «Ог2»). */
export function ManaCostIcons({
  cost,
  size = 12,
  className = "",
}: {
  cost: ManaCost;
  size?: number;
  className?: string;
}) {
  const parts = MANA_ORDER.filter((f) => (cost[f] ?? 0) > 0).map((f) => (
    <span key={f} className="mana-cost-part">
      <GameIcon name={f} size={size} title={SCHOOL_LABEL[f]} />
      <span className="mana-cost-n">{cost[f]}</span>
    </span>
  ));
  if (!parts.length) {
    return <span className={`mana-cost-row ${className}`.trim()}>0</span>;
  }
  return (
    <span className={`mana-cost-row ${className}`.trim()}>{parts}</span>
  );
}

/** Для текста в alert/confirm — без картинок. */
export function goldText(n: number): string {
  return `${n} зол.`;
}

export function diamondText(n: number): string {
  return `${n} алм.`;
}
