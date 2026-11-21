import { useState, type FormEvent } from "react";
import { MenuAudioDock } from "./MenuAudioDock";

type Props = {
  initialName?: string;
  onComplete: (displayName: string) => void | Promise<void>;
};

/** Только ник. Дальше — пролог → «Путь оракула». */
export function NameOnboarding({ initialName = "", onComplete }: Props) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await onComplete(displayName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
      setBusy(false);
    }
  };

  return (
    <div className="onboard-screen">
      <header className="page-bar">
        <h1>Как тебя зовут?</h1>
        <MenuAudioDock className="school-trails-audio" />
      </header>
      <p className="hint hero-screen-hint">
        Ник — дальше короткий пролог и обучение школ.
      </p>
      <form className="onboard-form" onSubmit={submit}>
        <div className="onboard-name-row">
          <label className="onboard-name">
            Имя
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              minLength={2}
              placeholder="Например: Астра"
              required
              autoFocus
            />
          </label>
          <button
            type="submit"
            className="primary large onboard-ready"
            disabled={busy}
          >
            {busy ? "…" : "Дальше"}
          </button>
        </div>
        {error && <p className="auth-error">{error}</p>}
      </form>
    </div>
  );
}
