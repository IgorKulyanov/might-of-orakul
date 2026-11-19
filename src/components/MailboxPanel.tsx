import { useCallback, useEffect, useState } from "react";
import {
  apiMailClaim,
  apiMailList,
  apiMailRead,
  type ApiUser,
  type MailItem,
} from "../game/api";
import { getToken } from "../game/session";
import { GameIcon } from "./GameIcon";

type Props = {
  open: boolean;
  onClose: () => void;
  onUnreadChange: (n: number) => void;
  /** После «Забрать» — обновить кошелёк с сервера. */
  onClaimedUser?: (user: ApiUser) => void;
};

export function MailboxPanel({
  open,
  onClose,
  onUnreadChange,
  onClaimedUser,
}: Props) {
  const [mails, setMails] = useState<MailItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const res = await apiMailList(token);
    setMails(res.mails);
    onUnreadChange(res.unread);
  }, [onUnreadChange]);

  useEffect(() => {
    if (!open) return;
    setStatus(null);
    setBusy(true);
    void refresh()
      .catch((e) =>
        setStatus(e instanceof Error ? e.message : "Не удалось загрузить почту"),
      )
      .finally(() => setBusy(false));
  }, [open, refresh]);

  if (!open) return null;

  const current = mails.find((m) => m.id === selected) ?? null;

  const openLetter = async (id: string) => {
    setSelected(id);
    const token = getToken();
    if (!token) return;
    const letter = mails.find((m) => m.id === id);
    if (letter && !letter.read) {
      try {
        const res = await apiMailRead(token, id);
        setMails(res.mails);
        onUnreadChange(res.unread);
      } catch {
        /* ignore */
      }
    }
  };

  const claim = async (id: string) => {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await apiMailClaim(token, id);
      setMails(res.mails);
      onUnreadChange(res.unread);
      if (res.user) onClaimedUser?.(res.user);
      setStatus(res.message);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="community-overlay" role="dialog" aria-label="Почта">
      <div className="community-panel mailbox-panel">
        <header className="community-bar">
          <strong>Почта</strong>
          <button type="button" className="ghost" onClick={onClose}>
            ✕
          </button>
        </header>
        <p className="community-hint">
          Письма от Оракула. Вложения (золото, алмазы) забирай кнопкой в письме.
        </p>
        <div className="mailbox-layout">
          <div className="community-log mailbox-list">
            {mails.length === 0 && !busy ? (
              <p className="hint">Пока пусто.</p>
            ) : null}
            {mails.map((m) => (
              <button
                type="button"
                key={m.id}
                className={`mailbox-row ${m.id === selected ? "is-on" : ""} ${
                  m.needsAttention ? "is-new" : ""
                }`}
                onClick={() => void openLetter(m.id)}
              >
                <strong>
                  {m.needsAttention ? "● " : ""}
                  {m.subject}
                </strong>
                <span>
                  {m.from} · {new Date(m.at).toLocaleString()}
                  {!m.claimed && (m.gold > 0 || m.diamonds > 0)
                    ? " · вложение"
                    : ""}
                </span>
              </button>
            ))}
          </div>
          <div className="mailbox-read">
            {current ? (
              <>
                <h3>{current.subject}</h3>
                <p className="mailbox-meta">
                  от {current.from} · {new Date(current.at).toLocaleString()}
                </p>
                <p className="mailbox-body">
                  {current.body || "—"}
                </p>
                {!current.claimed &&
                (current.gold > 0 || current.diamonds > 0) ? (
                  <div className="mailbox-loot">
                    <span className="inline-icos">
                      Вложение:{" "}
                      {current.gold > 0 ? (
                        <>
                          {current.gold} <GameIcon name="gold" size={14} />{" "}
                        </>
                      ) : null}
                      {current.diamonds > 0 ? (
                        <>
                          {current.diamonds}{" "}
                          <GameIcon name="diamond" size={14} />
                        </>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      className="primary"
                      disabled={busy}
                      onClick={() => void claim(current.id)}
                    >
                      Забрать
                    </button>
                  </div>
                ) : current.claimed ? (
                  <p className="hint">Вложение уже получено.</p>
                ) : null}
              </>
            ) : (
              <p className="hint">Выбери письмо слева.</p>
            )}
          </div>
        </div>
        {status ? <p className="community-status">{status}</p> : null}
      </div>
    </div>
  );
}
