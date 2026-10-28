import { useCallback, useEffect, useState } from "react";
import {
  apiAdminClearPvpBan,
  apiAdminGrant,
  apiAdminInbox,
  apiAdminMute,
  apiAdminPing,
  apiAdminResetCampaign,
  apiAdminStats,
  apiAdminUnmute,
  apiAdminUsers,
  getAdminKey,
  setAdminKey,
} from "../game/api";
import { clearPvpFleeLocal } from "../game/pvpFleeBan";
import { getCachedUser } from "../game/session";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Inbox = Awaited<ReturnType<typeof apiAdminInbox>>;
type UserRow = Awaited<ReturnType<typeof apiAdminUsers>>["users"][number];
type Stats = Awaited<ReturnType<typeof apiAdminStats>>;

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

export function AdminPanel({ open, onClose }: Props) {
  const [keyInput, setKeyInput] = useState("");
  const [key, setKey] = useState<string | null>(() => getAdminKey());
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [grantLogin, setGrantLogin] = useState("");
  const [grantGold, setGrantGold] = useState("100");
  const [grantDia, setGrantDia] = useState("0");
  const [grantNote, setGrantNote] = useState("поощрение");
  const [muteLogin, setMuteLogin] = useState("");
  const [muteMin, setMuteMin] = useState("60");
  const [actionLogin, setActionLogin] = useState("");

  const refresh = useCallback(
    async (adminKey: string) => {
      const [box, list, st] = await Promise.all([
        apiAdminInbox(adminKey),
        apiAdminUsers(adminKey, q || undefined),
        apiAdminStats(adminKey),
      ]);
      setInbox(box);
      setUsers(list.users);
      setStats(st);
    },
    [q],
  );

  useEffect(() => {
    if (!open || !key) return;
    setBusy(true);
    void refresh(key)
      .then(() => setStatus(null))
      .catch((e) => setStatus(e instanceof Error ? e.message : "Ошибка"))
      .finally(() => setBusy(false));
  }, [open, key, refresh]);

  // Живая статистика, пока админка открыта.
  useEffect(() => {
    if (!open || !key) return;
    const id = window.setInterval(() => {
      void apiAdminStats(key)
        .then((st) => setStats(st))
        .catch(() => {
          /* тихо — не спамим статусом */
        });
    }, 10_000);
    return () => window.clearInterval(id);
  }, [open, key]);

  if (!open) return null;

  const screenLabel = (s: string) => {
    if (s === "battle_pvp" || s === "battlePvp") return "PvP";
    if (s === "battle") return "бой";
    if (s === "multi") return "мульти";
    if (s === "cabinet") return "кабинет";
    if (s === "menu") return "меню";
    return s;
  };

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

  const doClearBan = async () => {
    if (!key) return;
    const login = actionLogin.trim();
    if (!login) {
      setStatus("Укажи логин");
      return;
    }
    if (
      !window.confirm(
        `Снять бан PvP у «${login}»?\n\nДа — снять. Нет — отмена.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await apiAdminClearPvpBan(key, login);
      const me = getCachedUser()?.login;
      if (me && me.toLowerCase() === login.toLowerCase()) {
        clearPvpFleeLocal();
      }
      setStatus(res.message);
      await refresh(key);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  const doResetCampaign = async () => {
    if (!key) return;
    const login = actionLogin.trim();
    if (!login) {
      setStatus("Укажи логин");
      return;
    }
    if (
      !window.confirm(
        `Сбросить кампанию (тропу) у «${login}»?\n\nПрогресс тропы обнулится при следующем входе игрока.\n\nДа — сбросить. Нет — отмена.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await apiAdminResetCampaign(key, login);
      setStatus(res.message);
      await refresh(key);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Ошибка");
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
            <section className="admin-section">
              <h3>Статистика · авто 10с</h3>
              {stats ? (
                <>
                  <div className="admin-stats admin-stats-live">
                    <div className="admin-stat admin-stat-hi">
                      <em>Сейчас в игре</em>
                      <strong>{stats.onlineNow ?? 0}</strong>
                    </div>
                    <div className="admin-stat admin-stat-hi">
                      <em>Всего аккаунтов</em>
                      <strong>{stats.registered}</strong>
                    </div>
                    <div className="admin-stat">
                      <em>Новые за 24ч</em>
                      <strong>{stats.registeredToday ?? 0}</strong>
                    </div>
                    <div className="admin-stat">
                      <em>В чате</em>
                      <strong>{stats.chatOnline}</strong>
                    </div>
                    <div className="admin-stat">
                      <em>PvP сейчас</em>
                      <strong>
                        {stats.pvpPlayers}
                        <span className="admin-stat-sub">
                          {" "}
                          бой {stats.pvpInBattle} · лобби {stats.pvpInLobby} ·
                          комнат {stats.pvpRooms}
                        </span>
                      </strong>
                    </div>
                    <div className="admin-stat">
                      <em>Где онлайн</em>
                      <strong className="admin-stat-sub">
                        меню {stats.screens?.menu ?? 0} · бой{" "}
                        {stats.screens?.battle ?? 0} · PvP{" "}
                        {stats.screens?.battlePvp ?? 0} · кабинет{" "}
                        {stats.screens?.cabinet ?? 0} · мульти{" "}
                        {stats.screens?.multi ?? 0}
                      </strong>
                    </div>
                    <div className="admin-stat">
                      <em>Заходили 15м / 1ч / 24ч</em>
                      <strong>
                        {stats.active15m} / {stats.active1h} / {stats.active24h}
                      </strong>
                    </div>
                    <div className="admin-stat">
                      <em>Сон · бан PvP · аптайм</em>
                      <strong>
                        {stats.dormant} · {stats.bannedPvp} ·{" "}
                        {formatUptime(stats.uptimeSec)}
                      </strong>
                    </div>
                  </div>
                  {(stats.onlineWho?.length ?? 0) > 0 ? (
                    <div className="admin-online-list">
                      <em>Онлайн сейчас</em>
                      <ul>
                        {stats.onlineWho.map((u) => (
                          <li key={u.login}>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => {
                                setGrantLogin(u.login);
                                setMuteLogin(u.login);
                                setActionLogin(u.login);
                              }}
                            >
                              {u.name}
                              <span>
                                @{u.login} · {screenLabel(u.screen)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="hint">Сейчас никого онлайн (пульс пуст).</p>
                  )}
                </>
              ) : (
                <p className="hint">Загрузка…</p>
              )}
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
                Обновить сейчас
              </button>
            </section>

            <section className="admin-section">
              <h3>Действия по логину</h3>
              <input
                value={actionLogin}
                placeholder="логин игрока"
                onChange={(e) => setActionLogin(e.target.value)}
              />
              <div className="admin-row">
                <button
                  type="button"
                  className="primary"
                  disabled={busy || !actionLogin.trim()}
                  onClick={() => void doClearBan()}
                >
                  Снять бан PvP
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy || !actionLogin.trim()}
                  onClick={() => void doResetCampaign()}
                >
                  Сбросить кампанию
                </button>
              </div>
              <p className="hint">
                Обе кнопки спрашивают «да / нет». Кампания сбросится у игрока
                при следующем входе.
              </p>
            </section>

            <p className="community-hint">
              Поощряй золотом/алмазами, глуши чат, смотри жалобы и письма.
              Игрок увидит валюту после следующего сейва/входа.
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
                      setActionLogin(u.login);
                    }}
                  >
                    <strong>
                      {u.login}
                      {u.dormant ? " · сон" : ""}
                      {u.chatMutedUntil && u.chatMutedUntil > Date.now()
                        ? " · мут"
                        : ""}
                      {u.pvpBanned ? " · бан PvP" : ""}
                      {u.pendingResetCampaign ? " · сброс тропы" : ""}
                    </strong>
                    <span>
                      {u.displayName || "—"} · ур.{u.level} · {u.gold} 🪙{" "}
                      {u.diamonds}💎
                      {u.lastLoginAt
                        ? ` · ${new Date(u.lastLoginAt).toLocaleString()}`
                        : ""}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="admin-section">
              <h3>Входящие</h3>
              <div className="community-log admin-log">
                {(
                  inbox?.feedback as
                    | Array<{ login?: string; text?: string; at?: string }>
                    | undefined
                )?.map((f, i) => (
                  <div key={`f-${i}`} className="community-msg">
                    <strong>✉ {f.login}</strong>
                    <span>{f.text}</span>
                  </div>
                ))}
                {(
                  inbox?.reports as
                    | Array<{ byLogin?: string; reason?: string }>
                    | undefined
                )?.map((r, i) => (
                  <div key={`r-${i}`} className="community-msg">
                    <strong>⚠ жалоба от {r.byLogin}</strong>
                    <span>{r.reason}</span>
                  </div>
                ))}
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
