import { useState } from "react";
import {
  schoolTrailIntroArt,
  schoolTrailTitle,
  schoolTrailTitleAccusative,
  SCHOOL_TRAIL_THREE_CARDS_ART,
} from "../game/schoolTrails";
import type { Faction } from "../game/types";
import { MenuAudioDock } from "./MenuAudioDock";

type Props = {
  faction: Faction;
  onDone: () => void;
};

/**
 * Вступление перед 1-м флагом: только заставки с картинками.
 */
export function TrailIntroScreen({ faction, onDone }: Props) {
  const [page, setPage] = useState<0 | 1>(0);
  const trail = schoolTrailTitle(faction);
  const trailAcc = schoolTrailTitleAccusative(faction);
  const art =
    page === 0
      ? schoolTrailIntroArt(faction)
      : SCHOOL_TRAIL_THREE_CARDS_ART;

  return (
    <div className="prologue-screen trail-intro-screen">
      <div className="prologue-top">
        <MenuAudioDock />
        <button type="button" className="ghost prologue-skip" onClick={onDone}>
          В бой
        </button>
      </div>

      <div
        className="prologue-stage has-art trail-intro-stage"
        style={{ backgroundImage: `url(${art})` }}
        onClick={() => {
          if (page === 0) setPage(1);
          else onDone();
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (page === 0) setPage(1);
            else onDone();
          }
        }}
      >
        <div className="prologue-veil trail-intro-veil" />
        <div className="prologue-copy trail-intro-copy">
          {page === 0 ? (
            <h1 className="prologue-title">
              Добро пожаловать на {trailAcc}
            </h1>
          ) : (
            <h1 className="prologue-title">Три карты призыва</h1>
          )}
          <div className="prologue-actions">
            <button
              type="button"
              className="primary large"
              onClick={(e) => {
                e.stopPropagation();
                if (page === 0) setPage(1);
                else onDone();
              }}
            >
              {page === 0 ? "Дальше" : "Начать тропу"}
            </button>
          </div>
          <p className="prologue-dots" aria-hidden>
            <span className={`prologue-dot${page === 0 ? " is-on" : ""}`} />
            <span className={`prologue-dot${page === 1 ? " is-on" : ""}`} />
          </p>
          <p className="hint trail-intro-eyebrow">{trail}</p>
        </div>
      </div>
    </div>
  );
}
