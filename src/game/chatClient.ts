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

  get ready(): boolean {
    return (
      this.authed &&
      !!this.ws &&
      this.ws.readyState === WebSocket.OPEN
    );
  }

  /** Резолвится только после успешного hello (history), не раньше. */
  connect(token: string, onMessage: (m: ServerMsg) => void): Promise<void> {
    this.onMsg = onMessage;
    this.authed = false;
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
        resolve();
      };

      const ws = new WebSocket(resolveChatWsUrl());
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
        ws.send(JSON.stringify({ type: "hello", token }));
      };
      ws.onerror = () => {
        window.clearTimeout(timer);
        fail(new Error("Чат: нет связи"));
      };
      ws.onmessage = (ev) => {
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
        window.clearTimeout(timer);
        this.ws = null;
        this.authed = false;
        if (!settled) {
          fail(new Error("Чат: соединение закрыто"));
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
    this.authed = false;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }
}
