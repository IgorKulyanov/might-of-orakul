import type {
  PvpAction,
  PvpClientMsg,
  PvpServerMsg,
} from "./pvpProtocol";

import { getWsOrigin, VPS_PUBLIC_ORIGIN } from "./api";

function wsCandidates(): string[] {
  const primary = `${getWsOrigin()}/ws/pvp`;
  const direct = `${VPS_PUBLIC_ORIGIN.replace(/^http/, "ws")}/ws/pvp`;
  const sameOrigin =
    typeof window !== "undefined"
      ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/pvp`
      : "";
  const out: string[] = [];
  for (const u of [primary, direct, sameOrigin]) {
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
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
  private onDrop: (() => void) | null = null;
  private closedByUser = false;
  private token: string | null = null;

  setHandler(onMessage: (m: PvpServerMsg) => void) {
    this.onMsg = onMessage;
  }

  /** Обрыв не по leave() — лобби может само переподключиться. */
  setDropHandler(onDrop: (() => void) | null) {
    this.onDrop = onDrop;
  }

  /** token кладём и в query — на части сетей тело первого пакета теряется. */
  connect(token: string, onMessage: (m: PvpServerMsg) => void): Promise<void> {
    this.onMsg = onMessage;
    this.token = token;
    this.closedByUser = false;
    const urls = wsCandidates();
    let i = 0;
    const tryNext = (): Promise<void> => {
      if (i >= urls.length) {
        return Promise.reject(
          new Error("Нет связи с сервером PvP. Обнови страницу (Ctrl+F5)."),
        );
      }
      const base = urls[i++]!;
      return this.openOne(base).catch(() => tryNext());
    };
    return tryNext();
  }

  private openOne(baseUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const q = this.token
        ? `?token=${encodeURIComponent(this.token)}`
        : "";
      const url = `${baseUrl}${q}`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        reject(e instanceof Error ? e : new Error("WebSocket fail"));
        return;
      }
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
        if (this.ws === ws) this.ws = null;
        reject(new Error("Таймаут PvP"));
      }, 8_000);
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
        if (this.ws === ws) this.ws = null;
        reject(new Error("WebSocket: нет связи"));
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
        if (this.ws === ws) this.ws = null;
        if (this.closedByUser || !settled) return;
        if (this.onDrop) {
          this.onDrop();
          return;
        }
        this.onMsg?.({
          type: "error",
          message: "Связь оборвалась. Обнови страницу.",
        });
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

  /**
   * @param silent — только закрыть сокет (reconnect в лобби).
   * Иначе серверу уходит leave и комната снимается.
   */
  leave(opts?: { silent?: boolean }) {
    this.closedByUser = true;
    this.onDrop = null;
    if (!opts?.silent) {
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
    }
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  rollDice() {
    this.send({ type: "roll_dice" });
  }

  action(action: PvpAction) {
    this.send({ type: "action", action });
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
