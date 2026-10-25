type Props = {
  level: number;
  xp: number;
  xpNeed: number;
  /** Компактный вид в бою / шапке */
  compact?: boolean;
  className?: string;
};

export function XpBar({
  level,
  xp,
  xpNeed,
  compact = false,
  className = "",
}: Props) {
  const pct =
    xpNeed <= 0 ? 100 : Math.min(100, Math.max(0, (xp / xpNeed) * 100));
  const label =
    xpNeed <= 0
      ? `Ур. ${level} · макс.`
      : `Ур. ${level} · ${xp} / ${xpNeed} XP`;

  return (
    <div
      className={`xp-track ${compact ? "compact" : ""} ${className}`.trim()}
      title={label}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      {!compact && <div className="xp-track-label">{label}</div>}
      <div className="xp-track-rail">
        <div className="xp-track-fill" style={{ width: `${pct}%` }} />
      </div>
      {compact && <span className="xp-track-mini">{label}</span>}
    </div>
  );
}
