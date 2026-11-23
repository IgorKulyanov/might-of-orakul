import { useCallback, useEffect, useRef, useState } from "react";
import {
  SCHOOL_GRADUATION_FRAME,
  SCHOOL_GRADUATION_VIDEO,
  SCHOOL_TRAIL_FACTIONS,
  SCHOOL_TRAIL_GRAND_DIAMONDS,
  SCHOOL_TRAIL_GRAND_GOLD,
  SCHOOL_TRAIL_STEPS,
  allSchoolTrailsComplete,
  canPickSchool,
  clearSchoolTrailFlagLayout,
  defaultSchoolTrailFlagLayout,
  formatSchoolTrailFlagLayoutTs,
  loadSchoolTrailFlagLayout,
  saveSchoolTrailFlagLayout,
  rewardCardRole,
  schoolTrailCleared,
  schoolTrailDraft,
  schoolTrailFoeLine,
  schoolTrailRewardForClear,
  schoolTrailStep,
  schoolTrailTitle,
  type FlagXY,
  type SchoolTrailBeat,
  type SchoolTrailFlagLayout,
} from "../game/schoolTrails";
import { getCard } from "../game/cards";
import type { Faction, OwnedState } from "../game/types";
import { CardView } from "./CardView";
import { MenuAudioDock } from "./MenuAudioDock";

type Props = {
  owned: OwnedState;
  displayName: string;
  onPlayTrail: (faction: Faction, stepIndex: number) => void;
  onPickSchool: () => void;
  onBack?: () => void;
  asTutorial?: boolean;
  onSaveName?: (name: string) => void;
  /** Обязательная пауза после победы — пока не закроешь, бой не начать. */
  trailBeat?: SchoolTrailBeat | null;
  onDismissTrailBeat?: () => void;
  /** Временно: сбросить флажки троп для баланса/тестов. */
  onResetTrails?: () => void;
  /** Выдать гранд-награду за все 5 троп (один раз) и синк. */
  onClaimGrandReward?: () => void;
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

type PinchState = {
  startDist: number;
  startScale: number;
  startPanX: number;
  startPanY: number;
  midX: number;
  midY: number;
};

type FlagDragTarget =
  | { kind: "step"; faction: Faction; stepIndex: number }
  | { kind: "finale" };

type FlagDrag = FlagDragTarget & { pointerId: number };

const MAP_MIN_SCALE = 0.55;
const MAP_MAX_SCALE = 2.8;

function dist2(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function clampPct(n: number) {
  return Math.max(2, Math.min(98, Math.round(n * 10) / 10));
}

export function SchoolTrailsScreen({
  owned,
  displayName,
  onPlayTrail,
  onPickSchool,
  onBack,
  asTutorial = false,
  trailBeat = null,
  onDismissTrailBeat,
  onResetTrails,
  onClaimGrandReward,
}: Props) {
  const ready = canPickSchool(owned);
  const allDone = allSchoolTrailsComplete(owned);
  const grandClaimed = Boolean(owned.schoolTrailGrandRewardClaimed);
  /** 6-й флаг: сначала табличка, потом видео+рамка. */
  const [finaleShow, setFinaleShow] = useState<null | "plaque" | "video">(
    null,
  );
  const [videoEnded, setVideoEnded] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [editFlags, setEditFlags] = useState(
    () =>
      typeof window !== "undefined" &&
      window.location.hash === "#ora-flags",
  );
  const [layout, setLayout] = useState<SchoolTrailFlagLayout>(() =>
    loadSchoolTrailFlagLayout(),
  );
  const [copied, setCopied] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<PanDrag | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const flagDragRef = useRef<FlagDrag | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const panRef = useRef(pan);
  const scaleRef = useRef(scale);
  const layoutRef = useRef(layout);
  const suppressClickRef = useRef(false);
  panRef.current = pan;
  scaleRef.current = scale;
  layoutRef.current = layout;

  const clampPan = useCallback((x: number, y: number, s = scaleRef.current) => {
    const vp = viewportRef.current;
    const map = mapRef.current;
    if (!vp || !map) return { x, y };
    const w = map.offsetWidth * s;
    const h = map.offsetHeight * s;
    const minX = Math.min(0, vp.clientWidth - w);
    const minY = Math.min(0, vp.clientHeight - h);
    return {
      x: Math.max(minX, Math.min(0, x)),
      y: Math.max(minY, Math.min(0, y)),
    };
  }, []);

  const centerMap = useCallback(() => {
    const vp = viewportRef.current;
    const map = mapRef.current;
    if (!vp || !map) return;
    const s = scaleRef.current;
    const minX = Math.min(0, vp.clientWidth - map.offsetWidth * s);
    const minY = Math.min(0, vp.clientHeight - map.offsetHeight * s);
    setPan({ x: minX / 2, y: minY / 2 });
  }, []);

  useEffect(() => {
    centerMap();
    const onResize = () => centerMap();
    window.addEventListener("resize", onResize);
    const map = mapRef.current;
    const img = map?.querySelector("img");
    img?.addEventListener("load", centerMap);
    const onHash = () => {
      if (window.location.hash === "#ora-flags") setEditFlags(true);
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("resize", onResize);
      img?.removeEventListener("load", centerMap);
      window.removeEventListener("hashchange", onHash);
    };
  }, [centerMap]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const vp = el.getBoundingClientRect();
      const midX = e.clientX - vp.left;
      const midY = e.clientY - vp.top;
      const prev = scaleRef.current;
      const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      const nextScale = Math.min(
        MAP_MAX_SCALE,
        Math.max(MAP_MIN_SCALE, prev * factor),
      );
      const worldX = (midX - panRef.current.x) / prev;
      const worldY = (midY - panRef.current.y) / prev;
      const nextPan = clampPan(
        midX - worldX * nextScale,
        midY - worldY * nextScale,
        nextScale,
      );
      scaleRef.current = nextScale;
      panRef.current = nextPan;
      setScale(nextScale);
      setPan(nextPan);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [clampPan]);

  const persistLayout = (next: SchoolTrailFlagLayout) => {
    layoutRef.current = next;
    setLayout(next);
    saveSchoolTrailFlagLayout(next);
  };

  const clientToPct = (clientX: number, clientY: number): FlagXY => {
    const map = mapRef.current?.getBoundingClientRect();
    if (!map || map.width < 1 || map.height < 1) return { x: 50, y: 50 };
    return {
      x: clampPct(((clientX - map.left) / map.width) * 100),
      y: clampPct(((clientY - map.top) / map.height) * 100),
    };
  };

  const beginPinch = () => {
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return;
    const [a, b] = pts;
    const vp = viewportRef.current?.getBoundingClientRect();
    if (!vp) return;
    const midX = (a!.x + b!.x) / 2 - vp.left;
    const midY = (a!.y + b!.y) / 2 - vp.top;
    pinchRef.current = {
      startDist: Math.max(1, dist2(a!, b!)),
      startScale: scaleRef.current,
      startPanX: panRef.current.x,
      startPanY: panRef.current.y,
      midX,
      midY,
    };
    dragRef.current = null;
    flagDragRef.current = null;
    suppressClickRef.current = true;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (flagDragRef.current) return;
    // Тап по флажку — не панорамировать карту (иначе бой не открывается)
    const t = e.target as Element | null;
    if (t?.closest?.(".oracle-path-flag")) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    viewportRef.current?.setPointerCapture(e.pointerId);

    if (pointersRef.current.size >= 2) {
      beginPinch();
      return;
    }

    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: panRef.current.x,
      originY: panRef.current.y,
      moved: false,
    };
    suppressClickRef.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const fd = flagDragRef.current;
    if (fd && fd.pointerId === e.pointerId) {
      const pct = clientToPct(e.clientX, e.clientY);
      const cur = layoutRef.current;
      if (fd.kind === "finale") {
        persistLayout({ ...cur, finale: pct });
      } else {
        const list = cur.schools[fd.faction].map((p, i) =>
          i === fd.stepIndex ? pct : p,
        );
        persistLayout({
          ...cur,
          schools: { ...cur.schools, [fd.faction]: list },
        });
      }
      suppressClickRef.current = true;
      return;
    }

    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size >= 2) {
      if (!pinchRef.current) beginPinch();
      const pinch = pinchRef.current;
      const pts = [...pointersRef.current.values()];
      if (!pinch || pts.length < 2) return;
      const [a, b] = pts;
      const vp = viewportRef.current?.getBoundingClientRect();
      if (!vp) return;
      const midX = (a!.x + b!.x) / 2 - vp.left;
      const midY = (a!.y + b!.y) / 2 - vp.top;
      const ratio = Math.max(1, dist2(a!, b!)) / pinch.startDist;
      const nextScale = Math.min(
        MAP_MAX_SCALE,
        Math.max(MAP_MIN_SCALE, pinch.startScale * ratio),
      );
      const worldX = (pinch.midX - pinch.startPanX) / pinch.startScale;
      const worldY = (pinch.midY - pinch.startPanY) / pinch.startScale;
      const nextPan = clampPan(
        midX - worldX * nextScale,
        midY - worldY * nextScale,
        nextScale,
      );
      scaleRef.current = nextScale;
      panRef.current = nextPan;
      setScale(nextScale);
      setPan(nextPan);
      return;
    }

    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && dx * dx + dy * dy > 36) {
      d.moved = true;
      suppressClickRef.current = true;
    }
    if (d.moved) {
      const next = clampPan(d.originX + dx, d.originY + dy);
      panRef.current = next;
      setPan(next);
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    if (flagDragRef.current?.pointerId === e.pointerId) {
      flagDragRef.current = null;
    }
    pointersRef.current.delete(e.pointerId);
    try {
      viewportRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }

    if (pointersRef.current.size === 1) {
      const [id, pt] = [...pointersRef.current.entries()][0]!;
      dragRef.current = {
        pointerId: id,
        startX: pt.x,
        startY: pt.y,
        originX: panRef.current.x,
        originY: panRef.current.y,
        moved: true,
      };
      return;
    }

    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  };

  const applyFlagPct = (fd: FlagDrag, clientX: number, clientY: number) => {
    const pct = clientToPct(clientX, clientY);
    const cur = layoutRef.current;
    if (fd.kind === "finale") {
      persistLayout({ ...cur, finale: pct });
    } else {
      const list = cur.schools[fd.faction].map((p, i) =>
        i === fd.stepIndex ? pct : p,
      );
      persistLayout({
        ...cur,
        schools: { ...cur.schools, [fd.faction]: list },
      });
    }
  };

  const startFlagDrag = (e: React.PointerEvent, target: FlagDragTarget) => {
    e.stopPropagation();
    if (!editFlags) return;
    e.preventDefault();
    const pointerId = e.pointerId;
    const fd: FlagDrag = { ...target, pointerId };
    flagDragRef.current = fd;
    dragRef.current = null;
    pinchRef.current = null;
    pointersRef.current.clear();
    suppressClickRef.current = false;

    const originX = e.clientX;
    const originY = e.clientY;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - originX;
      const dy = ev.clientY - originY;
      if (!moved && dx * dx + dy * dy > 16) {
        moved = true;
        suppressClickRef.current = true;
      }
      if (moved) applyFlagPct(fd, ev.clientX, ev.clientY);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      flagDragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    applyFlagPct(fd, e.clientX, e.clientY);
  };

  const onFlagActivate = (next: Preview) => {
    if (editFlags || trailBeat) return;
    suppressClickRef.current = false;
    setPreview(next);
  };

  const copyLayout = async () => {
    const text = formatSchoolTrailFlagLayoutTs(layout);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Скопируй раскладку:", text);
    }
  };

  const resetLayout = () => {
    clearSchoolTrailFlagLayout();
    const fresh = defaultSchoolTrailFlagLayout();
    persistLayout(fresh);
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
    <div
      className={`school-trails-screen${asTutorial ? " is-tutorial" : ""}${editFlags ? " is-flag-edit" : ""}`}
    >
      <header className="page-bar">
        {onBack && !asTutorial ? (
          <button type="button" className="ghost" onClick={onBack}>
            ← Меню
          </button>
        ) : null}
        <h1>{asTutorial ? "Обучение · Путь оракула" : "Путь оракула"}</h1>
        <button
          type="button"
          className={`ghost school-trails-flag-edit-btn${editFlags ? " is-on" : ""}`}
          onClick={() => setEditFlags((v) => !v)}
          title="Расставить флажки на карте"
        >
          {editFlags ? "Готово" : "Флажки"}
        </button>
        {onResetTrails ? (
          <button
            type="button"
            className="ghost school-trails-reset-btn"
            title="Сбросить прогресс всех троп (флажки и мини-колоды)"
            onClick={() => {
              if (
                window.confirm(
                  "Сбросить все тропы? Флажки и мини-колоды обнулятся. Аккаунт и коллекция останутся.",
                )
              ) {
                onResetTrails();
                setPreview(null);
              }
            }}
          >
            Сброс троп
          </button>
        ) : null}
        <MenuAudioDock className="school-trails-audio" />
      </header>
      <p className="hint school-trails-hint">
        {editFlags
          ? "Режим расстановки: тяни флажки пальцем/мышью. Позиции пишутся сразу. «Код» — скопировать в schoolTrails.ts."
          : trailBeat
            ? "Сначала забери награду — следующий бой только после паузы."
            : `${displayName ? `${displayName}: ` : ""}Один флаг — один бой. Между боями пауза на карте. ★ — выбор школы.`}
      </p>

      {editFlags ? (
        <div className="school-trails-flag-edit-bar">
          <button type="button" className="ghost" onClick={copyLayout}>
            {copied ? "Скопировано" : "Код"}
          </button>
          <button type="button" className="ghost" onClick={resetLayout}>
            Сброс
          </button>
          <span className="hint">
            ★ {layout.finale.x}/{layout.finale.y}
          </span>
        </div>
      ) : null}

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
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          }}
        >
          <img
            className="oracle-path-map-art"
            src="/campaign-map.webp"
            alt="Карта Пути оракула"
            draggable={false}
          />

          {SCHOOL_TRAIL_FACTIONS.map((faction) => {
            const cleared = schoolTrailCleared(owned, faction);
            const positions = layout.schools[faction];
            return positions.map((pos, stepIndex) => {
              const done = stepIndex < cleared;
              const current =
                stepIndex === cleared && cleared < SCHOOL_TRAIL_STEPS;
              const locked = !editFlags && !done && !current;
              const cls = [
                "oracle-path-flag",
                `school-${faction}`,
                editFlags ? "is-editable" : "",
                done ? "is-cleared" : "",
                locked ? "is-locked" : "",
                !editFlags && (current || false) ? "is-current is-fightable" : "",
                editFlags ? "is-current" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={`${faction}-${stepIndex}`}
                  type="button"
                  className={cls}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  title={
                    editFlags
                      ? `${schoolTrailTitle(faction)} ${stepIndex + 1} · ${pos.x}/${pos.y}`
                      : `${schoolTrailTitle(faction)} · ${stepIndex + 1}/${SCHOOL_TRAIL_STEPS}`
                  }
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    startFlagDrag(e, {
                      kind: "step",
                      faction,
                      stepIndex,
                    });
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (editFlags) {
                      e.preventDefault();
                      return;
                    }
                    onFlagActivate({ kind: "step", faction, stepIndex });
                  }}
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
              editFlags ? "is-editable is-current" : "",
              !editFlags && allDone ? "is-current is-fightable" : "",
              !editFlags && !allDone ? "is-locked" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              left: `${layout.finale.x}%`,
              top: `${layout.finale.y}%`,
            }}
            title={
              editFlags
                ? `Флаг 6 · ${layout.finale.x}/${layout.finale.y}`
                : allDone
                  ? "Флаг 6 — награда за все 5 троп магии"
                  : "Флаг 6 откроется, когда пройдешь все 5 троп (5/5 каждая)"
            }
            onPointerDown={(e) => {
              e.stopPropagation();
              startFlagDrag(e, { kind: "finale" });
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (editFlags) {
                e.preventDefault();
                return;
              }
              if (!allDone) {
                onFlagActivate({ kind: "finale" });
                return;
              }
              setPreview(null);
              setVideoEnded(false);
              setFinaleShow("plaque");
            }}
          >
            <span className="oracle-path-flag-pole" aria-hidden />
            <span className="oracle-path-flag-cloth" aria-hidden>
              <em>6</em>
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
            ? allDone
              ? "Выбрать оракула — открыты все школы"
              : "Выбрать оракула пройденной школы"
            : "Сначала заверши хотя бы одну тропу (5/5)"}
        </button>
        <p className="hint school-trails-pick-warn">
          Оракула потом сменить нельзя. Доступны только школы, где тропа пройдена
          до конца.
        </p>
      </div>

      {trailBeat ? (
        <div
          className="overlay trail-beat-overlay"
          role="dialog"
          aria-label="Награда тропы"
        >
          <div className="trail-beat-panel">
            <p className="campaign-preview-eyebrow">
              {schoolTrailTitle(trailBeat.faction)} · пауза · флаг{" "}
              {trailBeat.newlyCleared}/{SCHOOL_TRAIL_STEPS}
            </p>
            <h2>
              {trailBeat.newlyCleared >= SCHOOL_TRAIL_STEPS
                ? `Школа «${schoolTrailTitle(trailBeat.faction)}» пройдена!`
                : trailBeat.rewardCardId
                  ? `Теперь у тебя «${cardName(trailBeat.rewardCardId)}»`
                  : `Флаг ${trailBeat.newlyCleared} взят`}
            </h2>
            {trailBeat.newlyCleared >= SCHOOL_TRAIL_STEPS ? (
              <p className="campaign-preview-story">
                Поздравляем с окончанием этой школы магии. Теперь можно выбрать
                оракула школы «{schoolTrailTitle(trailBeat.faction)}». Оракула
                потом сменить нельзя.
              </p>
            ) : null}
            {trailBeat.rewardCardId ? (
              <div className="trail-beat-card">
                <div className="trail-beat-card-view">
                  <CardView
                    cardId={trailBeat.rewardCardId}
                    compact
                    flippable={false}
                  />
                </div>
                <p className="hint">{rewardCardRole(trailBeat.newlyCleared)}</p>
                {(() => {
                  try {
                    return (
                      <p className="campaign-preview-story">
                        {getCard(trailBeat.rewardCardId!).text}
                      </p>
                    );
                  } catch {
                    return null;
                  }
                })()}
              </div>
            ) : (
              <p className="campaign-preview-story">
                {trailBeat.wowHint ||
                  "Рубеж пройден. Переведи дух — следующий флаг ждёт на карте."}
              </p>
            )}
            <p className="hint">
              Свергнут: {trailBeat.foeName}. Следующий бой — только когда сам
              откроешь следующий флажок.
            </p>
            <div className="campaign-preview-actions">
              <button
                type="button"
                className="primary large"
                onClick={() => onDismissTrailBeat?.()}
              >
                На карту — перевести дух
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {preview?.kind === "step" && previewStep && !trailBeat && (
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
            <p className="hint">
              Враг на столе: {schoolTrailFoeLine(previewStep)}
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
              <>
                {(() => {
                  const nextReward = schoolTrailRewardForClear(
                    preview.faction,
                    preview.stepIndex + 1,
                  );
                  const draft = schoolTrailDraft(owned, preview.faction);
                  return (
                    <>
                      {nextReward ? (
                        <p className="campaign-preview-outro">
                          <strong>После победы получишь:</strong> «
                          {cardName(nextReward.cardId)}» — будет в руке на
                          следующих боях этой тропы.
                        </p>
                      ) : (
                        <p className="hint">
                          Этот флаг без новой карты — но открывает финал тропы.
                        </p>
                      )}
                      {draft.length ? (
                        <p className="hint">
                          Уже в руке тропы:{" "}
                          {draft.map(cardName).join(" · ")}
                        </p>
                      ) : (
                        <p className="hint">
                          Пока только нейтралы. Победы наполняют руку школы.
                        </p>
                      )}
                      <p className="hint">
                        Накал: флаг {preview.stepIndex + 1}/
                        {SCHOOL_TRAIL_STEPS}
                        {preview.stepIndex === 0
                          ? " — разминка"
                          : preview.stepIndex === 2
                            ? " — витрина школы"
                            : preview.stepIndex >= 4
                              ? " — пик тропы"
                              : " — давление растёт"}
                      </p>
                    </>
                  );
                })()}
              </>
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

      {preview?.kind === "finale" && !trailBeat && !finaleShow && (
        <div
          className="overlay campaign-preview-overlay"
          onClick={() => setPreview(null)}
          role="presentation"
        >
          <div
            className="campaign-preview-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Флаг 6"
          >
            <p className="campaign-preview-eyebrow">Флаг 6</p>
            <h2>Все пять троп магии</h2>
            <p className="campaign-preview-story">
              {allDone
                ? "Пять школ пройдены. Здесь — награда за полный путь."
                : "Этот флаг откроется только когда все 5 троп будут пройдены до конца (5/5 каждая). Оракула пройденной школы можно выбрать кнопкой внизу раньше."}
            </p>
            <div className="campaign-preview-actions">
              {allDone ? (
                <button
                  type="button"
                  className="primary large"
                  onClick={() => {
                    setPreview(null);
                    setVideoEnded(false);
                    setFinaleShow("plaque");
                  }}
                >
                  Открыть награду
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

      {finaleShow === "plaque" && !trailBeat && (
        <div className="overlay campaign-preview-overlay" role="dialog">
          <div className="campaign-preview-panel school-grand-plaque">
            <p className="campaign-preview-eyebrow">Флаг 6</p>
            <h2>Награда за прохождение всех 5 троп магии!</h2>
            <p className="campaign-preview-story">
              {grandClaimed
                ? "Награда уже получена. Можно снова посмотреть церемонию или выбрать оракула."
                : `За полный путь школы: ${SCHOOL_TRAIL_GRAND_GOLD} золота и ${SCHOOL_TRAIL_GRAND_DIAMONDS} алмазов. Можно выбрать любого оракула из пяти школ.`}
            </p>
            <p className="hint school-trails-pick-warn">
              Внимание: выбранного оракула потом сменить нельзя.
            </p>
            <div className="campaign-preview-actions">
              <button
                type="button"
                className="primary large"
                onClick={() => {
                  if (!grandClaimed) onClaimGrandReward?.();
                  setVideoEnded(false);
                  setFinaleShow("video");
                }}
              >
                Смотреть
              </button>
              <button
                type="button"
                className="ghost large"
                onClick={() => setFinaleShow(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {finaleShow === "video" && !trailBeat && (
        <div className="overlay school-grad-overlay" role="dialog">
          <div className="school-grad-stage">
            <video
              className="school-grad-video"
              src={SCHOOL_GRADUATION_VIDEO}
              autoPlay
              playsInline
              onEnded={() => setVideoEnded(true)}
            />
            <img
              className="school-grad-frame"
              src={SCHOOL_GRADUATION_FRAME}
              alt=""
              draggable={false}
            />
            {videoEnded ? (
              <div className="school-grad-end">
                <p className="school-grad-title">Поздравляем</p>
                <p className="school-grad-body">
                  Вы прошли всю школу магии.
                  <br />
                  Ваша награда — {SCHOOL_TRAIL_GRAND_GOLD} золота и{" "}
                  {SCHOOL_TRAIL_GRAND_DIAMONDS} алмазов.
                  <br />
                  Вы можете выбрать любого оракула!
                </p>
                <button
                  type="button"
                  className="primary large school-grad-cta"
                  onClick={() => {
                    setFinaleShow(null);
                    onPickSchool();
                  }}
                >
                  Выбрать оракула
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="ghost school-grad-skip"
                onClick={() => setVideoEnded(true)}
              >
                Дальше
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
