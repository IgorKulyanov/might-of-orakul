import { SCHOOL_COLOR, SCHOOL_LABEL } from "../game/cards";
import { FACTIONS } from "../game/heroes";
import type { Faction, ManaPool } from "../game/types";
import { GameIcon } from "./GameIcon";

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
          title={SCHOOL_LABEL[f]}
        >
          <GameIcon
            name={f}
            className="mana-ico"
            size={compact ? 14 : 16}
            title={SCHOOL_LABEL[f]}
          />
          <span className="mana-n">{mana[f] ?? 0}</span>
        </span>
      ))}
    </div>
  );
}
