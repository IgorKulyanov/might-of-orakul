import {
  SCHOOL_TRAIL_FACTIONS,
  SCHOOL_TRAIL_STEPS,
  SCHOOL_TRAIL_WINS_TO_PICK,
  canPickSchool,
  schoolTrailCleared,
  schoolTrailStep,
  schoolTrailTitle,
  schoolTrailWinsTotal,
} from "../game/schoolTrails";
import { SCHOOL_COLOR } from "../game/cards";
import type { Faction, OwnedState } from "../game/types";
import { SchoolBadge } from "./GameIcon";

type Props = {
  owned: OwnedState;
  displayName: string;
  onPlayTrail: (faction: Faction, stepIndex: number) => void;
  onPickSchool: () => void;
  onSaveName?: (name: string) => void;
};

export function SchoolTrailsScreen({
  owned,
  displayName,
  onPlayTrail,
  onPickSchool,
}: Props) {
  const wins = schoolTrailWinsTotal(owned);
  const ready = canPickSchool(owned);

  return (
    <div className="school-trails-screen">
      <header className="page-bar">
        <h1>Тропы школ</h1>
      </header>
      <p className="hint school-trails-hint">
        {displayName ? `${displayName}, ` : ""}
        ты ещё не выбрал школу. Пройди тропы — почувствуй вкус каждой силы.
        Враг на тропе: только юниты на столе, без колоды.
      </p>
      <p className="school-trails-progress">
        Побед на тропах: {wins} / {SCHOOL_TRAIL_WINS_TO_PICK}
        {ready
          ? " — можно выбрать школу"
          : ` (ещё ${Math.max(0, SCHOOL_TRAIL_WINS_TO_PICK - wins)})`}
      </p>

      <div className="school-trails-grid">
        {SCHOOL_TRAIL_FACTIONS.map((faction) => {
          const cleared = schoolTrailCleared(owned, faction);
          const done = cleared >= SCHOOL_TRAIL_STEPS;
          const step = schoolTrailStep(faction, done ? SCHOOL_TRAIL_STEPS - 1 : cleared);
          const color = SCHOOL_COLOR[faction];
          return (
            <div
              key={faction}
              className={`school-trail-card ${done ? "done" : ""}`}
              style={{ ["--faction" as string]: color }}
            >
              <div className="school-trail-card-head">
                <SchoolBadge school={faction} size={18} />
                <strong>{schoolTrailTitle(faction)}</strong>
                <span className="school-trail-steps">
                  {cleared}/{SCHOOL_TRAIL_STEPS}
                </span>
              </div>
              {step && (
                <p className="school-trail-lesson">
                  {done ? "Тропа пройдена." : `Дальше: ${step.foeName}. ${step.lesson}`}
                </p>
              )}
              <button
                type="button"
                className="primary"
                disabled={done}
                onClick={() => onPlayTrail(faction, cleared)}
              >
                {done ? "Готово" : `Бой ${cleared + 1}`}
              </button>
            </div>
          );
        })}
      </div>

      <div className="school-trails-footer">
        <button
          type="button"
          className="primary large"
          disabled={!ready}
          onClick={onPickSchool}
        >
          {ready
            ? "Какая сила отозвалась? — выбрать школу"
            : `Сначала ${SCHOOL_TRAIL_WINS_TO_PICK} побед на тропах`}
        </button>
      </div>
    </div>
  );
}
