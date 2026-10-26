import { useLayoutEffect, useRef, useState } from "react";
import {
  HUB_TUTORIAL_TIPS,
  markHubTutorialSeen,
  type HubTutorialScreen,
} from "../game/hubTutorial";

type Spot = { top: number; left: number; width: number; height: number };

type Props = {
  step: number;
  onStep: (next: number | null) => void;
  onNavigate: (screen: HubTutorialScreen) => void;
};

export function HubTutorial({ step, onStep, onNavigate }: Props) {
  const tip = HUB_TUTORIAL_TIPS[step];
  const [spot, setSpot] = useState<Spot | null>(null);
  const navigateRef = useRef(onNavigate);
  navigateRef.current = onNavigate;

  useLayoutEffect(() => {
    if (!tip) {
      setSpot(null);
      return;
    }
    navigateRef.current(tip.screen);

    let cancelled = false;
    let tries = 0;

    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(
        `[data-tut="${tip.target}"]`,
      ) as HTMLElement | null;
      if (!el) {
        tries += 1;
        if (tries < 24) {
          window.setTimeout(measure, 50);
        } else {
          setSpot(null);
        }
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width < 2 && r.height < 2) {
        tries += 1;
        if (tries < 24) window.setTimeout(measure, 50);
        else setSpot(null);
        return;
      }
      const pad = 10;
      setSpot({
        top: r.top - pad,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      });
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    };

    const t = window.setTimeout(measure, 80);
    const raf = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [tip, step]);

  if (!tip) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(400, vw - 24);
  const cardH = 200;
  const gap = 28;
  let cardTop = vh / 2 - cardH / 2;
  let cardLeft = Math.max(12, (vw - cardW) / 2);
  let arrowDir: "up" | "down" | "left" | "right" | null = null;
  let arrowTop = 0;
  let arrowLeft = 0;

  if (spot) {
    const cx = spot.left + spot.width / 2;
    const cy = spot.top + spot.height / 2;
    const spaceBelow = vh - (spot.top + spot.height);
    const spaceAbove = spot.top;
    if (spaceBelow >= cardH + gap || spaceBelow >= spaceAbove) {
      cardTop = spot.top + spot.height + gap;
      arrowDir = "up";
      arrowTop = spot.top + spot.height + 6;
      arrowLeft = cx - 12;
    } else {
      cardTop = spot.top - gap - cardH;
      arrowDir = "down";
      arrowTop = spot.top - 28;
      arrowLeft = cx - 12;
    }
    cardLeft = Math.max(12, Math.min(cx - cardW / 2, vw - cardW - 12));
    cardTop = Math.max(12, Math.min(cardTop, vh - cardH - 12));
    void cy;
  }

  const finish = () => {
    markHubTutorialSeen();
    onStep(null);
  };

  return (
    <div
      className={`battle-tutorial${spot ? " battle-tutorial--guided" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="hub-tutorial-title"
    >
      {spot && (
        <div
          className="battle-tutorial-spot"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
          }}
        />
      )}
      {spot && arrowDir && (
        <div
          className={`battle-tutorial-arrow battle-tutorial-arrow--${arrowDir}`}
          style={{ top: arrowTop, left: arrowLeft }}
          aria-hidden
        />
      )}
      <div
        className="battle-tutorial-card"
        style={
          spot
            ? {
                position: "fixed",
                top: cardTop,
                left: cardLeft,
                width: cardW,
              }
            : undefined
        }
      >
        <div className="battle-tutorial-step">
          {step + 1} / {HUB_TUTORIAL_TIPS.length}
        </div>
        <h2 id="hub-tutorial-title">{tip.title}</h2>
        <p>{tip.body}</p>
        <div className="battle-tutorial-actions">
          <button type="button" className="ghost" onClick={finish}>
            Пропустить
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              const next = step + 1;
              if (next >= HUB_TUTORIAL_TIPS.length) finish();
              else onStep(next);
            }}
          >
            {step + 1 >= HUB_TUTORIAL_TIPS.length ? "Понятно" : "Далее"}
          </button>
        </div>
      </div>
    </div>
  );
}
