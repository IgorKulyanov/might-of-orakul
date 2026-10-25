import { FACTION_LABEL, SCHOOL_COLOR } from "../game/cards";
import { FACTIONS } from "../game/heroes";
import type { Faction, ManaPool } from "../game/types";

type Props = {
  mana: ManaPool;
  highlight?: Faction;
  compact?: boolean;
};

export function ManaBar({ mana, highlight, compact }: Props) {
  return (
    <div className={`mana-bar ${compact ? "compact" : ""}`}>
      {FACTIONS.map((f) => (
        <span
          key={f}
          className={`mana-chip ${highlight === f ? "own" : ""}`}
          style={{ ["--faction" as string]: SCHOOL_COLOR[f] }}
          title={f}
        >
          <span className="mana-ico">{FACTION_LABEL[f]}</span>
          <span className="mana-n">{mana[f] ?? 0}</span>
        </span>
      ))}
    </div>
  );
}
