import { useEffect, useMemo, useState, type ReactNode } from "react";
import { burnImpactLayers, fxSequence, type FxSpriteKind } from "../game/battleVfx";

type Slot = "flight" | "hit" | "linger" | "dot" | "misc";
type Filter = "all" | Slot;

type LabItem = {
  id: string;
  title: string;
  slot: Slot;
  hint: string;
  /** Suggested battle use */
  where: string;
  kind: "sprite" | "css" | "missile" | "stack";
  frames?: string[];
  stepMs?: number;
  cssClass?: string;
  missile?: "arrow" | "bolt" | "magic" | "fire" | "water" | "poison";
  stack?: "burn";
};

const FX = "/fx";

function seq(folder: string, names: string[]): string[] {
  return names.map((n) => `${FX}/${folder}/${n}`);
}

function padSeq(
  folder: string,
  prefix: string,
  from: number,
  to: number,
  pad = 2,
): string[] {
  const out: string[] = [];
  for (let i = from; i <= to; i++) {
    out.push(`${FX}/${folder}/${prefix}${String(i).padStart(pad, "0")}.png`);
  }
  return out;
}

const LAB: LabItem[] = [
  // —— Полёт (CSS missiles) ——
  {
    id: "fly-arrow",
    title: "Стрела",
    slot: "flight",
    hint: "CSS",
    where: "elf / crossbow / archer",
    kind: "missile",
    missile: "arrow",
  },
  {
    id: "fly-bolt",
    title: "Светлый болт",
    slot: "flight",
    hint: "CSS",
    where: "mage / life bolt",
    kind: "missile",
    missile: "bolt",
  },
  {
    id: "fly-magic",
    title: "Тёмный шар",
    slot: "flight",
    hint: "CSS",
    where: "lich / necro / death",
    kind: "missile",
    missile: "magic",
  },
  {
    id: "fly-fire",
    title: "Фаербол",
    slot: "flight",
    hint: "CSS",
    where: "gopnik / inferno / dragon",
    kind: "missile",
    missile: "fire",
  },
  {
    id: "fly-water",
    title: "Вода",
    slot: "flight",
    hint: "CSS",
    where: "water_spirit",
    kind: "missile",
    missile: "water",
  },
  {
    id: "fly-poison",
    title: "Яд-шар",
    slot: "flight",
    hint: "CSS",
    where: "scorpicora / poison spells",
    kind: "missile",
    missile: "poison",
  },

  // —— Удары: спрайты ——
  {
    id: "hit-slash",
    title: "Слэш",
    slot: "hit",
    hint: "slash/",
    where: "melee сейчас",
    kind: "sprite",
    frames: fxSequence("slash"),
    stepMs: 55,
  },
  {
    id: "hit-spark",
    title: "Искры",
    slot: "hit",
    hint: "spark/",
    where: "стрела hit / физика",
    kind: "sprite",
    frames: fxSequence("spark"),
    stepMs: 50,
  },
  {
    id: "hit-explosion",
    title: "Взрыв",
    slot: "hit",
    hint: "explosion/",
    where: "огненный удар (слой)",
    kind: "sprite",
    frames: fxSequence("explosion"),
    stepMs: 70,
  },
  {
    id: "hit-flash",
    title: "Вспышка",
    slot: "hit",
    hint: "flash/",
    where: "слой burn / shock",
    kind: "sprite",
    frames: fxSequence("flash"),
    stepMs: 55,
  },
  {
    id: "hit-muzzle",
    title: "Дуло",
    slot: "hit",
    hint: "muzzle/",
    where: "старт выстрела?",
    kind: "sprite",
    frames: fxSequence("muzzle"),
    stepMs: 55,
  },
  {
    id: "hit-muzzle-rot",
    title: "Дуло (повёрн.)",
    slot: "hit",
    hint: "muzzle/*_rotated",
    where: "альт. выстрел",
    kind: "sprite",
    frames: padSeq("muzzle", "muzzle_", 1, 5).map((p) =>
      p.replace(".png", "_rotated.png"),
    ),
    stepMs: 55,
  },
  {
    id: "hit-water-01",
    title: "Вода A",
    slot: "hit",
    hint: "water/01",
    where: "water hit сейчас",
    kind: "sprite",
    frames: fxSequence("water"),
    stepMs: 70,
  },
  {
    id: "hit-water-02",
    title: "Вода B",
    slot: "hit",
    hint: "water/02",
    where: "альт. вода",
    kind: "sprite",
    frames: seq("water", [
      "02_Water__01.png",
      "02_Water__02.png",
      "02_Water__03.png",
      "02_Water__04.png",
      "02_Water__05.png",
    ]),
    stepMs: 70,
  },
  {
    id: "hit-water-05",
    title: "Вода C",
    slot: "hit",
    hint: "water/05",
    where: "альт. вода",
    kind: "sprite",
    frames: seq("water", [
      "05_Water__01.png",
      "05_Water__02.png",
      "05_Water__03.png",
      "05_Water__04.png",
      "05_Water__05.png",
    ]),
    stepMs: 70,
  },
  {
    id: "hit-arcane-01",
    title: "Аркана A",
    slot: "hit",
    hint: "arcane/01",
    where: "death magic hit",
    kind: "sprite",
    frames: fxSequence("arcane"),
    stepMs: 60,
  },
  {
    id: "hit-arcane-06",
    title: "Аркана B",
    slot: "hit",
    hint: "arcane/06",
    where: "альт. магия",
    kind: "sprite",
    frames: [1, 2, 3, 4, 5, 6, 7].map(
      (i) => `${FX}/arcane/06_Arcane_Effect_${i}.png`,
    ),
    stepMs: 60,
  },
  {
    id: "hit-lightning",
    title: "Молния PNG",
    slot: "hit",
    hint: "lightning/",
    where: "было shock (фото)",
    kind: "sprite",
    frames: fxSequence("lightning"),
    stepMs: 42,
  },
  {
    id: "hit-lightning-arc",
    title: "Дуга PNG",
    slot: "hit",
    hint: "lightning_arc/",
    where: "альт. ток",
    kind: "sprite",
    frames: seq("lightning_arc", [
      "lightning.png",
      "lightning_1.png",
      "lightning_2.png",
      "lightning1_b.png",
      "lightning2_b.png",
      "lightning3.png",
      "lightning3_b.png",
      "lightning_b.png",
    ]),
    stepMs: 55,
  },
  {
    id: "hit-heal-stars",
    title: "Хил-звёзды",
    slot: "hit",
    hint: "magic_particle/star",
    where: "heal сейчас",
    kind: "sprite",
    frames: fxSequence("heal"),
    stepMs: 70,
  },
  {
    id: "hit-magic-orb",
    title: "Magic orbs",
    slot: "hit",
    hint: "magic_particle/magic",
    where: "хил / баф?",
    kind: "sprite",
    frames: padSeq("magic_particle", "magic_", 1, 5),
    stepMs: 70,
  },
  {
    id: "hit-twirl",
    title: "Twirl",
    slot: "hit",
    hint: "magic_particle/twirl",
    where: "баф / каст",
    kind: "sprite",
    frames: padSeq("magic_particle", "twirl_", 1, 3),
    stepMs: 80,
  },
  {
    id: "hit-circle",
    title: "Круг",
    slot: "hit",
    hint: "circle/",
    where: "баф / щит?",
    kind: "sprite",
    frames: padSeq("circle", "circle_", 1, 5),
    stepMs: 70,
  },
  {
    id: "hit-scorch",
    title: "Ожог",
    slot: "hit",
    hint: "scorch/",
    where: "след огня",
    kind: "sprite",
    frames: padSeq("scorch", "scorch_", 1, 3),
    stepMs: 90,
  },
  {
    id: "hit-burn-stack",
    title: "Стек огня",
    slot: "hit",
    hint: "explosion+flash+smoke",
    where: "burn impact сейчас",
    kind: "stack",
    stack: "burn",
  },
  {
    id: "hit-shock-css",
    title: "Ток CSS",
    slot: "hit",
    hint: "fx-shock-sparks",
    where: "mage shock сейчас",
    kind: "css",
    cssClass: "lab-css-shock",
  },

  // —— Хвосты / linger ——
  {
    id: "linger-flame",
    title: "Пламя loop",
    slot: "linger",
    hint: "flame/",
    where: "хвост огня?",
    kind: "sprite",
    frames: fxSequence("flame"),
    stepMs: 80,
  },
  {
    id: "linger-flame-rot",
    title: "Пламя повёрн.",
    slot: "linger",
    hint: "flame/*_rotated",
    where: "альт. хвост",
    kind: "sprite",
    frames: [
      `${FX}/flame/flame_05_rotated.png`,
      `${FX}/flame/flame_06_rotated.png`,
      `${FX}/flame/flame_05_rotated.png`,
      `${FX}/flame/flame_06_rotated.png`,
    ],
    stepMs: 90,
  },
  {
    id: "linger-smoke",
    title: "Чёрный дым",
    slot: "linger",
    hint: "smoke/",
    where: "слой burn",
    kind: "sprite",
    frames: fxSequence("smoke"),
    stepMs: 55,
  },
  {
    id: "linger-puff",
    title: "Белый puff",
    slot: "linger",
    hint: "white_puff/",
    where: "было poison (откл.)",
    kind: "sprite",
    frames: fxSequence("white_puff"),
    stepMs: 55,
  },
  {
    id: "linger-burn-css",
    title: "Жар CSS",
    slot: "linger",
    hint: "fx-burn-residual",
    where: "остаток fireball",
    kind: "css",
    cssClass: "lab-css-burn",
  },

  // —— DoT ——
  {
    id: "dot-poison-css",
    title: "Яд пузыри",
    slot: "dot",
    hint: "fx-poison-smoke",
    where: "poison linger сейчас",
    kind: "css",
    cssClass: "lab-css-poison",
  },
  {
    id: "dot-burn-rim",
    title: "Горение карты",
    slot: "dot",
    hint: "is-burning rim",
    where: "burn status",
    kind: "css",
    cssClass: "lab-css-burning-card",
  },
  {
    id: "dot-magic-card",
    title: "Магия на карте",
    slot: "dot",
    hint: "is-magic-burn",
    where: "magic hit card",
    kind: "css",
    cssClass: "lab-css-magic-card",
  },
];

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "Все" },
  { id: "flight", label: "Полёт" },
  { id: "hit", label: "Удар" },
  { id: "linger", label: "Хвост" },
  { id: "dot", label: "DoT / статус" },
];

function SpriteLoop({
  frames,
  stepMs = 60,
  replayKey,
  className,
}: {
  frames: string[];
  stepMs?: number;
  replayKey: number;
  className?: string;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (frames.length <= 1) return;
    const id = window.setInterval(() => {
      setI((n) => (n + 1) % frames.length);
    }, stepMs);
    return () => window.clearInterval(id);
  }, [frames, stepMs, replayKey]);
  const src = frames[i] ?? frames[0];
  if (!src) return null;
  return (
    <span className={`vfx-lab-sprite ${className ?? ""}`} aria-hidden>
      <img src={src} alt="" draggable={false} />
    </span>
  );
}

function BurnStackLoop({ replayKey }: { replayKey: number }) {
  const layers = burnImpactLayers();
  const period = 1400;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setTick(0);
    const id = window.setInterval(() => setTick((t) => t + 1), period);
    return () => window.clearInterval(id);
  }, [replayKey]);
  const key = `${replayKey}-${tick}`;
  return (
    <span className="fx-burn-stack vfx-lab-stack" aria-hidden>
      {layers.map((layer) => (
        <SpriteBurstOnce
          key={`${key}-${layer.kind}-${layer.delayMs}`}
          kind={layer.kind}
          frames={fxSequence(layer.kind)}
          delayMs={layer.delayMs}
          stepMs={layer.stepMs}
          className={layer.className}
        />
      ))}
    </span>
  );
}

function SpriteBurstOnce({
  kind,
  frames,
  delayMs,
  stepMs,
  className,
}: {
  kind: FxSpriteKind;
  frames: string[];
  delayMs: number;
  stepMs: number;
  className?: string;
}) {
  const [i, setI] = useState(0);
  const [on, setOn] = useState(delayMs <= 0);
  useEffect(() => {
    let startTimer: number | null = null;
    let id: number | null = null;
    setI(0);
    setOn(delayMs <= 0);
    const begin = () => {
      setOn(true);
      id = window.setInterval(() => {
        setI((n) => {
          if (n + 1 >= frames.length) {
            if (id != null) window.clearInterval(id);
            return n;
          }
          return n + 1;
        });
      }, stepMs);
    };
    if (delayMs > 0) startTimer = window.setTimeout(begin, delayMs);
    else begin();
    return () => {
      if (startTimer != null) window.clearTimeout(startTimer);
      if (id != null) window.clearInterval(id);
    };
  }, [frames, delayMs, stepMs]);
  if (!on) return null;
  const src = frames[Math.min(i, frames.length - 1)];
  if (!src) return null;
  return (
    <span
      className={`fx-sprite-burst is-${kind}${className ? ` ${className}` : ""}`}
      aria-hidden
    >
      <img src={src} alt="" draggable={false} />
    </span>
  );
}

function MissilePreview({
  style,
  replayKey,
}: {
  style: NonNullable<LabItem["missile"]>;
  replayKey: number;
}) {
  const body = (() => {
    switch (style) {
      case "arrow":
        return (
          <>
            <span className="missile-arrow-fletch" />
            <span className="missile-arrow-shaft" />
            <span className="missile-arrow-head" />
          </>
        );
      case "poison":
        return (
          <>
            <span className="missile-poison-core" />
            <span className="missile-poison-drip" />
          </>
        );
      case "fire":
        return (
          <>
            <span className="missile-fire-glow" aria-hidden />
            <span className="missile-fire-core" />
            <span className="missile-fire-spark" aria-hidden />
          </>
        );
      case "water":
        return (
          <>
            <span className="missile-water-core" />
            <span className="missile-water-splash" />
          </>
        );
      case "bolt":
        return (
          <>
            <span className="missile-arc-glow" aria-hidden />
            <span className="missile-arc-core" />
            <span className="missile-arc-spark" aria-hidden />
          </>
        );
      case "magic":
      default:
        return (
          <>
            <span className="missile-magic-glow" aria-hidden />
            <span className="missile-magic-core" />
          </>
        );
    }
  })();
  return (
    <span
      key={replayKey}
      className={`battle-missile is-${style} vfx-lab-missile`}
      aria-hidden
    >
      {body}
    </span>
  );
}

function CssPreview({ cls }: { cls: string }): ReactNode {
  if (cls === "lab-css-shock") {
    return (
      <span className="fx-shock-sparks vfx-lab-css-fill" aria-hidden>
        <i className="bolt" />
        <i className="bolt" />
        <i className="bolt" />
        <i className="bolt" />
        <i className="bolt" />
        <i className="bolt" />
        <i className="dot" />
        <i className="dot" />
        <i className="dot" />
        <i className="dot" />
        <i className="dot" />
        <i className="dot" />
      </span>
    );
  }
  if (cls === "lab-css-poison") {
    return (
      <span className="fx-poison-smoke vfx-lab-css-fill" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </span>
    );
  }
  if (cls === "lab-css-burn") {
    return (
      <span className="fx-burn-residual vfx-lab-css-fill" aria-hidden>
        <i className="burn-rim" />
        <i className="burn-lick" />
        <i className="burn-lick burn-lick-2" />
        <i className="burn-lick burn-lick-3" />
      </span>
    );
  }
  if (cls === "lab-css-burning-card") {
    return <span className="vfx-lab-card-dummy is-burning" aria-hidden />;
  }
  if (cls === "lab-css-magic-card") {
    return (
      <span className="vfx-lab-card-dummy is-magic-burn" aria-hidden>
        <span className="fx-magic-layer" />
      </span>
    );
  }
  return null;
}

function LabTile({ item }: { item: LabItem }) {
  const [replay, setReplay] = useState(0);
  return (
    <article className="vfx-lab-tile">
      <div className="vfx-lab-stage">
        <div className="vfx-lab-card-ghost" aria-hidden />
        {item.kind === "sprite" && item.frames ? (
          <SpriteLoop
            frames={item.frames}
            stepMs={item.stepMs}
            replayKey={replay}
          />
        ) : null}
        {item.kind === "missile" && item.missile ? (
          <MissilePreview style={item.missile} replayKey={replay} />
        ) : null}
        {item.kind === "stack" && item.stack === "burn" ? (
          <BurnStackLoop replayKey={replay} />
        ) : null}
        {item.kind === "css" && item.cssClass ? (
          <CssPreview cls={item.cssClass} />
        ) : null}
      </div>
      <div className="vfx-lab-meta">
        <strong>{item.title}</strong>
        <span className="vfx-lab-slot">{slotLabel(item.slot)}</span>
        <span className="vfx-lab-hint">{item.hint}</span>
        <span className="vfx-lab-where">{item.where}</span>
      </div>
      <button
        type="button"
        className="chip vfx-lab-replay"
        onClick={() => setReplay((n) => n + 1)}
      >
        Replay
      </button>
    </article>
  );
}

function slotLabel(s: Slot): string {
  switch (s) {
    case "flight":
      return "полёт";
    case "hit":
      return "удар";
    case "linger":
      return "хвост";
    case "dot":
      return "DoT";
    default:
      return s;
  }
}

export function DevVfxLab() {
  const [filter, setFilter] = useState<Filter>("all");
  const list = useMemo(
    () => (filter === "all" ? LAB : LAB.filter((x) => x.slot === filter)),
    [filter],
  );

  return (
    <section className="vfx-lab" aria-label="Галерея анимаций">
      <p className="hint vfx-lab-intro">
        Живые циклы — смотри глазами, куда подходит. Сейв не трогает.
        Сейчас в бою ≠ все варианты ниже; это витрина.
      </p>
      <div className="filters vfx-lab-filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={filter === f.id ? "chip on" : "chip"}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            {f.id === "all" ? ` (${LAB.length})` : ""}
          </button>
        ))}
      </div>
      <div className="vfx-lab-grid">
        {list.map((item) => (
          <LabTile key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
