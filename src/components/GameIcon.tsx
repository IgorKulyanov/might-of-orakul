import type { Faction, School } from "../game/types";

export type GameIconName =
  | Faction
  | School
  | "gold"
  | "diamond";

const SRC: Record<string, string> = {
  water: "/ui/water.svg",
  hell: "/ui/hell.svg",
  death: "/ui/death.svg",
  life: "/ui/life.svg",
  nature: "/ui/nature.svg",
  neutral: "/ui/neutral.svg",
  gold: "/ui/gold.svg",
  diamond: "/ui/diamond.svg",
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

type Props = {
  name: GameIconName;
  className?: string;
  /** px, default 16 */
  size?: number;
  title?: string;
};

/** Свои иконки вместо эмодзи — одинаково на всех устройствах. */
export function GameIcon({ name, className = "", size = 16, title }: Props) {
  const src = SRC[name] ?? SRC.neutral;
  return (
    <img
      src={src}
      alt={title ?? ALT[name] ?? ""}
      title={title ?? ALT[name]}
      width={size}
      height={size}
      className={`game-ico ${className}`.trim()}
      draggable={false}
    />
  );
}

/** Для текста в alert/confirm — без картинок. */
export function goldText(n: number): string {
  return `${n} зол.`;
}

export function diamondText(n: number): string {
  return `${n} алм.`;
}
