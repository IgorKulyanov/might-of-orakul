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

  connect(token: string, onMessage: (m: ServerMsg) => void): Promise<void> {
    this.onMsg = onMessage;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(resolveChatWsUrl());
      this.ws = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "hello", token }));
        resolve();
      };
      ws.onerror = () => reject(new Error("Чат: нет связи"));
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as ServerMsg;
          this.onMsg?.(msg);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        this.ws = null;
      };
    });
  }

  say(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Чат офлайн");
    }
    this.ws.send(JSON.stringify({ type: "say", text }));
  }

  report(msgId: string, reason?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "report", msgId, reason }));
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }
}
