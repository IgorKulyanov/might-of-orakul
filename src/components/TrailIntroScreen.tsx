import { useState } from "react";
import {
  schoolTrailIntroArt,
  schoolTrailPowerName,
  schoolTrailTitle,
  SCHOOL_TRAIL_THREE_CARDS_ART,
} from "../game/schoolTrails";
import type { Faction } from "../game/types";
import { MenuAudioDock } from "./MenuAudioDock";

type Props = {
  faction: Faction;
  onDone: () => void;
};

/**
 * Вступление перед 1-м флагом тропы: приветствие школы → 3 карты призыва.
 */
export function TrailIntroScreen({ faction, onDone }: Props) {
  const [page, setPage] = useState<0 | 1>(0);
  const trail = schoolTrailTitle(faction);
  const power = schoolTrailPowerName(faction);
  const art =
    page === 0
      ? schoolTrailIntroArt(faction)
      : SCHOOL_TRAIL_THREE_CARDS_ART;

  const title =
    page === 0 ? `Добро пожаловать на ${trail}` : "Три карты призыва";

  const body =
    page === 0
      ? `Пройдя её, ты сможешь связать свою судьбу с великой силой школы ${power}.`
      : `Чтобы тебе помочь постичь силу ${power} и научиться пользоваться заклинаниями великой книги оракула, прими 3 собранные карты призыва — они помогут тебе на тропе испытаний и в будущем.`;

  return (
    <div className="prologue-screen trail-intro-screen">
      <div className="prologue-top">
        <MenuAudioDock />
        <button type="button" className="ghost prologue-skip" onClick={onDone}>
          В бой
        </button>
      </div>

      <div
        className={`prologue-stage has-art trail-intro-stage`}
        style={{ backgroundImage: `url(${art})` }}
      >
        <div className="prologue-veil" />
        <div className="prologue-copy">
          <p className="prologue-eyebrow">{trail}</p>
          <h1 className="prologue-title">{title}</h1>
          <p className="prologue-body">{body}</p>
          <div className="prologue-actions">
            <button
              type="button"
              className="primary large"
              onClick={() => {
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
        </div>
      </div>
    </div>
  );
}
