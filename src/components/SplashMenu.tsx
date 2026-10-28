import { useEffect, useRef, useState } from "react";
import { AdminPanel } from "./AdminPanel";
import { CommunityPanel } from "./CommunityPanel";
import { OwnerBoostPanel } from "./OwnerBoostPanel";
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
import type { OwnedState } from "../game/types";

/**
 * Заставка + слайды (ASCII в путях).
 * Первый кадр — школы по кругу (оригинал). Новая «колонки» лежит в архиве:
 * /archive/splash-elements-desktop.jpg
 */
const SPLASH_SLIDES = [
  "/splash-elements-v2.jpg?v=7",
  "/splash-slides/valkyrie-hi.png?v=2",
  "/splash-slides/kraken-hi.png?v=2",
  "/splash-slides/vampire-hi.png?v=2",
  "/splash-slides/ent-hi.png?v=2",
  "/splash-slides/inferno-hi.png?v=2",
  "/splash-slides/triton-hi.png?v=2",
];

const SLIDE_MS = 7000;

type Panel = "root" | "solo";

type Props = {
  onSolo: () => void;
  onArena: () => void;
  onMulti: () => void;
  onCabinet: () => void;
  onCollection: () => void;
  onDailies: () => void;
  onDev?: () => void;
  /** Секрет: 7 кликов по названию игры включает тест-меню. */
  onEnableDev?: () => void;
  showDev?: boolean;
  onLogout: () => void;
  heroName: string;
  displayName: string;
  gold?: number;
  diamonds?: number;
  owned: OwnedState;
  onOwnedChange: (next: OwnedState) => void;
};

export function SplashMenu({
  onSolo,
  onArena,
  onMulti,
  onCabinet,
  onCollection,
  onDailies,
  onDev,
  onEnableDev,
  showDev,
  onLogout,
  heroName,
  displayName,
  gold = 0,
  diamonds = 0,
  owned,
  onOwnedChange,
}: Props) {
  const [index, setIndex] = useState(0);
  const [panel, setPanel] = useState<Panel>("root");
  const brandClicks = useRef(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
  const [musicOff, setMusicOff] = useState(() => isMusicMuted());
  const [sfxOff, setSfxOff] = useState(() => isSfxMuted());
  const [musicVol, setMusicVol] = useState(() => getMusicVolume());
  const [sfxVol, setSfxVol] = useState(() => getSfxVolume());
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % SPLASH_SLIDES.length);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, []);

  /** Админка без кнопки в UI: только секретный hash #ora-admin + ключ сервера. */
  useEffect(() => {
    const syncAdminHash = () => {
      if (window.location.hash === "#ora-admin") setAdminOpen(true);
    };
    syncAdminHash();
    window.addEventListener("hashchange", syncAdminHash);
    return () => window.removeEventListener("hashchange", syncAdminHash);
  }, []);

  useEffect(() => {
    unlockSfx();
    void startMenuMusic();
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDoc = (e: PointerEvent) => {
      const el = settingsRef.current;
      if (el && !el.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [settingsOpen]);

  return (
    <div className="splash">
      <div className="splash-stage" aria-hidden>
        {SPLASH_SLIDES.map((src, i) => (
          <div
            key={src}
            className={`splash-slide is-portrait ${i === index ? "is-on" : ""}`}
            style={{ backgroundImage: `url("${src}")` }}
          />
        ))}
        <div className="splash-veil" />
        <div className="splash-embers" />
      </div>

      <div className="splash-top-right">
        <div className="splash-wallet" data-tut="hub-wallet" title="Кошелёк">
          <span className="wallet-chip gold">зол. {gold}</span>
          <span className="wallet-chip dia">💎 {diamonds}</span>
        </div>
        <button
          type="button"
          className="splash-logout ghost"
          title="Чат и письмо разработчику"
          onClick={() => setCommunityOpen(true)}
        >
          Чат
        </button>
        <div className="splash-settings" ref={settingsRef}>
          <button
            type="button"
            className="splash-gear ghost"
            title="Настройки"
            aria-label="Настройки"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            ⚙
          </button>
          {settingsOpen ? (
            <div className="splash-settings-panel" role="menu">
              <div className="splash-audio-row">
                <button
                  type="button"
                  className={`splash-audio-btn ghost ${musicOff ? "is-off" : ""}`}
                  role="menuitem"
                  title={musicOff ? "Включить музыку" : "Выключить музыку"}
                  onPointerDown={(e) => e.stopPropagation()}
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
                  onPointerDown={(e) => e.stopPropagation()}
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
                  onPointerDown={(e) => e.stopPropagation()}
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
        <button type="button" className="splash-logout ghost" onClick={onLogout}>
          Выйти
        </button>
      </div>

      <div className="splash-content">
        <p className="splash-eyebrow">
          <span>Карточные дуэли</span>
        </p>
        <h1
          className="splash-brand"
          onClick={() => {
            if (showDev || !onEnableDev) return;
            brandClicks.current += 1;
            if (brandClicks.current >= 7) {
              brandClicks.current = 0;
              onEnableDev();
            }
          }}
        >
          Might of Orakul
        </h1>
        <p className="splash-tag">
          <strong>{displayName}</strong>
          {" · оракул "}
          {heroName}
        </p>
        <div className="splash-actions" data-panel={panel}>
          {panel === "root" ? (
            <>
              <button type="button" className="primary large" onClick={onMulti}>
                Дуэль · найти соперника
              </button>
              <button
                type="button"
                className="ghost large"
                onClick={() => setPanel("solo")}
              >
                Одиночная кампания
              </button>
              <button
                type="button"
                className="ghost large"
                data-tut="hub-cabinet"
                onClick={onCabinet}
              >
                Личный кабинет
              </button>
              <button
                type="button"
                className="ghost large"
                data-tut="hub-shop"
                onClick={onCollection}
              >
                Магазин / колода
              </button>
              <button
                type="button"
                className="ghost large"
                data-tut="hub-dailies"
                onClick={onDailies}
              >
                Ежедневные задания
              </button>
              {showDev && onDev ? (
                <button type="button" className="ghost large" onClick={onDev}>
                  🧪 Тест оракулов
                </button>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                className="ghost large splash-back"
                onClick={() => setPanel("root")}
              >
                ← Назад
              </button>
              <button type="button" className="primary large" onClick={onSolo}>
                Тропа испытаний
              </button>
              <button type="button" className="ghost large" onClick={onArena}>
                Арена · 5 боёв дня
              </button>
              <p className="splash-subhint">
                Тропа — длинная карта на день. Арена — короткие 5 боёв: каждый
                добавляет правило, проигрыш обрывает забег до завтра.
              </p>
            </>
          )}
        </div>
        <div className="splash-dots" aria-hidden>
          {SPLASH_SLIDES.map((_, i) => (
            <span key={i} className={i === index ? "on" : ""} />
          ))}
        </div>
      </div>

      <CommunityPanel
        open={communityOpen}
        onClose={() => setCommunityOpen(false)}
        screenHint="menu"
        onOwnerBoostCode={() => setBoostOpen(true)}
      />
      <OwnerBoostPanel
        open={boostOpen}
        owned={owned}
        onApply={onOwnedChange}
        onClose={() => setBoostOpen(false)}
      />
      <AdminPanel
        open={adminOpen}
        onClose={() => {
          setAdminOpen(false);
          if (window.location.hash === "#ora-admin") {
            history.replaceState(
              null,
              "",
              `${window.location.pathname}${window.location.search}`,
            );
          }
        }}
      />
    </div>
  );
}
