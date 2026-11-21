import { useState } from "react";
import { PROLOGUE_SLIDES } from "../game/prologue";
import { MenuAudioDock } from "./MenuAudioDock";

type Props = {
  displayName: string;
  /** Повторный просмотр из настроек — не «первый раз». */
  rewatch?: boolean;
  onDone: () => void;
};

/**
 * Пролог после ника: кадры + текст.
 * Картинки подставишь в PROLOGUE_SLIDES.art — пока атмосфера и текст.
 */
export function PrologueScreen({ displayName, rewatch = false, onDone }: Props) {
  const [index, setIndex] = useState(0);
  const slide = PROLOGUE_SLIDES[index] ?? PROLOGUE_SLIDES[0];
  const last = index >= PROLOGUE_SLIDES.length - 1;
  const who = displayName.trim() || "Искатель";

  const finish = () => onDone();

  const next = () => {
    if (last) finish();
    else setIndex((i) => i + 1);
  };

  return (
    <div className="prologue-screen">
      <div className="prologue-top">
        <MenuAudioDock />
        <button type="button" className="ghost prologue-skip" onClick={finish}>
          Пропустить
        </button>
      </div>

      <div
        className={`prologue-stage${slide.art ? " has-art" : ""}`}
        style={
          slide.art
            ? { backgroundImage: `url(${slide.art})` }
            : undefined
        }
      >
        <div className="prologue-veil" />
        <div className="prologue-copy">
          {rewatch ? (
            <p className="prologue-eyebrow">Пролог</p>
          ) : (
            <p className="prologue-eyebrow">{who}</p>
          )}
          <h1 className="prologue-title">{slide.title}</h1>
          <p className="prologue-body">{slide.body}</p>
          <div className="prologue-actions">
            <button type="button" className="primary large" onClick={next}>
              {last ? (rewatch ? "Закрыть" : "К пути оракула") : "Дальше"}
            </button>
          </div>
          <p className="prologue-dots" aria-hidden>
            {PROLOGUE_SLIDES.map((_, i) => (
              <span
                key={i}
                className={`prologue-dot${i === index ? " is-on" : ""}`}
              />
            ))}
          </p>
        </div>
      </div>
    </div>
  );
}
