import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

export type BookLayout = {
  spreadL: number;
  spreadR: number;
  spreadT: number;
  spreadB: number;
  ribbonsL: number;
  ribbonsR: number;
  ribbonsB: number;
  ribbonsH: number;
  coverW: number;
};

export const DEFAULT_BOOK_LAYOUT: BookLayout = {
  spreadL: 11.5,
  spreadR: 11.5,
  spreadT: 11,
  spreadB: 19,
  ribbonsL: 24.5,
  ribbonsR: 26.5,
  ribbonsB: 0.5,
  ribbonsH: 14.8,
  coverW: 1380,
};

const STORAGE_KEY = "orakul-book-layout-v1";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function loadBookLayout(): BookLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BOOK_LAYOUT };
    const parsed = JSON.parse(raw) as Partial<BookLayout>;
    return { ...DEFAULT_BOOK_LAYOUT, ...parsed };
  } catch {
    return { ...DEFAULT_BOOK_LAYOUT };
  }
}

export function saveBookLayout(layout: BookLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* ignore quota */
  }
}

export function bookLayoutToCssVars(layout: BookLayout): CSSProperties {
  return {
    ["--ob-spread-l" as string]: `${layout.spreadL}%`,
    ["--ob-spread-r" as string]: `${layout.spreadR}%`,
    ["--ob-spread-t" as string]: `${layout.spreadT}%`,
    ["--ob-spread-b" as string]: `${layout.spreadB}%`,
    ["--ob-ribbons-l" as string]: `${layout.ribbonsL}%`,
    ["--ob-ribbons-r" as string]: `${layout.ribbonsR}%`,
    ["--ob-ribbons-b" as string]: `${layout.ribbonsB}%`,
    ["--ob-ribbons-h" as string]: `${layout.ribbonsH}%`,
    ["--ob-cover-w" as string]: `${layout.coverW}px`,
  };
}

export function formatBookLayoutCss(layout: BookLayout): string {
  return [
    `--ob-spread-l: ${layout.spreadL}%;`,
    `--ob-spread-r: ${layout.spreadR}%;`,
    `--ob-spread-t: ${layout.spreadT}%;`,
    `--ob-spread-b: ${layout.spreadB}%;`,
    `--ob-ribbons-l: ${layout.ribbonsL}%;`,
    `--ob-ribbons-r: ${layout.ribbonsR}%;`,
    `--ob-ribbons-b: ${layout.ribbonsB}%;`,
    `--ob-ribbons-h: ${layout.ribbonsH}%;`,
    `--ob-cover-w: ${layout.coverW}px;`,
  ].join("\n");
}

type BoxKind = "spread" | "ribbons";
type Edge = "n" | "s" | "e" | "w" | "move";

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
  const [active, setActive] = useState<BoxKind>("spread");
  const [copied, setCopied] = useState(false);
  const dragRef = useRef<{
    kind: BoxKind;
    edge: Edge;
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
      const dxPct = ((e.clientX - d.startX) / d.coverW) * 100;
      const dyPct = ((e.clientY - d.startY) / d.coverH) * 100;
      const s = d.start;
      let next = { ...s };

      if (d.kind === "spread") {
        if (d.edge === "w" || d.edge === "move") {
          next.spreadL = clamp(round1(s.spreadL + dxPct), 0, 40);
        }
        if (d.edge === "e" || d.edge === "move") {
          next.spreadR = clamp(round1(s.spreadR - dxPct), 0, 40);
        }
        if (d.edge === "n" || d.edge === "move") {
          next.spreadT = clamp(round1(s.spreadT + dyPct), 0, 40);
        }
        if (d.edge === "s" || d.edge === "move") {
          next.spreadB = clamp(round1(s.spreadB - dyPct), 5, 45);
        }
        // keep min inner size
        if (next.spreadL + next.spreadR > 85) {
          if (d.edge === "w") next.spreadL = 85 - next.spreadR;
          if (d.edge === "e") next.spreadR = 85 - next.spreadL;
        }
        if (next.spreadT + next.spreadB > 85) {
          if (d.edge === "n") next.spreadT = 85 - next.spreadB;
          if (d.edge === "s") next.spreadB = 85 - next.spreadT;
        }
      } else {
        if (d.edge === "w" || d.edge === "move") {
          next.ribbonsL = clamp(round1(s.ribbonsL + dxPct), 0, 45);
        }
        if (d.edge === "e" || d.edge === "move") {
          next.ribbonsR = clamp(round1(s.ribbonsR - dxPct), 0, 45);
        }
        if (d.edge === "s" || d.edge === "move") {
          next.ribbonsB = clamp(round1(s.ribbonsB - dyPct), 0, 20);
        }
        if (d.edge === "n") {
          // top edge of ribbons = bottom + height from bottom of cover
          // moving north changes height
          next.ribbonsH = clamp(round1(s.ribbonsH - dyPct), 6, 28);
        }
        if (d.edge === "move") {
          // vertical move: shift bottom, keep height
          next.ribbonsB = clamp(round1(s.ribbonsB - dyPct), 0, 20);
        }
        if (next.ribbonsL + next.ribbonsR > 90) {
          if (d.edge === "w") next.ribbonsL = 90 - next.ribbonsR;
          if (d.edge === "e") next.ribbonsR = 90 - next.ribbonsL;
        }
      }
      onChange(next);
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
    kind: BoxKind,
    edge: Edge,
    e: ReactPointerEvent<HTMLElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const el = coverRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setActive(kind);
    dragRef.current = {
      kind,
      edge,
      startX: e.clientX,
      startY: e.clientY,
      start: { ...layout },
      coverW: Math.max(1, rect.width),
      coverH: Math.max(1, rect.height),
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const copyCss = async () => {
    const text = formatBookLayoutCss(layout);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("Скопируй цифры:", text);
    }
  };

  const spreadStyle: CSSProperties = {
    left: `${layout.spreadL}%`,
    right: `${layout.spreadR}%`,
    top: `${layout.spreadT}%`,
    bottom: `${layout.spreadB}%`,
  };
  const ribbonsStyle: CSSProperties = {
    left: `${layout.ribbonsL}%`,
    right: `${layout.ribbonsR}%`,
    bottom: `${layout.ribbonsB}%`,
    height: `${layout.ribbonsH}%`,
  };

  return (
    <>
      <div className="ob-cal-hud" role="dialog" aria-label="Калибровка книги">
        <strong>Калибровка мышкой</strong>
        <p>
          Зелёная рамка = карты на страницах. Фиолетовая = закладки школ.
          Тяни за края или середину.
        </p>
        <div className="ob-cal-hud-row">
          <button
            type="button"
            className={active === "spread" ? "primary" : "ghost"}
            onClick={() => setActive("spread")}
          >
            Карты
          </button>
          <button
            type="button"
            className={active === "ribbons" ? "primary" : "ghost"}
            onClick={() => setActive("ribbons")}
          >
            Закладки
          </button>
          <label className="ob-cal-size">
            Книга
            <input
              type="range"
              min={720}
              max={1600}
              step={10}
              value={layout.coverW}
              onChange={(e) =>
                onChange({ ...layout, coverW: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <div className="ob-cal-hud-row">
          <button
            type="button"
            className="ghost"
            onClick={() => onChange({ ...DEFAULT_BOOK_LAYOUT })}
          >
            Сброс
          </button>
          <button type="button" className="ghost" onClick={() => void copyCss()}>
            {copied ? "Скопировано" : "Копировать цифры"}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              saveBookLayout(layout);
              onClose();
            }}
          >
            Готово
          </button>
        </div>
      </div>

      <div
        className={`ob-cal-box is-spread ${active === "spread" ? "is-active" : ""}`}
        style={spreadStyle}
        onPointerDown={(e) => startDrag("spread", "move", e)}
      >
        <span className="ob-cal-label">Карты</span>
        {(["n", "s", "e", "w"] as Edge[]).map((edge) => (
          <i
            key={edge}
            className={`ob-cal-handle is-${edge}`}
            onPointerDown={(e) => startDrag("spread", edge, e)}
          />
        ))}
      </div>

      <div
        className={`ob-cal-box is-ribbons ${active === "ribbons" ? "is-active" : ""}`}
        style={ribbonsStyle}
        onPointerDown={(e) => startDrag("ribbons", "move", e)}
      >
        <span className="ob-cal-label">Закладки</span>
        {(["n", "s", "e", "w"] as Edge[]).map((edge) => (
          <i
            key={edge}
            className={`ob-cal-handle is-${edge}`}
            onPointerDown={(e) => startDrag("ribbons", edge, e)}
          />
        ))}
      </div>
    </>
  );
}
