import { useState } from "react";
import {
  SCHOOL_TRAIL_FACTIONS,
  SCHOOL_TRAIL_FINALE_POS,
  SCHOOL_TRAIL_FLAG_POS,
  SCHOOL_TRAIL_REWARDS,
  SCHOOL_TRAIL_STEPS,
  canPickSchool,
  schoolTrailCleared,
  schoolTrailDraft,
  schoolTrailStep,
  schoolTrailTitle,
} from "../game/schoolTrails";
import { getCard } from "../game/cards";
import type { Faction, OwnedState } from "../game/types";
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

type Preview =
  | { kind: "step"; faction: Faction; stepIndex: number }
  | { kind: "finale" };

export function SchoolTrailsScreen({
  owned,
  displayName,
  onPlayTrail,
  onPickSchool,
  onBack,
  asTutorial = false,
}: Props) {
  const ready = canPickSchool(owned);
  const [preview, setPreview] = useState<Preview | null>(null);

  const previewStep =
    preview?.kind === "step"
      ? schoolTrailStep(preview.faction, preview.stepIndex)
      : null;
  const previewCleared =
    preview?.kind === "step"
      ? schoolTrailCleared(owned, preview.faction)
      : 0;
  const previewFightable =
    preview?.kind === "step" &&
    preview.stepIndex === previewCleared &&
    previewCleared < SCHOOL_TRAIL_STEPS;
  const previewDone =
    preview?.kind === "step" && preview.stepIndex < previewCleared;

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
        {displayName ? `${displayName}: ` : ""}
        5 земель × 5 флажков. Первый открыт, дальше серые. ★ — выбор школы
        после любой полной тропы.
      </p>

      <div className="oracle-path-map-wrap">
        <img
          className="oracle-path-map-art"
          src="/campaign-map.webp"
          alt="Карта Пути оракула"
          draggable={false}
        />

        {SCHOOL_TRAIL_FACTIONS.map((faction) => {
          const cleared = schoolTrailCleared(owned, faction);
          const positions = SCHOOL_TRAIL_FLAG_POS[faction];
          return positions.map((pos, stepIndex) => {
            const done = stepIndex < cleared;
            const current =
              stepIndex === cleared && cleared < SCHOOL_TRAIL_STEPS;
            const locked = !done && !current;
            const cls = [
              "oracle-path-flag",
              `school-${faction}`,
              done ? "is-cleared" : "",
              locked ? "is-locked" : "",
              current ? "is-current is-fightable" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={`${faction}-${stepIndex}`}
                type="button"
                className={cls}
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                title={`${schoolTrailTitle(faction)} · ${stepIndex + 1}/${SCHOOL_TRAIL_STEPS}`}
                onClick={() => setPreview({ kind: "step", faction, stepIndex })}
              >
                <span className="oracle-path-flag-pole" aria-hidden />
                <span className="oracle-path-flag-cloth" aria-hidden>
                  <em>{stepIndex + 1}</em>
                </span>
              </button>
            );
          });
        })}

        <button
          type="button"
          className={[
            "oracle-path-flag is-finale",
            ready ? "is-current is-fightable" : "is-locked",
          ].join(" ")}
          style={{
            left: `${SCHOOL_TRAIL_FINALE_POS.x}%`,
            top: `${SCHOOL_TRAIL_FINALE_POS.y}%`,
          }}
          title={
            ready
              ? "Сердце мира — выбрать оракула"
              : "Сначала заверши любую тропу (5/5)"
          }
          onClick={() => setPreview({ kind: "finale" })}
        >
          <span className="oracle-path-flag-pole" aria-hidden />
          <span className="oracle-path-flag-cloth" aria-hidden>
            <em>★</em>
          </span>
        </button>
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

      {preview?.kind === "step" && previewStep && (
        <div
          className="overlay campaign-preview-overlay"
          onClick={() => setPreview(null)}
          role="presentation"
        >
          <div
            className="campaign-preview-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Флажок тропы"
          >
            <p className="campaign-preview-eyebrow">
              {schoolTrailTitle(preview.faction)} · флажок{" "}
              {preview.stepIndex + 1}/{SCHOOL_TRAIL_STEPS}
            </p>
            <h2>{previewStep.foeName}</h2>
            <p className="campaign-preview-story">
              {previewStep.lesson || "История этого флажка ещё пишется."}
            </p>
            {previewDone && previewStep.wowHint ? (
              <p className="campaign-preview-outro">
                <strong>Заключение:</strong> {previewStep.wowHint}
              </p>
            ) : null}
            {!previewDone && !previewFightable ? (
              <p className="hint">Сначала пройди предыдущий флажок этой земли.</p>
            ) : null}
            {previewFightable ? (
              <p className="hint">
                Награда тропы:{" "}
                {SCHOOL_TRAIL_REWARDS[preview.faction]
                  .map((r) => `${r.afterCleared}→${cardName(r.cardId)}`)
                  .join(" · ")}
                {schoolTrailDraft(owned, preview.faction).length
                  ? ` · уже: ${schoolTrailDraft(owned, preview.faction)
                      .map(cardName)
                      .join(", ")}`
                  : ""}
              </p>
            ) : null}
            <div className="campaign-preview-actions">
              {previewFightable ? (
                <button
                  type="button"
                  className="primary large"
                  onClick={() => {
                    setPreview(null);
                    onPlayTrail(preview.faction, preview.stepIndex);
                  }}
                >
                  Принять бой
                </button>
              ) : null}
              <button
                type="button"
                className="ghost large"
                onClick={() => setPreview(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {preview?.kind === "finale" && (
        <div
          className="overlay campaign-preview-overlay"
          onClick={() => setPreview(null)}
          role="presentation"
        >
          <div
            className="campaign-preview-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Сердце мира"
          >
            <p className="campaign-preview-eyebrow">Финал пути</p>
            <h2>Сердце мира</h2>
            <p className="campaign-preview-story">
              {ready
                ? "Пять земель сомкнулись вокруг тебя. Пора выбрать оракула и унести в мир одну мини-колоду школы."
                : "Здесь сходятся все земли. Флажок откроется, когда любая тропа будет пройдена до конца (5 из 5)."}
            </p>
            <div className="campaign-preview-actions">
              {ready ? (
                <button
                  type="button"
                  className="primary large"
                  onClick={() => {
                    setPreview(null);
                    onPickSchool();
                  }}
                >
                  Выбрать оракула
                </button>
              ) : null}
              <button
                type="button"
                className="ghost large"
                onClick={() => setPreview(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
