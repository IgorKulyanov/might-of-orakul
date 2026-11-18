import type { ReactNode } from "react";
import type { SkillIconId } from "../game/oracleSkills";

/** Простые SVG-иконки умений (потом можно заменить артами). */
export function SkillIcon({
  icon,
  size = 22,
  title,
}: {
  icon: SkillIconId;
  size?: number;
  title?: string;
}) {
  const s = size;
  const common = {
    width: s,
    height: s,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  let body: ReactNode;
  switch (icon) {
    case "mana":
      body = <path d="M12 3 6 12h4v9h4v-9h4L12 3z" fill="currentColor" stroke="none" />;
      break;
    case "strike":
      body = <path d="M4 20 14 4l6 2-4 14-6 2z" />;
      break;
    case "heal":
      body = (
        <>
          <path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z" />
          <path d="M12 8v6M9 11h6" />
        </>
      );
      break;
    case "burn":
      body = <path d="M12 22c4 0 6-3 6-7 0-4-3-6-3-10-3 2-4 5-4 5S10 7 9 5c0 4-3 6-3 10 0 4 2 7 6 7z" />;
      break;
    case "sleep":
      body = (
        <>
          <path d="M5 15a7 7 0 0 0 14 0" />
          <path d="M9 8h2l-2 3h2M14 6h3l-3 4h3" />
        </>
      );
      break;
    case "buff":
      body = <path d="M12 4v16M8 10l4-6 4 6M8 18h8" />;
      break;
    case "shield":
      body = <path d="M12 3 5 6v6c0 5 3 8 7 9 4-1 7-4 7-9V6l-7-3z" />;
      break;
    case "sacrifice":
      body = <path d="M12 3v18M5 8h14M7 12h10M9 16h6" />;
      break;
    case "harvest":
      body = <path d="M4 20c6-2 8-8 8-16 0 8 2 14 8 16M8 10h8" />;
      break;
    case "armor":
      body = <path d="M12 2 4 6v5c0 6 4 9 8 11 4-2 8-5 8-11V6l-8-4zM9 12h6" />;
      break;
    case "card":
      body = <rect x="5" y="3" width="14" height="18" rx="2" />;
      break;
    case "sprout":
      body = <path d="M12 22V10M12 10c0-5 5-6 5-6s0 5-5 6c0-5-5-6-5-6s0 5 5 6" />;
      break;
    case "bounce":
      body = <path d="M4 12h12M12 6l6 6-6 6" />;
      break;
    case "shift":
      body = <path d="M7 8h10M7 16h10M14 5l4 3-4 3M10 13l-4 3 4 3" />;
      break;
    case "poison":
      body = (
        <>
          <circle cx="12" cy="14" r="6" />
          <path d="M12 4v4M9 6h6" />
        </>
      );
      break;
    default:
      body = <circle cx="12" cy="12" r="7" />;
  }
  return (
    <span className="skill-ico" title={title} style={{ width: s, height: s }}>
      <svg {...common}>{body}</svg>
    </span>
  );
}
