import { useState, type FormEvent } from "react";
import { SCHOOL_COLOR, SCHOOL_LABEL } from "../game/cards";
import {
  BASE_HEROES,
  epicPowerPreview,
  orakulArtUrl,
  ORACLE_EPIC_LORE,
} from "../game/heroes";
import { beginWithHero } from "../game/owned";
import type { Faction, OwnedState } from "../game/types";

type Props = {
  owned: OwnedState;
  initialName?: string;
  onComplete: (displayName: string, nextOwned: OwnedState) => void | Promise<void>;
};

const FACTION_ORDER: Faction[] = [
  "life",
  "death",
  "water",
  "hell",
  "nature",
];

export function OnboardingScreen({
  owned,
  initialName = "",
  onComplete,
}: Props) {
  const [heroId, setHeroId] = useState(
    owned.heroId && owned.homeFaction ? owned.heroId : "hero_life",
  );
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bases = FACTION_ORDER.map(
    (f) => BASE_HEROES.find((h) => h.faction === f)!,
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const displayName = name.trim();
    if (displayName.length < 2) {
      setError("Имя от 2 символов");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = beginWithHero(owned, heroId);
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
        <h1>Создание оракула</h1>
      </header>
      <p className="hint hero-screen-hint">
        Выбери фракцию один раз. Эпик купишь позже в кабинете — под каждым
        портретом написано, что он даст.
      </p>

      <form className="onboard-form" onSubmit={submit}>
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
            disabled={busy}
          >
            {busy ? "…" : "Готово"}
          </button>
        </div>

        {error && <p className="auth-error">{error}</p>}

        <div className="onboard-oracle-grid onboard-oracle-grid-base">
          {bases.map((h) => {
            const color = SCHOOL_COLOR[h.faction];
            const on = heroId === h.id;
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
                  {SCHOOL_LABEL[h.faction]}
                </span>
                <p className="onboard-epic-later">
                  <span className="onboard-epic-later-label">Позже эпик</span>
                  {ORACLE_EPIC_LORE[h.faction]}
                </p>
                <p className="onboard-epic-power">{epicPowerPreview(h.faction)}</p>
              </button>
            );
          })}
        </div>
      </form>
    </div>
  );
}
