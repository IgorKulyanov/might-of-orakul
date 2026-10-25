import { useCallback, useEffect, useState } from "react";
import {
  apiAdminGrant,
  apiAdminInbox,
  apiAdminMute,
  apiAdminPing,
  apiAdminUnmute,
  apiAdminUsers,
  getAdminKey,
  setAdminKey,
} from "../game/api";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Inbox = Awaited<ReturnType<typeof apiAdminInbox>>;
type UserRow = Awaited<ReturnType<typeof apiAdminUsers>>["users"][number];

export function AdminPanel({ open, onClose }: Props) {
  const [keyInput, setKeyInput] = useState("");
  const [key, setKey] = useState<string | null>(() => getAdminKey());
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [grantLogin, setGrantLogin] = useState("");
  const [grantGold, setGrantGold] = useState("100");
  const [grantDia, setGrantDia] = useState("0");
  const [grantNote, setGrantNote] = useState("поощрение");
  const [muteLogin, setMuteLogin] = useState("");
  const [muteMin, setMuteMin] = useState("60");

  const refresh = useCallback(async (adminKey: string) => {
    const [box, list] = await Promise.all([
      apiAdminInbox(adminKey),
      apiAdminUsers(adminKey, q || undefined),
    ]);
    setInbox(box);
    setUsers(list.users);
  }, [q]);

  useEffect(() => {
    if (!open || !key) return;
    setBusy(true);
    void refresh(key)
      .then(() => setStatus(null))
      .catch((e) => setStatus(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setBusy(false));
  }, [open, key, refresh]);

  if (!open) return null;

  const unlock = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await apiAdminPing(keyInput.trim());
      setAdminKey(keyInput.trim());
      setKey(keyInput.trim());
      setStatus(`${res.message} · игроков: ${res.users}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Ключ не принят");
    } finally {
      setBusy(false);
    }
  };

  const doGrant = async () => {
    if (!key) return;
    setBusy(true);
    try {
      const res = await apiAdminGrant(key, {
        login: grantLogin.trim(),
        gold: Number(grantGold) || 0,
        diamonds: Number(grantDia) || 0,
        note: grantNote,
      });
      setStatus(res.message);
      await refresh(key);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Ошибка начисления");
    } finally {
      setBusy(false);
    }
  };

  const doMute = async () => {
    if (!key) return;
    setBusy(true);
    try {
      const res = await apiAdminMute(key, {
        login: muteLogin.trim(),
        minutes: Number(muteMin) || 60,
        reason: "admin",
      });
      setStatus(res.message);
      await refresh(key);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Ошибка мута");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="community-overlay" role="dialog" aria-label="Админка">
      <div className="community-panel admin-panel">
        <header className="community-bar">
          <strong>Админка</strong>
          <button type="button" className="ghost" onClick={onClose}>
            ✕
          </button>
        </header>

        {!key ? (
          <>
            <p className="community-hint">
              Секретный ключ — в консоли API при старте или в{" "}
              <code>ORACUL_ADMIN_KEY</code> / <code>server/data/admin.key</code>.
              В интерфейсе игры ключ нигде не написан.
            </p>
            <div className="community-compose">
              <input
                type="password"
                value={keyInput}
                placeholder="Админ-ключ"
                onChange={(e) => setKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void unlock();
                }}
              />
              <button
                type="button"
                className="primary"
                disabled={busy || keyInput.trim().length < 4}
                onClick={() => void unlock()}
              >
                Войти
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="community-hint">
              Поощряй золотом/алмазами, глуши чат, смотри жалобы и письма.
              Игрок увидит валюту после следующего сейва/входа (сейв в{" "}
              <code>owned</code>).
            </p>

            <section className="admin-section">
              <h3>Начислить</h3>
              <div className="admin-grid">
                <input
                  value={grantLogin}
                  placeholder="логин игрока"
                  onChange={(e) => setGrantLogin(e.target.value)}
                />
                <input
                  value={grantGold}
                  placeholder="золото"
                  inputMode="numeric"
                  onChange={(e) => setGrantGold(e.target.value)}
                />
                <input
                  value={grantDia}
                  placeholder="алмазы"
                  inputMode="numeric"
                  onChange={(e) => setGrantDia(e.target.value)}
                />
                <input
                  value={grantNote}
                  placeholder="заметка"
                  onChange={(e) => setGrantNote(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="primary"
                disabled={busy || !grantLogin.trim()}
                onClick={() => void doGrant()}
              >
                Выдать награду
              </button>
            </section>

            <section className="admin-section">
              <h3>Мут чата</h3>
              <div className="admin-grid admin-grid-2">
                <input
                  value={muteLogin}
                  placeholder="логин"
                  onChange={(e) => setMuteLogin(e.target.value)}
                />
                <input
                  value={muteMin}
                  placeholder="минуты"
                  inputMode="numeric"
                  onChange={(e) => setMuteMin(e.target.value)}
                />
              </div>
              <div className="admin-row">
                <button
                  type="button"
                  className="ghost"
                  disabled={busy || !muteLogin.trim()}
                  onClick={() => void doMute()}
                >
                  Замутить
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy || !muteLogin.trim() || !key}
                  onClick={() => {
                    if (!key) return;
                    setBusy(true);
                    void apiAdminUnmute(key, muteLogin.trim())
                      .then(async (r) => {
                        setStatus(r.message);
                        await refresh(key);
                      })
                      .catch((e) =>
                        setStatus(
                          e instanceof Error ? e.message : "Ошибка unmute",
                        ),
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  Снять мут
                </button>
              </div>
            </section>

            <section className="admin-section">
              <h3>Игроки</h3>
              <div className="community-compose">
                <input
                  value={q}
                  placeholder="поиск логина…"
                  onChange={(e) => setQ(e.target.value)}
                />
                <button
                  type="button"
                  className="ghost"
                  disabled={busy || !key}
                  onClick={() => {
                    if (!key) return;
                    setBusy(true);
                    void refresh(key)
                      .catch((e) =>
                        setStatus(e instanceof Error ? e.message : "Ошибка"),
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  ↻
                </button>
              </div>
              <div className="community-log admin-log">
                {users.map((u) => (
                  <button
                    type="button"
                    key={u.id}
                    className="admin-user"
                    onClick={() => {
                      setGrantLogin(u.login);
                      setMuteLogin(u.login);
                    }}
                  >
                    <strong>
                      {u.login}
                      {u.dormant ? " · сон" : ""}
                      {u.chatMutedUntil && u.chatMutedUntil > Date.now()
                        ? " · мут"
                        : ""}
                    </strong>
                    <span>
                      {u.displayName || "—"} · ур.{u.level} · {u.gold}🪙{" "}
                      {u.diamonds}💎
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="admin-section">
              <h3>Входящие</h3>
              <div className="community-log admin-log">
                {(inbox?.feedback as Array<{ login?: string; text?: string; at?: string }> | undefined)?.map(
                  (f, i) => (
                    <div key={`f-${i}`} className="community-msg">
                      <strong>✉ {f.login}</strong>
                      <span>{f.text}</span>
                    </div>
                  ),
                )}
                {(inbox?.reports as Array<{ byLogin?: string; reason?: string }> | undefined)?.map(
                  (r, i) => (
                    <div key={`r-${i}`} className="community-msg">
                      <strong>⚠ жалоба от {r.byLogin}</strong>
                      <span>{r.reason}</span>
                    </div>
                  ),
                )}
                {(inbox?.mutes || []).map((m) => (
                  <div key={m.userId} className="community-msg">
                    <strong>🔇 {m.login}</strong>
                    <span>
                      до {new Date(m.until).toLocaleString()} · {m.reason}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <button
              type="button"
              className="ghost"
              onClick={() => {
                setAdminKey(null);
                setKey(null);
              }}
            >
              Выйти из админки
            </button>
          </>
        )}

        {status ? <p className="community-status">{status}</p> : null}
      </div>
    </div>
  );
}
