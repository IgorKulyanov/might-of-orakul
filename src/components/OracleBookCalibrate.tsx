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

/** Обе страницы + все 6 закладок; книга на всю ширину окна */
export const DEFAULT_BOOK_LAYOUT: BookLayout = {
  spreadL: 10,
  spreadR: 10,
  spreadT: 10,
  spreadB: 18,
  ribbonsL: 24,
  ribbonsR: 26,
  ribbonsB: 0.5,
  ribbonsH: 15,
  coverW: 4000,
};

const STORAGE_KEY = "orakul-book-layout-v2";
const MIN_SPAN = 8; // минимальная ширина/высота рамки в %

type BoxKind = "spread" | "ribbons" | "cover";
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

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
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

/** Сдвиг inset-пары left/right без прилипания к центру */
function moveInsets(
  left: number,
  right: number,
  dx: number,
  maxInset = 100 - MIN_SPAN,
): { left: number; right: number } {
  const width = 100 - left - right;
  let nextL = left + dx;
  let nextR = right - dx;
  if (nextL < 0) {
    nextR += nextL;
    nextL = 0;
  }
  if (nextR < 0) {
    nextL += nextR;
    nextR = 0;
  }
  nextL = clamp(nextL, 0, maxInset);
  nextR = clamp(nextR, 0, maxInset);
  if (nextL + nextR > 100 - MIN_SPAN) {
    // сохранить ширину у края
    if (dx >= 0) {
      nextL = 100 - MIN_SPAN - nextR;
    } else {
      nextR = 100 - MIN_SPAN - nextL;
    }
  }
  // если упёрлись — не сжимать рамку
  if (100 - nextL - nextR < width - 0.05) {
    if (dx > 0) {
      nextL = 100 - width - nextR;
      nextL = clamp(nextL, 0, maxInset);
      nextR = 100 - width - nextL;
    } else {
      nextR = 100 - width - nextL;
      nextR = clamp(nextR, 0, maxInset);
      nextL = 100 - width - nextR;
    }
  }
  return { left: round1(nextL), right: round1(clamp(nextR, 0, maxInset)) };
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
    /* ignore */
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

function fitPair(a: number, b: number): { a: number; b: number } {
  let left = clamp(a, 0, 100 - MIN_SPAN);
  let right = clamp(b, 0, 100 - MIN_SPAN);
  if (left + right > 100 - MIN_SPAN) {
    const overflow = left + right - (100 - MIN_SPAN);
    if (left >= right) left = round1(left - overflow);
    else right = round1(right - overflow);
  }
  return { a: round1(left), b: round1(right) };
}

function applySpread(
  s: BookLayout,
  h: Handle,
  dx: number,
  dy: number,
): BookLayout {
  const next = { ...s };
  if (h === "move") {
    const x = moveInsets(s.spreadL, s.spreadR, dx);
    next.spreadL = x.left;
    next.spreadR = x.right;
    const y = moveInsets(s.spreadT, s.spreadB, dy);
    next.spreadT = y.left;
    next.spreadB = y.right;
    return next;
  }
  if (hasW(h)) next.spreadL = round1(s.spreadL + dx);
  if (hasE(h)) next.spreadR = round1(s.spreadR - dx);
  if (hasN(h)) next.spreadT = round1(s.spreadT + dy);
  if (hasS(h)) next.spreadB = round1(s.spreadB - dy);
  const x = fitPair(next.spreadL, next.spreadR);
  const y = fitPair(next.spreadT, next.spreadB);
  next.spreadL = x.a;
  next.spreadR = x.b;
  next.spreadT = y.a;
  next.spreadB = y.b;
  return next;
}

function applyRibbons(
  s: BookLayout,
  h: Handle,
  dx: number,
  dy: number,
): BookLayout {
  const next = { ...s };
  if (h === "move") {
    const x = moveInsets(s.ribbonsL, s.ribbonsR, dx);
    next.ribbonsL = x.left;
    next.ribbonsR = x.right;
    // низ: ribbonsB от низа; высота отдельно — двигаем только bottom
    next.ribbonsB = clamp(round1(s.ribbonsB - dy), 0, 100 - s.ribbonsH - 1);
    return next;
  }
  if (hasW(h)) next.ribbonsL = round1(s.ribbonsL + dx);
  if (hasE(h)) next.ribbonsR = round1(s.ribbonsR - dx);
  if (hasS(h)) next.ribbonsB = round1(s.ribbonsB - dy);
  if (hasN(h)) next.ribbonsH = round1(s.ribbonsH - dy);
  const x = fitPair(next.ribbonsL, next.ribbonsR);
  next.ribbonsL = x.a;
  next.ribbonsR = x.b;
  next.ribbonsB = clamp(next.ribbonsB, 0, 60);
  next.ribbonsH = clamp(next.ribbonsH, 4, 50);
  if (next.ribbonsB + next.ribbonsH > 98) {
    next.ribbonsH = round1(98 - next.ribbonsB);
  }
  return next;
}

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
      const s = d.start;

      if (d.kind === "cover") {
        const px = e.clientX - d.startX;
        onChange({
          ...s,
          coverW: clamp(Math.round(s.coverW + px * 3), 800, 6000),
        });
        return;
      }
      if (d.kind === "spread") {
        onChange(applySpread(s, d.handle, dx, dy));
        return;
      }
      onChange(applyRibbons(s, d.handle, dx, dy));
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
    handle: Handle,
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
      handle,
      startX: e.clientX,
      startY: e.clientY,
      start: { ...layout },
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
      window.prompt("Скопируй цифры:", text);
    }
  };

  const renderBox = (
    kind: "spread" | "ribbons",
    style: CSSProperties,
    label: string,
  ) => (
    <div
      className={`ob-cal-box is-${kind} ${active === kind ? "is-active" : ""}`}
      style={style}
    >
      <span className="ob-cal-label">{label}</span>
      {BOX_HANDLES.map((handle) => (
        <button
          key={handle}
          type="button"
          className={`ob-cal-handle is-${handle}`}
          aria-label={
            handle === "move"
              ? `Переместить: ${label}`
              : `Растянуть ${handle}: ${label}`
          }
          onPointerDown={(e) => startDrag(kind, handle, e)}
        />
      ))}
    </div>
  );

  return (
    <>
      <div className="ob-cal-hud" role="dialog" aria-label="Калибровка книги">
        <strong>Как в Paint</strong>
        <p>
          Зелёная рамка должна накрыть <b>обе</b> страницы. Фиолетовая — все
          6 закладок. Кружок = двигать, угол = растянуть. Жёлтый угол книги =
          ширина на весь экран.
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
          <button
            type="button"
            className={active === "cover" ? "primary" : "ghost"}
            onClick={() => setActive("cover")}
          >
            Книга
          </button>
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

      {renderBox(
        "spread",
        {
          left: `${layout.spreadL}%`,
          right: `${layout.spreadR}%`,
          top: `${layout.spreadT}%`,
          bottom: `${layout.spreadB}%`,
        },
        "Карты (обе страницы)",
      )}

      {renderBox(
        "ribbons",
        {
          left: `${layout.ribbonsL}%`,
          right: `${layout.ribbonsR}%`,
          bottom: `${layout.ribbonsB}%`,
          height: `${layout.ribbonsH}%`,
        },
        "Все закладки",
      )}

      <button
        type="button"
        className={`ob-cal-cover-corner ${active === "cover" ? "is-active" : ""}`}
        title="Потяни — книга на всю ширину"
        aria-label="Растянуть книгу"
        onPointerDown={(e) => startDrag("cover", "se", e)}
      />
    </>
  );
}
