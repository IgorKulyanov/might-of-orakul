import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

/** Прямоугольник в % от обложки книги (как выделение в Paint). */
export type BoxPct = { x: number; y: number; w: number; h: number };

export type BookLayout = {
  pageL: BoxPct;
  pageR: BoxPct;
  /** 6 закладок слева направо */
  ribbons: [BoxPct, BoxPct, BoxPct, BoxPct, BoxPct, BoxPct];
  /** Кнопки листания школы — ставишь сам */
  btnBack: BoxPct;
  btnFwd: BoxPct;
  coverW: number;
  /** Размер карт в книге (1 = обычно) */
  cardScale: number;
  /** Зазор сетки карт, rem */
  cardGap: number;
};

const RIBBON_LABELS = [
  "Смерть",
  "Ад",
  "Природа",
  "Жизнь",
  "Вода",
  "Нейтрал",
] as const;

const RIBBON_COLORS = [
  "#7b4bb8",
  "#c23b3b",
  "#3d9a4a",
  "#d4a017",
  "#3a7fd4",
  "#c0c4cc",
] as const;

export const DEFAULT_BOOK_LAYOUT: BookLayout = {
  pageL: { x: 11, y: 10, w: 37, h: 68 },
  pageR: { x: 52, y: 10, w: 37, h: 68 },
  ribbons: [
    { x: 25.0, y: 85, w: 6.5, h: 14 },
    { x: 32.2, y: 85, w: 6.5, h: 14 },
    { x: 39.4, y: 85, w: 6.5, h: 14 },
    { x: 52.0, y: 85, w: 6.5, h: 14 },
    { x: 59.2, y: 85, w: 6.5, h: 14 },
    { x: 66.4, y: 85, w: 6.5, h: 14 },
  ],
  btnBack: { x: 12, y: 78, w: 12, h: 5 },
  btnFwd: { x: 76, y: 78, w: 12, h: 5 },
  coverW: 4000,
  cardScale: 1,
  cardGap: 0.35,
};

const STORAGE_KEY = "orakul-book-layout-v4";
const MIN = 3;

type Mode = "pages" | "ribbons" | "cards" | "turn" | "cover";
type Handle =
  | "move"
  | "n"
  | "s"
  | "e"
  | "w"
  | "nw"
  | "ne"
  | "sw"
  | "se";

const BOX_HANDLES: Handle[] = [
  "move",
  "n",
  "s",
  "e",
  "w",
  "nw",
  "ne",
  "sw",
  "se",
];

type Target =
  | { kind: "pageL" }
  | { kind: "pageR" }
  | { kind: "ribbon"; index: number }
  | { kind: "btnBack" }
  | { kind: "btnFwd" }
  | { kind: "cover" };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function normalizeBox(b: BoxPct): BoxPct {
  let { x, y, w, h } = b;
  w = clamp(w, MIN, 100);
  h = clamp(h, MIN, 100);
  x = clamp(x, 0, 100 - MIN);
  y = clamp(y, 0, 100 - MIN);
  if (x + w > 100) w = 100 - x;
  if (y + h > 100) h = 100 - y;
  return { x: round1(x), y: round1(y), w: round1(w), h: round1(h) };
}

function applyHandle(
  box: BoxPct,
  handle: Handle,
  dx: number,
  dy: number,
): BoxPct {
  let { x, y, w, h } = box;
  if (handle === "move") {
    x += dx;
    y += dy;
    x = clamp(x, 0, 100 - w);
    y = clamp(y, 0, 100 - h);
    return normalizeBox({ x, y, w, h });
  }
  if (handle === "w" || handle === "nw" || handle === "sw") {
    const nx = x + dx;
    const nw = w - dx;
    if (nw >= MIN) {
      x = nx;
      w = nw;
    }
  }
  if (handle === "e" || handle === "ne" || handle === "se") {
    w += dx;
  }
  if (handle === "n" || handle === "nw" || handle === "ne") {
    const ny = y + dy;
    const nh = h - dy;
    if (nh >= MIN) {
      y = ny;
      h = nh;
    }
  }
  if (handle === "s" || handle === "sw" || handle === "se") {
    h += dy;
  }
  return normalizeBox({ x, y, w, h });
}

function isBoxPct(v: unknown): v is BoxPct {
  if (!v || typeof v !== "object") return false;
  const o = v as BoxPct;
  return [o.x, o.y, o.w, o.h].every((n) => typeof n === "number");
}

export function loadBookLayout(): BookLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_BOOK_LAYOUT);
    const parsed = JSON.parse(raw) as Partial<BookLayout>;
    const base = structuredClone(DEFAULT_BOOK_LAYOUT);
    if (isBoxPct(parsed.pageL)) base.pageL = normalizeBox(parsed.pageL);
    if (isBoxPct(parsed.pageR)) base.pageR = normalizeBox(parsed.pageR);
    if (Array.isArray(parsed.ribbons) && parsed.ribbons.length === 6) {
      base.ribbons = parsed.ribbons.map((r, i) =>
        isBoxPct(r) ? normalizeBox(r) : base.ribbons[i],
      ) as BookLayout["ribbons"];
    }
    if (typeof parsed.coverW === "number") {
      base.coverW = clamp(parsed.coverW, 800, 6000);
    }
    if (typeof parsed.cardScale === "number") {
      base.cardScale = clamp(parsed.cardScale, 0.45, 1.9);
    }
    if (typeof parsed.cardGap === "number") {
      base.cardGap = clamp(parsed.cardGap, 0.05, 1.2);
    }
    if (isBoxPct(parsed.btnBack)) base.btnBack = normalizeBox(parsed.btnBack);
    if (isBoxPct(parsed.btnFwd)) base.btnFwd = normalizeBox(parsed.btnFwd);
    return base;
  } catch {
    return structuredClone(DEFAULT_BOOK_LAYOUT);
  }
}

export function saveBookLayout(layout: BookLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}

export function bookLayoutToCssVars(layout: BookLayout): CSSProperties {
  const vars: Record<string, string> = {
    "--ob-cover-w": `${layout.coverW}px`,
    "--ob-page-l-x": `${layout.pageL.x}%`,
    "--ob-page-l-y": `${layout.pageL.y}%`,
    "--ob-page-l-w": `${layout.pageL.w}%`,
    "--ob-page-l-h": `${layout.pageL.h}%`,
    "--ob-page-r-x": `${layout.pageR.x}%`,
    "--ob-page-r-y": `${layout.pageR.y}%`,
    "--ob-page-r-w": `${layout.pageR.w}%`,
    "--ob-page-r-h": `${layout.pageR.h}%`,
    "--ob-card-scale": String(layout.cardScale),
    "--ob-card-gap": `${layout.cardGap}rem`,
  };
  layout.ribbons.forEach((r, i) => {
    vars[`--ob-rib-${i}-x`] = `${r.x}%`;
    vars[`--ob-rib-${i}-y`] = `${r.y}%`;
    vars[`--ob-rib-${i}-w`] = `${r.w}%`;
    vars[`--ob-rib-${i}-h`] = `${r.h}%`;
  });
  return vars as CSSProperties;
}

export function formatBookLayoutCss(layout: BookLayout): string {
  return JSON.stringify(layout, null, 2);
}

function ribbonButtonStyle(box: BoxPct, schoolColor: string): CSSProperties {
  return {
    left: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.w}%`,
    height: `${box.h}%`,
    ["--school" as string]: schoolColor,
  };
}

export function turnButtonStyle(box: BoxPct): CSSProperties {
  return {
    left: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.w}%`,
    height: `${box.h}%`,
  };
}

export { RIBBON_LABELS, ribbonButtonStyle };

type Props = {
  layout: BookLayout;
  onChange: (next: BookLayout) => void;
  onClose: () => void;
  coverRef: RefObject<HTMLDivElement | null>;
};

export function OracleBookCalibrate({
  layout,
  onChange,
  onClose,
  coverRef,
}: Props) {
  const [mode, setMode] = useState<Mode>("pages");
  const [focus, setFocus] = useState<Target>({ kind: "pageL" });
  const [copied, setCopied] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const dragRef = useRef<{
    target: Target;
    handle: Handle;
    startX: number;
    startY: number;
    start: BookLayout;
    coverW: number;
    coverH: number;
  } | null>(null);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = ((e.clientX - d.startX) / d.coverW) * 100;
      const dy = ((e.clientY - d.startY) / d.coverH) * 100;
      const s = structuredClone(d.start);

      if (d.target.kind === "cover") {
        onChange({
          ...s,
          coverW: clamp(Math.round(s.coverW + (e.clientX - d.startX) * 3), 800, 6000),
        });
        return;
      }
      if (d.target.kind === "pageL") {
        s.pageL = applyHandle(s.pageL, d.handle, dx, dy);
        onChange(s);
        return;
      }
      if (d.target.kind === "pageR") {
        s.pageR = applyHandle(s.pageR, d.handle, dx, dy);
        onChange(s);
        return;
      }
      if (d.target.kind === "btnBack") {
        s.btnBack = applyHandle(s.btnBack, d.handle, dx, dy);
        onChange(s);
        return;
      }
      if (d.target.kind === "btnFwd") {
        s.btnFwd = applyHandle(s.btnFwd, d.handle, dx, dy);
        onChange(s);
        return;
      }
      if (d.target.kind === "ribbon") {
        const i = d.target.index;
        s.ribbons[i] = applyHandle(s.ribbons[i], d.handle, dx, dy);
        onChange(s);
      }
    },
    [onChange],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [onPointerMove, endDrag]);

  const startDrag = (
    target: Target,
    handle: Handle,
    e: ReactPointerEvent<HTMLElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const el = coverRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setFocus(target);
    if (target.kind === "pageL" || target.kind === "pageR") setMode("pages");
    if (target.kind === "ribbon") setMode("ribbons");
    if (target.kind === "btnBack" || target.kind === "btnFwd") setMode("turn");
    if (target.kind === "cover") setMode("cover");
    dragRef.current = {
      target,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      start: structuredClone(layout),
      coverW: Math.max(1, rect.width),
      coverH: Math.max(1, rect.height),
    };
  };

  const copyCss = async () => {
    const text = formatBookLayoutCss(layout);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Скопируй:", text);
    }
  };

  const renderPaintBox = (
    target: Target,
    box: BoxPct,
    label: string,
    color: string,
    visible: boolean,
  ) => {
    const focused =
      (focus.kind === target.kind && target.kind !== "ribbon") ||
      (focus.kind === "ribbon" &&
        target.kind === "ribbon" &&
        focus.index === target.index);
    return (
      <div
        key={label}
        className={`ob-cal-box ${focused ? "is-active" : ""} ${visible ? "is-visible" : "is-dim"}`}
        style={{
          left: `${box.x}%`,
          top: `${box.y}%`,
          width: `${box.w}%`,
          height: `${box.h}%`,
          borderColor: color,
          background: `${color}33`,
          zIndex: focused ? 57 : visible ? 55 : 52,
        }}
      >
        <span className="ob-cal-label">{label}</span>
        {BOX_HANDLES.map((handle) => (
          <button
            key={handle}
            type="button"
            className={`ob-cal-handle is-${handle}`}
            aria-label={`${handle} ${label}`}
            onPointerDown={(e) => startDrag(target, handle, e)}
          />
        ))}
      </div>
    );
  };

  const pagesOn = mode === "pages" || mode === "cards";
  const ribsOn = mode === "ribbons";
  const turnOn = mode === "turn";

  return (
    <>
      <div className="ob-cal-hud" role="dialog" aria-label="Калибровка книги">
        <strong>Калибровка как в Paint</strong>
        <p>
          Страницы = 4+4 карты. Листы = кнопки НАЗАД/ВПЕРЕД. Закладки = школы.
          <br />
          <b>Готово</b> = у тебя в браузере. Для всех — <b>Копировать</b> мне в
          чат.
        </p>
        <div className="ob-cal-hud-row">
          <button
            type="button"
            className={mode === "pages" ? "primary" : "ghost"}
            onClick={() => {
              setMode("pages");
              setFocus({ kind: "pageL" });
            }}
          >
            Страницы
          </button>
          <button
            type="button"
            className={mode === "cards" ? "primary" : "ghost"}
            onClick={() => setMode("cards")}
          >
            Карты
          </button>
          <button
            type="button"
            className={mode === "turn" ? "primary" : "ghost"}
            onClick={() => {
              setMode("turn");
              setFocus({ kind: "btnBack" });
            }}
          >
            Листы
          </button>
          <button
            type="button"
            className={mode === "ribbons" ? "primary" : "ghost"}
            onClick={() => {
              setMode("ribbons");
              setFocus({ kind: "ribbon", index: 0 });
            }}
          >
            Закладки ×6
          </button>
          <button
            type="button"
            className={mode === "cover" ? "primary" : "ghost"}
            onClick={() => {
              setMode("cover");
              setFocus({ kind: "cover" });
            }}
          >
            Книга
          </button>
        </div>
        {mode === "ribbons" ? (
          <div className="ob-cal-hud-row ob-cal-rib-picks">
            {RIBBON_LABELS.map((name, i) => (
              <button
                key={name}
                type="button"
                className={
                  focus.kind === "ribbon" && focus.index === i
                    ? "primary"
                    : "ghost"
                }
                style={{ borderColor: RIBBON_COLORS[i] }}
                onClick={() => setFocus({ kind: "ribbon", index: i })}
              >
                {name}
              </button>
            ))}
          </div>
        ) : null}
        {mode === "cards" ? (
          <div className="ob-cal-cards-panel">
            <p>
              Позиция карт = зелёные страницы (подвинь страницу — карты поедут).
              Здесь крути <b>размер</b> и зазор — смотри на карты в книге сразу.
            </p>
            <label className="ob-cal-size">
              Размер карт {layout.cardScale.toFixed(2)}
              <input
                type="range"
                min={0.45}
                max={1.85}
                step={0.05}
                value={layout.cardScale}
                onChange={(e) =>
                  onChange({
                    ...layout,
                    cardScale: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="ob-cal-size">
              Зазор {layout.cardGap.toFixed(2)}
              <input
                type="range"
                min={0.05}
                max={1.1}
                step={0.05}
                value={layout.cardGap}
                onChange={(e) =>
                  onChange({
                    ...layout,
                    cardGap: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
        ) : null}
        {savedMsg ? <p className="ob-cal-saved">{savedMsg}</p> : null}
        <div className="ob-cal-hud-row">
          <button
            type="button"
            className="ghost"
            onClick={() => onChange(structuredClone(DEFAULT_BOOK_LAYOUT))}
          >
            Сброс
          </button>
          <button type="button" className="ghost" onClick={() => void copyCss()}>
            {copied ? "Скопировано ✓" : "Копировать для меня"}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              saveBookLayout(layout);
              setSavedMsg(
                "Сохранено в ЭТОМ браузере ✓. Для всех навсегда — «Копировать для меня» и вставь в чат.",
              );
              window.setTimeout(() => onClose(), 900);
            }}
          >
            Готово
          </button>
        </div>
      </div>

      {renderPaintBox(
        { kind: "pageL" },
        layout.pageL,
        "Левая стр.",
        "#3dcc7a",
        pagesOn,
      )}
      {renderPaintBox(
        { kind: "pageR" },
        layout.pageR,
        "Правая стр.",
        "#2aad66",
        pagesOn,
      )}

      {layout.ribbons.map((box, i) =>
        renderPaintBox(
          { kind: "ribbon", index: i },
          box,
          RIBBON_LABELS[i],
          RIBBON_COLORS[i],
          ribsOn,
        ),
      )}

      {renderPaintBox(
        { kind: "btnBack" },
        layout.btnBack,
        "НАЗАД",
        "#e8c547",
        turnOn,
      )}
      {renderPaintBox(
        { kind: "btnFwd" },
        layout.btnFwd,
        "ВПЕРЕД",
        "#e8a020",
        turnOn,
      )}

      <button
        type="button"
        className={`ob-cal-cover-corner ${mode === "cover" ? "is-active" : ""}`}
        title="Размер книги"
        aria-label="Растянуть книгу"
        onPointerDown={(e) => startDrag({ kind: "cover" }, "se", e)}
      />
    </>
  );
}
