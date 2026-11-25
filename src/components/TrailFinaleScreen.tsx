import {
  schoolTrailFinaleArt,
  schoolTrailFinaleBody,
  schoolTrailTitle,
} from "../game/schoolTrails";
import type { Faction } from "../game/types";
import { MenuAudioDock } from "./MenuAudioDock";

type Props = {
  faction: Faction;
  onDone: () => void;
};

/** Заставка после прохождения 5 флагов тропы школы. */
export function TrailFinaleScreen({ faction, onDone }: Props) {
  const trail = schoolTrailTitle(faction);
  const art = schoolTrailFinaleArt(faction);
  const body = schoolTrailFinaleBody(faction);

  return (
    <div className="prologue-screen trail-intro-screen trail-finale-screen">
      <div className="prologue-top">
        <MenuAudioDock />
        <button type="button" className="ghost prologue-skip" onClick={onDone}>
          Далее
        </button>
      </div>

      <div
        className="prologue-stage has-art trail-intro-stage"
        style={{ backgroundImage: `url(${art})` }}
      >
        <div className="prologue-veil trail-intro-veil" />
        <div className="prologue-copy trail-intro-copy">
          <p className="prologue-eyebrow">{trail}</p>
          <h1 className="prologue-title">Поздравляем</h1>
          <p className="prologue-body">{body}</p>
          <div className="prologue-actions">
            <button type="button" className="primary large" onClick={onDone}>
              На карту
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
