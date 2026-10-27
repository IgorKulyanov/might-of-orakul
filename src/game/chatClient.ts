import { API_URL } from "./api";

export type ChatMessage = {
  id: string;
  at: number;
  userId: string;
  name: string;
  text: string;
};

type ServerMsg =
  | { type: "history"; messages: ChatMessage[] }
  | { type: "chat"; message: ChatMessage }
  | { type: "error"; message: string }
  | { type: "ok"; message: string };

function resolveChatWsUrl(): string {
  const env = (import.meta.env.VITE_API_URL as string | undefined)?.replace(
    /\/$/,
    "",
  );
  if (env) {
    const u = new URL(env);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = "/ws/chat";
    u.search = "";
    u.hash = "";
    return u.toString();
  }
  if (typeof window !== "undefined") {
    if (API_URL) {
      const u = new URL(API_URL);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      u.pathname = "/ws/chat";
      return u.toString();
    }
    // Dev: Vite proxy /ws → :8787
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws/chat`;
  }
  return "ws://127.0.0.1:8787/ws/chat";
}

export class LobbyChatSocket {
  private ws: WebSocket | null = null;
  private onMsg: ((m: ServerMsg) => void) | null = null;
  private authed = false;
  private token: string | null = null;
  private intentionalClose = false;
  private reconnectTimer: number | null = null;
  private attempt = 0;
  private connectGen = 0;

  get ready(): boolean {
    return (
      this.authed && !!this.ws && this.ws.readyState === WebSocket.OPEN
    );
  }

  /**
   * Держит чат живым: при обрыве сам переподключается, пока не close().
   * Резолвится после первого успешного hello (history).
   */
  connect(token: string, onMessage: (m: ServerMsg) => void): Promise<void> {
    this.token = token;
    this.onMsg = onMessage;
    this.intentionalClose = false;
    this.attempt = 0;
    return this.openOnce(true);
  }

  private clearReconnect() {
    if (this.reconnectTimer != null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.intentionalClose || !this.token) return;
    this.clearReconnect();
    const delay = Math.min(15_000, 800 + this.attempt * 900);
    this.attempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.openOnce(false).catch(() => {
        this.scheduleReconnect();
      });
    }, delay);
  }

  private openOnce(isFirst: boolean): Promise<void> {
    this.authed = false;
    const gen = ++this.connectGen;
    const token = this.token;
    if (!token) {
      return Promise.reject(new Error("Нужен вход"));
    }

    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;

    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        this.authed = false;
        reject(err);
      };
      const ok = () => {
        if (settled) return;
        settled = true;
        this.authed = true;
        this.attempt = 0;
        resolve();
      };

      let ws: WebSocket;
      try {
        ws = new WebSocket(resolveChatWsUrl());
      } catch (e) {
        fail(e instanceof Error ? e : new Error("Чат: нет связи"));
        return;
      }
      this.ws = ws;

      const timer = window.setTimeout(() => {
        fail(new Error("Чат: сервер не ответил на вход"));
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }, 20_000);

      ws.onopen = () => {
        if (gen !== this.connectGen) return;
        ws.send(JSON.stringify({ type: "hello", token }));
      };
      ws.onerror = () => {
        if (gen !== this.connectGen) return;
        window.clearTimeout(timer);
        if (isFirst && !settled) {
          fail(new Error("Чат: нет связи"));
        }
      };
      ws.onmessage = (ev) => {
        if (gen !== this.connectGen) return;
        try {
          const msg = JSON.parse(String(ev.data)) as ServerMsg;
          if (msg.type === "history") {
            window.clearTimeout(timer);
            ok();
          }
          if (
            msg.type === "error" &&
            !this.authed &&
            /вход|авториз|сесси/i.test(msg.message)
          ) {
            window.clearTimeout(timer);
            this.intentionalClose = true;
            fail(
              new Error(
                "Сессия для чата не принята. Выйди и войди в игру снова.",
              ),
            );
          }
          this.onMsg?.(msg);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (gen !== this.connectGen) return;
        window.clearTimeout(timer);
        this.ws = null;
        this.authed = false;
        if (!settled && isFirst) {
          fail(new Error("Чат: соединение закрыто"));
          return;
        }
        if (!this.intentionalClose) {
          this.onMsg?.({
            type: "error",
            message: "Чат переподключается…",
          });
          this.scheduleReconnect();
        }
      };
    });
  }

  say(text: string) {
    if (!this.ready || !this.ws) {
      throw new Error("Чат ещё не готов — подожди секунду");
    }
    this.ws.send(JSON.stringify({ type: "say", text }));
  }

  report(msgId: string, reason?: string) {
    if (!this.ready || !this.ws) return;
    this.ws.send(JSON.stringify({ type: "report", msgId, reason }));
  }

  close() {
    this.intentionalClose = true;
    this.clearReconnect();
    this.authed = false;
    this.token = null;
    this.connectGen += 1;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }
}
