import { useEffect, useRef, useState } from "react";
import { apiFeedback } from "../game/api";
import { LobbyChatSocket, type ChatMessage } from "../game/chatClient";
import { isOwnerBoostCode } from "../game/ownerCode";
import { getToken } from "../game/session";

type Tab = "chat" | "feedback";

type Props = {
  open: boolean;
  onClose: () => void;
  screenHint?: string;
  /** Код в чате открыл меню компенсации. */
  onOwnerBoostCode?: () => void;
};

/** Сегодня — только часы:минуты; иначе день.месяц и время. */
function formatChatTime(at: number): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getDate()}.${d.getMonth() + 1} ${hh}:${mm}`;
}

export function CommunityPanel({
  open,
  onClose,
  screenHint = "menu",
  onOwnerBoostCode,
}: Props) {
  const [tab, setTab] = useState<Tab>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [fbText, setFbText] = useState("");
  const [fbBusy, setFbBusy] = useState(false);
  const sockRef = useRef<LobbyChatSocket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      sockRef.current?.close();
      sockRef.current = null;
      return;
    }
    const token = getToken();
    if (!token) {
      setStatus("Нужен вход");
      return;
    }
    let cancelled = false;
    const sock = new LobbyChatSocket();
    sockRef.current = sock;
    setStatus("Подключение к чату…");
    void sock
      .connect(token, (msg) => {
        if (cancelled) return;
        if (msg.type === "history") {
          setMessages(msg.messages);
          setStatus(null);
        }
        if (msg.type === "chat") {
          setMessages((prev) => [...prev.slice(-79), msg.message]);
          setStatus(null);
        }
        if (msg.type === "error") setStatus(msg.message);
        if (msg.type === "ok") setStatus(msg.message);
      })
      .then(() => {
        if (!cancelled) setStatus((s) => (s === "Подключение к чату…" ? null : s));
      })
      .catch((e) => {
        if (!cancelled) {
          setStatus(
            e instanceof Error
              ? e.message
              : "Чат недоступен — обнови страницу (Ctrl+F5)",
          );
        }
      });
    return () => {
      cancelled = true;
      sock.close();
      sockRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open || tab !== "chat") return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, tab]);

  if (!open) return null;

  const sendChat = () => {
    const t = draft.trim();
    if (!t) return;
    if (isOwnerBoostCode(t) && onOwnerBoostCode) {
      setDraft("");
      setStatus(null);
      onClose();
      onOwnerBoostCode();
      return;
    }
    try {
      sockRef.current?.say(t);
      setDraft("");
      setStatus(null);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Не отправилось");
    }
  };

  const sendFeedback = async () => {
    const token = getToken();
    if (!token) {
      setStatus("Нужен вход");
      return;
    }
    setFbBusy(true);
    setStatus(null);
    try {
      const res = await apiFeedback(token, {
        text: fbText,
        screen: screenHint,
      });
      setFbText("");
      setStatus(res.message);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setFbBusy(false);
    }
  };

  return (
    <div className="community-overlay" role="dialog" aria-label="Сообщество">
      <div className="community-panel">
        <header className="community-bar">
          <div className="community-tabs">
            <button
              type="button"
              className={tab === "chat" ? "is-on" : ""}
              onClick={() => setTab("chat")}
            >
              Чат
            </button>
            <button
              type="button"
              className={tab === "feedback" ? "is-on" : ""}
              onClick={() => setTab("feedback")}
            >
              Разработчику
            </button>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            ✕
          </button>
        </header>

        {tab === "chat" ? (
          <>
            <p className="community-hint">
              Общий чат лобби. Без ссылок, не чаще нескольких сообщений подряд.
              Жалоба — долгое нажатие / ПКМ по сообщению.
            </p>
            <div className="community-log" ref={listRef}>
              {messages.length === 0 ? (
                <p className="hint">Пока тихо — напиши первым.</p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className="community-msg"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      sockRef.current?.report(m.id, "report");
                      setStatus("Жалоба отправлена");
                    }}
                  >
                    <span className="community-msg-meta">
                      <strong>{m.name}</strong>
                      <time
                        className="community-msg-time"
                        dateTime={new Date(m.at).toISOString()}
                        title={new Date(m.at).toLocaleString("ru-RU")}
                      >
                        {formatChatTime(m.at)}
                      </time>
                    </span>
                    <span>{m.text}</span>
                  </div>
                ))
              )}
            </div>
            <div className="community-compose">
              <input
                value={draft}
                maxLength={200}
                placeholder="Сообщение…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendChat();
                }}
              />
              <button type="button" className="primary" onClick={sendChat}>
                →
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="community-hint">
              Баг, идея, токсик в чате — напиши сюда. До 5 писем в сутки. Видит
              только разработчик.
            </p>
            <textarea
              className="community-feedback"
              value={fbText}
              maxLength={800}
              rows={6}
              placeholder="Что случилось?"
              onChange={(e) => setFbText(e.target.value)}
            />
            <button
              type="button"
              className="primary large"
              disabled={fbBusy || fbText.trim().length < 5}
              onClick={() => void sendFeedback()}
            >
              {fbBusy ? "Отправка…" : "Отправить"}
            </button>
          </>
        )}

        {status ? <p className="community-status">{status}</p> : null}
      </div>
    </div>
  );
}
