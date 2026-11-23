import { useState, type FormEvent } from "react";
import { getCard, SCHOOL_COLOR } from "../game/cards";
import {
  BASE_HEROES,
  epicPowerPreview,
  orakulArtUrl,
  ORACLE_EPIC_LORE,
} from "../game/heroes";
import { beginWithHero } from "../game/owned";
import {
  finishedSchoolTrails,
  schoolTrailDraft,
  schoolTrailTitle,
} from "../game/schoolTrails";
import type { Faction, OwnedState } from "../game/types";
import { SchoolBadge } from "./GameIcon";

type Props = {
  owned: OwnedState;
  initialName?: string;
  /** После троп вкуса — другой заголовок/текст. */
  afterTrails?: boolean;
  onComplete: (displayName: string, nextOwned: OwnedState) => void | Promise<void>;
};

const FACTION_ORDER: Faction[] = [
  "life",
  "death",
  "water",
  "hell",
  "nature",
];

function cardName(id: string): string {
  try {
    return getCard(id).name;
  } catch {
    return id;
  }
}

export function OnboardingScreen({
  owned,
  initialName = "",
  afterTrails = false,
  onComplete,
}: Props) {
  const finished = finishedSchoolTrails(owned);
  const allowed =
    afterTrails && finished.length > 0 ? finished : FACTION_ORDER;
  const defaultHero =
    BASE_HEROES.find((h) => h.faction === allowed[0])?.id ?? "hero_life";
  const [heroId, setHeroId] = useState(
    owned.heroId && owned.homeFaction && allowed.includes(owned.homeFaction)
      ? owned.heroId
      : defaultHero,
  );
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bases = FACTION_ORDER.map(
    (f) => BASE_HEROES.find((h) => h.faction === f)!,
  ).filter((h) => allowed.includes(h.faction));

  const selected = bases.find((h) => h.id === heroId) ?? bases[0];
  const draft = selected ? schoolTrailDraft(owned, selected.faction) : [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const displayName = name.trim();
    if (displayName.length < 2) {
      setError("Имя от 2 символов");
      return;
    }
    if (!selected) {
      setError("Сначала пройди тропу школы");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = beginWithHero(owned, selected.id);
      if (!res.ok) {
        setError(res.reason ?? "Не вышло");
        setBusy(false);
        return;
      }
      await onComplete(displayName, res.owned);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
      setBusy(false);
    }
  };

  return (
    <div className="onboard-screen">
      <header className="page-bar">
        <h1>{afterTrails ? "Какая сила отозвалась?" : "Создание оракула"}</h1>
      </header>
      <p className="hint hero-screen-hint">
        {afterTrails
          ? "В мир уйдут три нейтрала + мини-колода выбранной школы. Доступны только школы, где тропа пройдена 5/5. Эпик купишь позже в кабинете."
          : "Выбери одну из пяти школ — потом сменить нельзя. Эпик купишь позже в кабинете."}
      </p>
      {afterTrails ? (
        <p className="hint school-trails-pick-warn onboard-oracle-lock-warn">
          Важно: оракула после выбора сменить нельзя. Выбирай школу осознанно.
        </p>
      ) : null}

      <form className="onboard-form" onSubmit={submit}>
        <div className="onboard-oracle-grid onboard-oracle-grid-base">
          {bases.map((h) => {
            const color = SCHOOL_COLOR[h.faction];
            const on = heroId === h.id;
            const pathDraft = schoolTrailDraft(owned, h.faction);
            return (
              <button
                key={h.id}
                type="button"
                className={`onboard-pick onboard-pick-lg ${on ? "on" : ""}`}
                style={{ ["--faction" as string]: color }}
                onClick={() => setHeroId(h.id)}
              >
                <div className="orakul-portrait-wrap">
                  <img
                    className="orakul-portrait"
                    src={orakulArtUrl(h)}
                    alt={h.name}
                    draggable={false}
                  />
                  {on && <span className="onboard-pick-mark">✓</span>}
                </div>
                <strong className="onboard-pick-name">{h.name}</strong>
                <span className="onboard-pick-school">
                  <SchoolBadge school={h.faction} size={14} />
                  {schoolTrailTitle(h.faction)}
                </span>
                {pathDraft.length ? (
                  <p className="onboard-epic-later">
                    Мини-колода: {pathDraft.map(cardName).join(", ")}
                  </p>
                ) : null}
                <p className="onboard-epic-later">
                  <span className="onboard-epic-later-label">Позже эпик</span>
                  {ORACLE_EPIC_LORE[h.faction]}
                </p>
                <p className="onboard-epic-power">{epicPowerPreview(h.faction)}</p>
              </button>
            );
          })}
        </div>

        {draft.length ? (
          <p className="hint school-trails-hint">
            С собой в мир: нейтралы + {draft.map(cardName).join(", ")}
          </p>
        ) : null}

        <div className="onboard-name-row">
          <label className="onboard-name">
            Имя оракула
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              minLength={2}
              placeholder="Например: Астра"
              required
            />
          </label>
          <button
            type="submit"
            className="primary large onboard-ready"
            disabled={busy || !selected}
          >
            {busy ? "…" : "В мир"}
          </button>
        </div>
        {error && <p className="auth-error">{error}</p>}
      </form>
    </div>
  );
}
