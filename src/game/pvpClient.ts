import type {
  PvpAction,
  PvpClientMsg,
  PvpServerMsg,
} from "./pvpProtocol";

import { getApiBase } from "./api";

function resolveWsUrl(): string {
  if (typeof window !== "undefined") {
    const base = getApiBase();
    if (!base) {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${window.location.host}/ws/pvp`;
    }
    const u = new URL(base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = "/ws/pvp";
    u.search = "";
    u.hash = "";
    return u.toString();
  }
  return "ws://127.0.0.1:8787/ws/pvp";
}

export type PvpJoinPayload = {
  mode?: "create" | "join";
  code?: string;
  token: string;
  heroId: string;
  deck: string[];
  name: string;
  level: number;
};

export type PvpQueuePayload = {
  token: string;
  heroId: string;
  deck: string[];
  name: string;
  level: number;
};

export class PvpSocket {
  private ws: WebSocket | null = null;
  private onMsg: ((m: PvpServerMsg) => void) | null = null;

  setHandler(onMessage: (m: PvpServerMsg) => void) {
    this.onMsg = onMessage;
  }

  connect(onMessage: (m: PvpServerMsg) => void): Promise<void> {
    this.onMsg = onMessage;
    return new Promise((resolve, reject) => {
      const url = resolveWsUrl();
      const ws = new WebSocket(url);
      this.ws = ws;
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        this.ws = null;
        reject(new Error("Нет связи с сервером PvP (таймаут). Обнови страницу."));
      }, 10_000);
      ws.onopen = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(new Error("WebSocket: нет связи с сервером"));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as PvpServerMsg;
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

  private send(msg: PvpClientMsg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Нет связи с комнатой");
    }
    this.ws.send(JSON.stringify(msg));
  }

  join(payload: PvpJoinPayload) {
    this.send({ type: "join", ...payload });
  }

  queue(payload: PvpQueuePayload) {
    this.send({ type: "queue", ...payload });
  }

  cancelQueue() {
    try {
      this.send({ type: "cancel_queue" });
    } catch {
      /* ignore */
    }
  }

  ready() {
    this.send({ type: "ready" });
  }

  leave() {
    try {
      this.send({ type: "cancel_queue" });
    } catch {
      /* ignore */
    }
    try {
      this.send({ type: "leave" });
    } catch {
      /* ignore */
    }
    this.ws?.close();
    this.ws = null;
  }

  action(action: PvpAction) {
    this.send({ type: "action", action });
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
