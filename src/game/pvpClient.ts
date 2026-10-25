import type {
  PvpAction,
  PvpClientMsg,
  PvpServerMsg,
} from "./pvpProtocol";

function resolveWsUrl(): string {
  const env = (import.meta.env.VITE_API_URL as string | undefined)?.replace(
    /\/$/,
    "",
  );
  if (env) {
    const u = new URL(env);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    u.pathname = "/ws/pvp";
    u.search = "";
    u.hash = "";
    return u.toString();
  }
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws/pvp`;
  }
  return "ws://127.0.0.1:8787/ws/pvp";
}

export type PvpJoinPayload = {
  code: string;
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
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("WebSocket: нет связи с сервером"));
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

  ready() {
    this.send({ type: "ready" });
  }

  leave() {
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
