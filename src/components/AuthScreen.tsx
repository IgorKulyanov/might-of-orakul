import { useState, type FormEvent } from "react";
import {
  apiLogin,
  apiRegister,
  apiResendEmailCode,
  apiVerifyEmail,
  type ApiUser,
} from "../game/api";
import { getLastLogin, setLastLogin } from "../game/session";
import { startMenuMusic, unlockSfx } from "../game/sfx";

type Props = {
  onAuthed: (token: string, user: ApiUser) => void;
  /** Уже вошли, но почта не подтверждена — сразу экран кода. */
  forceVerifyLogin?: string;
  forceVerifyEmail?: string | null;
};

type Mode = "login" | "register" | "verify";

export function AuthScreen({
  onAuthed,
  forceVerifyLogin,
  forceVerifyEmail,
}: Props) {
  const [mode, setMode] = useState<Mode>(() =>
    forceVerifyLogin ? "verify" : "login",
  );
  // Одно поле: почта (новые) или старый логин. Ник оракула — отдельно, после входа.
  const [identity, setIdentity] = useState(
    () => forceVerifyLogin || getLastLogin(),
  );
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [maskedEmail, setMaskedEmail] = useState<string | null>(
    () => forceVerifyEmail ?? null,
  );
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [canRestore, setCanRestore] = useState(false);
  const [busy, setBusy] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setHint(null);
    setCanRestore(false);
    setPassword("");
    setCode("");
    if (next === "register") {
      setIdentity("");
      setMaskedEmail(null);
    } else if (next === "login") {
      setIdentity(getLastLogin());
    }
  };

  const goVerify = (
    id: string,
    mailHint?: string | null,
    devCode?: string,
  ) => {
    setIdentity(id);
    setMaskedEmail(mailHint ?? null);
    setMode("verify");
    setCode(devCode ?? "");
    setHint(
      devCode
        ? `Dev-режим: код ${devCode}`
        : `Код отправлен на ${mailHint || "почту"}. Проверь «Входящие» и «Спам».`,
    );
  };

  const finish = (token: string, user: ApiUser, remember: string) => {
    const r = remember.trim();
    if (r) setLastLogin(r);
    onAuthed(token, user);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setHint(null);
    setCanRestore(false);
    setBusy(true);
    try {
      unlockSfx();
      void startMenuMusic();
      const id = identity.trim();

      if (mode === "verify") {
        const res = await apiVerifyEmail(id, code.trim());
        finish(res.token, res.user, id.includes("@") ? id : getLastLogin() || id);
        return;
      }

      if (mode === "login") {
        try {
          const res = await apiLogin(id, password);
          finish(res.token, res.user, id);
          return;
        } catch (err) {
          const errCode =
            err && typeof err === "object" && "code" in err
              ? String((err as { code?: string }).code || "")
              : "";
          const msg = err instanceof Error ? err.message : "Ошибка";
          if (errCode === "EMAIL_NOT_VERIFIED") {
            goVerify(
              id,
              err && typeof err === "object" && "email" in err
                ? String((err as { email?: string }).email || "")
                : null,
            );
            return;
          }
          if (errCode === "ACCOUNT_MISSING" || /не найден|сброс/i.test(msg)) {
            setCanRestore(true);
            setError(msg);
            return;
          }
          throw err;
        }
      }

      // Регистрация: только почта + пароль. Ник — у оракула.
      const res = await apiRegister(id, password);
      if (res.needsEmailVerify || res.user.needsEmailVerify) {
        goVerify(id, res.user.email, res.devCode);
        if (res.mailWarning) setError(res.mailWarning);
        return;
      }
      finish(res.token, res.user, id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await apiResendEmailCode(identity.trim());
      setHint(
        res.devCode
          ? `Dev-режим: код ${res.devCode}`
          : `Код снова отправлен на ${res.email || maskedEmail || "почту"}`,
      );
      if (res.devCode) setCode(res.devCode);
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
      const id = identity.trim();
      if (!id.includes("@")) {
        setError("Для восстановления укажи почту в поле выше.");
        setMode("register");
        setBusy(false);
        return;
      }
      const res = await apiRegister(id, password);
      setCanRestore(false);
      if (res.needsEmailVerify || res.user.needsEmailVerify) {
        goVerify(id, res.user.email, res.devCode);
        return;
      }
      finish(res.token, res.user, id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ошибка";
      if (/занята|уже есть/i.test(msg)) {
        setError("Почта снова занята — попробуй обычный вход.");
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
        <h1>
          {mode === "login"
            ? "Вход"
            : mode === "verify"
              ? "Код с почты"
              : "Регистрация"}
        </h1>
        <p className="hint">
          {mode === "verify"
            ? `Введи 6 цифр из письма${maskedEmail ? ` (${maskedEmail})` : ""}.`
            : mode === "register"
              ? "Почта и пароль. Ник оракула выберешь после входа. Два человека на одном ПК — у каждого своя почта."
              : "Вход по почте. Старые аккаунты без почты — прежним логином. Ник оракула — не здесь."}
        </p>
        <form className="auth-form" onSubmit={submit}>
          {mode !== "verify" && (
            <label>
              {mode === "register" ? "Почта" : "Почта или старый логин"}
              <input
                type={mode === "register" ? "email" : "text"}
                autoComplete={mode === "register" ? "email" : "username"}
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                required
                placeholder={
                  mode === "register" ? "you@mail.ru" : "you@mail.ru или старый_логин"
                }
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
          )}
          {mode !== "verify" && (
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
          )}
          {mode === "verify" && (
            <label>
              Код из письма
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
                minLength={4}
                maxLength={8}
                required
                placeholder="123456"
                autoFocus
              />
            </label>
          )}
          {hint && <p className="hint">{hint}</p>}
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="primary large" disabled={busy}>
            {busy
              ? "…"
              : mode === "login"
                ? "Войти"
                : mode === "verify"
                  ? "Подтвердить"
                  : "Создать аккаунт"}
          </button>
          {mode === "verify" && (
            <button
              type="button"
              className="ghost large"
              disabled={busy}
              onClick={() => void resend()}
            >
              Выслать код ещё раз
            </button>
          )}
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
        {mode === "verify" ? (
          <button
            type="button"
            className="ghost"
            onClick={() => switchMode("login")}
          >
            Назад ко входу
          </button>
        ) : (
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
        )}
      </div>
    </div>
  );
}
