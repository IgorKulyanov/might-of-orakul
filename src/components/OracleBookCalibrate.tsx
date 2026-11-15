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

type BoxKind = "spread" | "ribbons" | "cover";
/** Paint-style: углы + стороны + перенос */
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

function applySpread(
  s: BookLayout,
  h: Handle,
  dx: number,
  dy: number,
): BookLayout {
  const next = { ...s };
  if (h === "move") {
    next.spreadL = clamp(round1(s.spreadL + dx), 0, 42);
    next.spreadR = clamp(round1(s.spreadR - dx), 0, 42);
    next.spreadT = clamp(round1(s.spreadT + dy), 0, 42);
    next.spreadB = clamp(round1(s.spreadB - dy), 4, 48);
    return next;
  }
  if (hasW(h)) next.spreadL = clamp(round1(s.spreadL + dx), 0, 42);
  if (hasE(h)) next.spreadR = clamp(round1(s.spreadR - dx), 0, 42);
  if (hasN(h)) next.spreadT = clamp(round1(s.spreadT + dy), 0, 42);
  if (hasS(h)) next.spreadB = clamp(round1(s.spreadB - dy), 4, 48);
  if (next.spreadL + next.spreadR > 88) {
    if (hasW(h)) next.spreadL = round1(88 - next.spreadR);
    if (hasE(h)) next.spreadR = round1(88 - next.spreadL);
  }
  if (next.spreadT + next.spreadB > 88) {
    if (hasN(h)) next.spreadT = round1(88 - next.spreadB);
    if (hasS(h)) next.spreadB = round1(88 - next.spreadT);
  }
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
    next.ribbonsL = clamp(round1(s.ribbonsL + dx), 0, 48);
    next.ribbonsR = clamp(round1(s.ribbonsR - dx), 0, 48);
    next.ribbonsB = clamp(round1(s.ribbonsB - dy), 0, 22);
    return next;
  }
  if (hasW(h)) next.ribbonsL = clamp(round1(s.ribbonsL + dx), 0, 48);
  if (hasE(h)) next.ribbonsR = clamp(round1(s.ribbonsR - dx), 0, 48);
  // низ рамки (ближе к низу картинки)
  if (hasS(h)) next.ribbonsB = clamp(round1(s.ribbonsB - dy), 0, 22);
  // верх рамки = высота столбиков закладок
  if (hasN(h)) next.ribbonsH = clamp(round1(s.ribbonsH - dy), 5, 30);
  if (next.ribbonsL + next.ribbonsR > 92) {
    if (hasW(h)) next.ribbonsL = round1(92 - next.ribbonsR);
    if (hasE(h)) next.ribbonsR = round1(92 - next.ribbonsL);
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
        // тянем угол книги — шире/уже (как растягивание картинки)
        const px = e.clientX - d.startX;
        const nextW = clamp(Math.round(s.coverW + px * 2), 640, 1700);
        onChange({ ...s, coverW: nextW });
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
          Зажми <b>середину</b> рамки — двигай. Тяни за <b>угол</b> или{" "}
          <b>край</b> — растягивай шире/уже/выше. Жёлтый угол книги — размер
          всей книги.
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
        "Карты",
      )}

      {renderBox(
        "ribbons",
        {
          left: `${layout.ribbonsL}%`,
          right: `${layout.ribbonsR}%`,
          bottom: `${layout.ribbonsB}%`,
          height: `${layout.ribbonsH}%`,
        },
        "Закладки",
      )}

      {/* угол всей книги — растянуть шире/уже */}
      <button
        type="button"
        className={`ob-cal-cover-corner ${active === "cover" ? "is-active" : ""}`}
        title="Потяни — размер книги"
        aria-label="Растянуть книгу"
        onPointerDown={(e) => startDrag("cover", "se", e)}
      />
    </>
  );
}
