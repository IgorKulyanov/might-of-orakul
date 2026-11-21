import { useEffect, useRef, useState } from "react";
import {
  getMusicVolume,
  getSfxVolume,
  isMusicMuted,
  isSfxMuted,
  setMusicMuted,
  setMusicVolume,
  setSfxMuted,
  setSfxVolume,
  startMenuMusic,
  unlockSfx,
} from "../game/sfx";

type Props = {
  /** Стартовать меню-музыку при монтировании. */
  autoMusic?: boolean;
  className?: string;
};

/** Компактные настройки звука для экранов вне хаба (пролог, тропы). */
export function MenuAudioDock({ autoMusic = true, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [musicOff, setMusicOff] = useState(() => isMusicMuted());
  const [sfxOff, setSfxOff] = useState(() => isSfxMuted());
  const [musicVol, setMusicVol] = useState(() => getMusicVolume());
  const [sfxVol, setSfxVol] = useState(() => getSfxVolume());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoMusic) return;
    unlockSfx();
    if (!isMusicMuted()) void startMenuMusic();
  }, [autoMusic]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={`menu-audio-dock splash-settings ${className}`.trim()} ref={ref}>
      <button
        type="button"
        className="splash-gear ghost"
        title="Звук"
        aria-label="Звук"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ⚙
      </button>
      {open ? (
        <div className="splash-settings-panel" role="menu">
          <div className="splash-audio-row">
            <button
              type="button"
              className={`splash-audio-btn ghost ${musicOff ? "is-off" : ""}`}
              role="menuitem"
              title={musicOff ? "Включить музыку" : "Выключить музыку"}
              onClick={(e) => {
                e.stopPropagation();
                const next = !musicOff;
                setMusicOff(next);
                setMusicMuted(next);
                if (!next) {
                  unlockSfx();
                  void startMenuMusic();
                }
              }}
            >
              <span className="splash-audio-ico" aria-hidden>
                {musicOff ? "🔇" : "🎵"}
              </span>
              <span>Музыка</span>
            </button>
            <input
              type="range"
              className="splash-vol"
              min={0}
              max={100}
              value={Math.round(musicVol * 100)}
              aria-label="Громкость музыки"
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                setMusicVol(v);
                setMusicVolume(v);
                if (v > 0 && musicOff) {
                  setMusicOff(false);
                  setMusicMuted(false);
                  unlockSfx();
                  void startMenuMusic();
                }
              }}
            />
          </div>
          <div className="splash-audio-row">
            <button
              type="button"
              className={`splash-audio-btn ghost ${sfxOff ? "is-off" : ""}`}
              role="menuitem"
              title={sfxOff ? "Включить звуки" : "Выключить звуки"}
              onClick={(e) => {
                e.stopPropagation();
                const next = !sfxOff;
                setSfxOff(next);
                setSfxMuted(next);
              }}
            >
              <span className="splash-audio-ico" aria-hidden>
                {sfxOff ? "🔇" : "🔊"}
              </span>
              <span>Звуки</span>
            </button>
            <input
              type="range"
              className="splash-vol"
              min={0}
              max={100}
              value={Math.round(sfxVol * 100)}
              aria-label="Громкость звуков"
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                setSfxVol(v);
                setSfxVolume(v);
                if (v > 0 && sfxOff) {
                  setSfxOff(false);
                  setSfxMuted(false);
                }
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
