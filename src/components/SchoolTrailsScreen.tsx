import {
  SCHOOL_TRAIL_FACTIONS,
  SCHOOL_TRAIL_REWARDS,
  SCHOOL_TRAIL_STEPS,
  canPickSchool,
  schoolTrailCleared,
  schoolTrailDraft,
  schoolTrailStep,
  schoolTrailTitle,
} from "../game/schoolTrails";
import { getCard, SCHOOL_COLOR } from "../game/cards";
import type { Faction, OwnedState } from "../game/types";
import { SchoolBadge } from "./GameIcon";
import { MenuAudioDock } from "./MenuAudioDock";

type Props = {
  owned: OwnedState;
  displayName: string;
  onPlayTrail: (faction: Faction, stepIndex: number) => void;
  onPickSchool: () => void;
  /** Повторный заход из хаба — можно назад в меню. */
  onBack?: () => void;
  /** Первый проход: без выхода в меню, тон «обучение». */
  asTutorial?: boolean;
  onSaveName?: (name: string) => void;
};

function cardName(id: string): string {
  try {
    return getCard(id).name;
  } catch {
    return id;
  }
}

export function SchoolTrailsScreen({
  owned,
  displayName,
  onPlayTrail,
  onPickSchool,
  onBack,
  asTutorial = false,
}: Props) {
  const ready = canPickSchool(owned);

  return (
    <div className={`school-trails-screen${asTutorial ? " is-tutorial" : ""}`}>
      <header className="page-bar">
        {onBack && !asTutorial ? (
          <button type="button" className="ghost" onClick={onBack}>
            ← Меню
          </button>
        ) : null}
        <h1>{asTutorial ? "Обучение · Путь оракула" : "Путь оракула"}</h1>
        <MenuAudioDock className="school-trails-audio" />
      </header>
      <p className="hint school-trails-hint">
        {displayName ? `${displayName}, ` : ""}
        {asTutorial
          ? "три нейтрала с тобой. На каждой тропе копишь мини-колоду школы — в мир уйдёт только одна, вместе с оракулом. Школы не смешиваются."
          : "награды троп изолированы: в мир заберёшь одну школу + нейтралов."}
      </p>
      <p className="school-trails-progress">
        {ready
          ? "Есть завершённая тропа — можно выбрать оракула и унести её мини-колоду"
          : "Пройди любую тропу до конца (5 боёв), чтобы выбрать школу"}
      </p>

      <div className="school-trails-grid">
        {SCHOOL_TRAIL_FACTIONS.map((faction) => {
          const cleared = schoolTrailCleared(owned, faction);
          const done = cleared >= SCHOOL_TRAIL_STEPS;
          const step = schoolTrailStep(
            faction,
            done ? SCHOOL_TRAIL_STEPS - 1 : cleared,
          );
          const draft = schoolTrailDraft(owned, faction);
          const color = SCHOOL_COLOR[faction];
          const rewardHints = SCHOOL_TRAIL_REWARDS[faction]
            .map((r) => `${r.afterCleared}: ${cardName(r.cardId)}`)
            .join(" · ");
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
                  {done
                    ? "Тропа пройдена — мини-колода готова к выбору."
                    : `Дальше: ${step.foeName}. ${step.lesson}`}
                </p>
              )}
              <p className="school-trail-draft hint">
                Награды: {rewardHints}
                {draft.length
                  ? ` · сейчас: ${draft.map(cardName).join(", ")}`
                  : ""}
              </p>
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
          onClick={onPickSchool}
          disabled={!ready}
        >
          {ready
            ? "Выбрать оракула и унести одну мини-колоду"
            : "Сначала заверши хотя бы одну тропу"}
        </button>
      </div>
    </div>
  );
}
