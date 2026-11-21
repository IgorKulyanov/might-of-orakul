import { useCallback, useEffect, useRef, useState } from "react";
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

type PanDrag = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
};

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
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<PanDrag | null>(null);
  const suppressClickRef = useRef(false);

  const clampPan = useCallback((x: number, y: number) => {
    const vp = viewportRef.current;
    const map = mapRef.current;
    if (!vp || !map) return { x, y };
    const minX = Math.min(0, vp.clientWidth - map.offsetWidth);
    const minY = Math.min(0, vp.clientHeight - map.offsetHeight);
    return {
      x: Math.max(minX, Math.min(0, x)),
      y: Math.max(minY, Math.min(0, y)),
    };
  }, []);

  const centerMap = useCallback(() => {
    const vp = viewportRef.current;
    const map = mapRef.current;
    if (!vp || !map) return;
    const minX = Math.min(0, vp.clientWidth - map.offsetWidth);
    const minY = Math.min(0, vp.clientHeight - map.offsetHeight);
    setPan({ x: minX / 2, y: minY / 2 });
  }, []);

  useEffect(() => {
    centerMap();
    const onResize = () => centerMap();
    window.addEventListener("resize", onResize);
    const map = mapRef.current;
    const img = map?.querySelector("img");
    img?.addEventListener("load", centerMap);
    return () => {
      window.removeEventListener("resize", onResize);
      img?.removeEventListener("load", centerMap);
    };
  }, [centerMap]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pan.x,
      originY: pan.y,
      moved: false,
    };
    suppressClickRef.current = false;
    viewportRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && dx * dx + dy * dy > 36) {
      d.moved = true;
      suppressClickRef.current = true;
    }
    if (d.moved) {
      setPan(clampPan(d.originX + dx, d.originY + dy));
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      viewportRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const openPreview = (next: Preview) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setPreview(next);
  };

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
        5×5 флажков. На телефоне карту можно двигать пальцем. ★ — выбор школы.
      </p>

      <div
        className="oracle-path-map-viewport"
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="oracle-path-map-wrap"
          ref={mapRef}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
        >
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
                  onClick={() =>
                    openPreview({ kind: "step", faction, stepIndex })
                  }
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
            onClick={() => openPreview({ kind: "finale" })}
          >
            <span className="oracle-path-flag-pole" aria-hidden />
            <span className="oracle-path-flag-cloth" aria-hidden>
              <em>★</em>
            </span>
          </button>
        </div>
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
