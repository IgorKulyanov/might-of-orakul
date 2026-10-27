import { useState, type FormEvent } from "react";
import { apiLogin, apiRegister, type ApiUser } from "../game/api";
import { getLastLogin } from "../game/session";
import { startMenuMusic, unlockSfx } from "../game/sfx";

type Props = {
  onAuthed: (token: string, user: ApiUser) => void;
};

export function AuthScreen({ onAuthed }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [login, setLogin] = useState(() => getLastLogin());
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canRestore, setCanRestore] = useState(false);
  const [busy, setBusy] = useState(false);

  const switchMode = (next: "login" | "register") => {
    setMode(next);
    setError(null);
    setCanRestore(false);
    setPassword("");
    // На одном ПК двое: регистрация — пустые поля (не логин первого).
    setLogin(next === "login" ? getLastLogin() : "");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setCanRestore(false);
    setBusy(true);
    try {
      unlockSfx();
      void startMenuMusic();
      const name = login.trim();
      if (mode === "login") {
        try {
          const res = await apiLogin(name, password);
          onAuthed(res.token, res.user);
          return;
        } catch (err) {
          const code =
            err && typeof err === "object" && "code" in err
              ? String((err as { code?: string }).code || "")
              : "";
          const msg = err instanceof Error ? err.message : "Ошибка";
          if (code === "ACCOUNT_MISSING" || /не найден|сброс/i.test(msg)) {
            setCanRestore(true);
            setError(msg);
            return;
          }
          throw err;
        }
      }
      const res = await apiRegister(name, password);
      onAuthed(res.token, res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const restoreAccount = async () => {
    setError(null);
    setBusy(true);
    try {
      unlockSfx();
      void startMenuMusic();
      const res = await apiRegister(login.trim(), password);
      setCanRestore(false);
      onAuthed(res.token, res.user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка";
      if (/уже есть/i.test(msg)) {
        setError("Логин снова занят — попробуй обычный вход.");
        setCanRestore(false);
        setMode("login");
      } else {
        setError(msg);
      }
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
          Логин — латиницей (a–z, цифры), не имя оракула. Два человека на
          одном компьютере — у каждого свой логин: выйди → «Регистрация» →
          новый логин. Если пишет «аккаунт не найден» — «Восстановить
          аккаунт» тем же логином и паролем (прогресс в этом браузере
          сохранится).
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
              placeholder="например igor_42"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
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
          {canRestore && (
            <button
              type="button"
              className="primary large"
              disabled={busy || password.length < 4}
              onClick={() => void restoreAccount()}
            >
              Восстановить аккаунт
            </button>
          )}
        </form>
        <button
          type="button"
          className="ghost"
          onClick={() =>
            switchMode(mode === "login" ? "register" : "login")
          }
        >
          {mode === "login"
            ? "Нет аккаунта? Регистрация"
            : "Уже есть аккаунт? Вход"}
        </button>
      </div>
    </div>
  );
}
