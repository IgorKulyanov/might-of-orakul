import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

/** Прямоугольник в % от обложки книги. */
export type BoxPct = { x: number; y: number; w: number; h: number };

export type BookLayout = {
  /** 8 слотов разворота: 0–3 левая стр., 4–7 правая */
  slots: [
    BoxPct,
    BoxPct,
    BoxPct,
    BoxPct,
    BoxPct,
    BoxPct,
    BoxPct,
    BoxPct,
  ];
  ribbons: [BoxPct, BoxPct, BoxPct, BoxPct, BoxPct, BoxPct];
  btnBack: BoxPct;
  btnFwd: BoxPct;
  coverW: number;
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

/** Запечённая сетка с калибровки (Paint). */
function defaultSlots(): BookLayout["slots"] {
  return [
    { x: 18.5, y: 12.6, w: 19.1, h: 33.2 },
    { x: 32.9, y: 12.6, w: 19.2, h: 33.2 },
    { x: 18.6, y: 45.6, w: 19.1, h: 32.6 },
    { x: 33.0, y: 45.6, w: 19.0, h: 32.6 },
    { x: 48.6, y: 12.6, w: 19.1, h: 33.3 },
    { x: 61.9, y: 12.7, w: 19.4, h: 33.3 },
    { x: 48.6, y: 45.7, w: 19.0, h: 32.4 },
    { x: 61.9, y: 45.8, w: 19.4, h: 32.5 },
  ];
}

export const DEFAULT_BOOK_LAYOUT: BookLayout = {
  slots: defaultSlots(),
  ribbons: [
    { x: 26.0, y: 79.9, w: 6.2, h: 18.1 },
    { x: 33.8, y: 79.9, w: 6.2, h: 18.1 },
    { x: 41.7, y: 79.9, w: 6.2, h: 18.2 },
    { x: 51.5, y: 79.7, w: 6.2, h: 18.7 },
    { x: 59.5, y: 79.8, w: 6.2, h: 18.5 },
    { x: 67.4, y: 79.8, w: 6.2, h: 18.6 },
  ],
  btnBack: { x: 7.8, y: 73.9, w: 16.0, h: 15.4 },
  btnFwd: { x: 75.1, y: 76.3, w: 16.1, h: 15.3 },
  coverW: 4000,
};

const STORAGE_KEY = "orakul-book-layout-v10";
const MIN = 2.5;

type Mode = "cards" | "ribbons" | "turn" | "cover";
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
  | { kind: "slot"; index: number }
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

function hasW(h: Handle) {
  return h === "w" || h === "nw" || h === "sw";
}
function hasE(h: Handle) {
  return h === "e" || h === "ne" || h === "se";
}
function hasN(h: Handle) {
  return h === "n" || h === "nw" || h === "ne";
}
function hasS(h: Handle) {
  return h === "s" || h === "sw" || h === "se";
}

function applyHandle(
  box: BoxPct,
  handle: Handle,
  dx: number,
  dy: number,
): BoxPct {
  let { x, y, w, h } = box;
  if (handle === "move") {
    x = clamp(x + dx, 0, 100 - w);
    y = clamp(y + dy, 0, 100 - h);
    return normalizeBox({ x, y, w, h });
  }
  if (hasW(handle)) {
    const nx = x + dx;
    const nw = w - dx;
    if (nw >= MIN) {
      x = nx;
      w = nw;
    }
  }
  if (hasE(handle)) w += dx;
  if (hasN(handle)) {
    const ny = y + dy;
    const nh = h - dy;
    if (nh >= MIN) {
      y = ny;
      h = nh;
    }
  }
  if (hasS(handle)) h += dy;
  return normalizeBox({ x, y, w, h });
}

function isBoxPct(v: unknown): v is BoxPct {
  if (!v || typeof v !== "object") return false;
  const o = v as BoxPct;
  return [o.x, o.y, o.w, o.h].every((n) => typeof n === "number");
}

export function loadBookLayout(): BookLayout {
  try {
    for (const k of [
      "orakul-book-layout-v1",
      "orakul-book-layout-v2",
      "orakul-book-layout-v3",
      "orakul-book-layout-v4",
      "orakul-book-layout-v5",
      "orakul-book-layout-v6",
      "orakul-book-layout-v7",
      "orakul-book-layout-v8",
      "orakul-book-layout-v9",
    ]) {
      localStorage.removeItem(k);
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_BOOK_LAYOUT);
    const parsed = JSON.parse(raw) as Partial<BookLayout>;
    const base = structuredClone(DEFAULT_BOOK_LAYOUT);
    if (Array.isArray(parsed.slots) && parsed.slots.length === 8) {
      base.slots = parsed.slots.map((s, i) =>
        isBoxPct(s) ? normalizeBox(s) : base.slots[i],
      ) as BookLayout["slots"];
    }
    if (Array.isArray(parsed.ribbons) && parsed.ribbons.length === 6) {
      base.ribbons = parsed.ribbons.map((r, i) =>
        isBoxPct(r) ? normalizeBox(r) : base.ribbons[i],
      ) as BookLayout["ribbons"];
    }
    if (isBoxPct(parsed.btnBack)) base.btnBack = normalizeBox(parsed.btnBack);
    if (isBoxPct(parsed.btnFwd)) base.btnFwd = normalizeBox(parsed.btnFwd);
    if (typeof parsed.coverW === "number") {
      base.coverW = clamp(parsed.coverW, 800, 6000);
    }
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
  return {
    ["--ob-cover-w" as string]: `${layout.coverW}px`,
  };
}

export function formatBookLayoutCss(layout: BookLayout): string {
  return JSON.stringify(layout, null, 2);
}

export function ribbonButtonStyle(box: BoxPct, schoolColor: string): CSSProperties {
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

export function slotBoxStyle(box: BoxPct): CSSProperties {
  return {
    left: `${box.x}%`,
    top: `${box.y}%`,
    width: `${box.w}%`,
    height: `${box.h}%`,
  };
}

export { RIBBON_LABELS };

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
  const [mode, setMode] = useState<Mode>("cards");
  const [focus, setFocus] = useState<Target>({ kind: "slot", index: 0 });
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
          coverW: clamp(
            Math.round(s.coverW + (e.clientX - d.startX) * 3),
            800,
            6000,
          ),
        });
        return;
      }
      if (d.target.kind === "slot") {
        s.slots[d.target.index] = applyHandle(
          s.slots[d.target.index],
          d.handle,
          dx,
          dy,
        );
        onChange(s);
        return;
      }
      if (d.target.kind === "ribbon") {
        s.ribbons[d.target.index] = applyHandle(
          s.ribbons[d.target.index],
          d.handle,
          dx,
          dy,
        );
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
    if (target.kind === "slot") setMode("cards");
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
      focus.kind === target.kind &&
      (target.kind !== "slot" && target.kind !== "ribbon"
        ? true
        : focus.kind === "slot" && target.kind === "slot"
          ? focus.index === target.index
          : focus.kind === "ribbon" && target.kind === "ribbon"
            ? focus.index === target.index
            : true);
    const key =
      target.kind === "slot" || target.kind === "ribbon"
        ? `${target.kind}-${target.index}`
        : target.kind;
    return (
      <div
        key={key}
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

  const cardsOn = mode === "cards";
  const ribsOn = mode === "ribbons";
  const turnOn = mode === "turn";

  return (
    <>
      <div className="ob-cal-hud" role="dialog" aria-label="Калибровка книги">
        <strong>Сам как в Paint</strong>
        <p>
          <b>Карты</b> — двигай/тяни каждую (рамка едет с ней).{" "}
          <b>Листы</b> — НАЗАД/ВПЕРЕД куда хочешь. <b>Готово</b> = у тебя в
          браузере. Для всех — «Копировать» мне в чат.
        </p>
        <div className="ob-cal-hud-row">
          <button
            type="button"
            className={mode === "cards" ? "primary" : "ghost"}
            onClick={() => {
              setMode("cards");
              setFocus({ kind: "slot", index: 0 });
            }}
          >
            Карты ×8
          </button>
          <button
            type="button"
            className={mode === "turn" ? "primary" : "ghost"}
            onClick={() => {
              setMode("turn");
              setFocus({ kind: "btnBack" });
            }}
          >
            НАЗАД/ВПЕРЕД
          </button>
          <button
            type="button"
            className={mode === "ribbons" ? "primary" : "ghost"}
            onClick={() => {
              setMode("ribbons");
              setFocus({ kind: "ribbon", index: 0 });
            }}
          >
            Закладки
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
        {mode === "cards" ? (
          <div className="ob-cal-hud-row ob-cal-rib-picks">
            {layout.slots.map((_, i) => (
              <button
                key={i}
                type="button"
                className={
                  focus.kind === "slot" && focus.index === i ? "primary" : "ghost"
                }
                onClick={() => setFocus({ kind: "slot", index: i })}
              >
                {i < 4 ? `Л${i + 1}` : `П${i - 3}`}
              </button>
            ))}
            <button
              type="button"
              className="ghost"
              onClick={() =>
                onChange({
                  ...layout,
                  slots: defaultSlots(),
                })
              }
            >
              Сетка 4+4
            </button>
          </div>
        ) : null}
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
        {savedMsg ? <p className="ob-cal-saved">{savedMsg}</p> : null}
        <div className="ob-cal-hud-row">
          <button
            type="button"
            className="ghost"
            onClick={() => onChange(structuredClone(DEFAULT_BOOK_LAYOUT))}
          >
            Сброс всего
          </button>
          <button type="button" className="ghost" onClick={() => void copyCss()}>
            {copied ? "Скопировано ✓" : "Копировать для меня"}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              saveBookLayout(layout);
              setSavedMsg("Сохранено в этом браузере ✓");
              window.setTimeout(() => onClose(), 700);
            }}
          >
            Готово / сохранить
          </button>
        </div>
      </div>

      {layout.slots.map((box, i) =>
        renderPaintBox(
          { kind: "slot", index: i },
          box,
          i < 4 ? `Карта Л${i + 1}` : `Карта П${i - 3}`,
          i < 4 ? "#3dcc7a" : "#2aad66",
          cardsOn,
        ),
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
