import { useState, type FormEvent } from "react";
import { apiLogin, apiRegister, type ApiUser } from "../game/api";
import { startMenuMusic, unlockSfx } from "../game/sfx";

type Props = {
  onAuthed: (token: string, user: ApiUser) => void;
};

export function AuthScreen({ onAuthed }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      unlockSfx();
      void startMenuMusic();
      const fn = mode === "login" ? apiLogin : apiRegister;
      const res = await fn(login.trim(), password);
      onAuthed(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="auth-screen"
      onPointerDown={() => {
        unlockSfx();
        void startMenuMusic();
      }}
    >
      <div className="auth-card">
        <p className="splash-eyebrow">
          <span>Might of Orakul</span>
        </p>
        <h1>{mode === "login" ? "Вход" : "Регистрация"}</h1>
        <p className="hint">
          Один аккаунт для ПК и будущего Telegram Mini App.
        </p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            Логин
            <input
              autoComplete="username"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              minLength={3}
              required
            />
          </label>
          <label>
            Пароль
            <div className="auth-password-row">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={4}
                required
              />
              <button
                type="button"
                className="ghost auth-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                title={showPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="primary large" disabled={busy}>
            {busy
              ? "…"
              : mode === "login"
                ? "Войти"
                : "Создать аккаунт"}
          </button>
        </form>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
        >
          {mode === "login"
            ? "Нет аккаунта? Регистрация"
            : "Уже есть аккаунт? Вход"}
        </button>
      </div>
    </div>
  );
}
