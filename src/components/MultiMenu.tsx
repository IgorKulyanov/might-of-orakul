import { useEffect, useRef, useState } from "react";
import { PvpSocket } from "../game/pvpClient";
import type { PvpSeat, PvpServerMsg } from "../game/pvpProtocol";
import { getToken } from "../game/session";
import type { BattleState } from "../game/types";

type Props = {
  playerLevel: number;
  heroId: string;
  displayName: string;
  deck: string[];
  onBack: () => void;
  /** Бой с ботом уровня игрока ±1 */
  onFightBot: () => void;
  /** Перед созданием/входом в комнату (бан за побеги). */
  canStartPvp?: () => boolean;
  /** Живой PvP начался */
  onPvpStart: (ctx: {
    socket: PvpSocket;
    state: BattleState;
    youAre: PvpSeat;
    code: string;
    turnEndsAt: number | null;
    yourTimeouts: number;
    foeTimeouts: number;
    maxTimeouts: number;
    turnLimitSec: number;
  }) => void;
};

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return s;
}

export function MultiMenu({
  playerLevel,
  heroId,
  displayName,
  deck,
  onBack,
  onFightBot,
  canStartPvp,
  onPvpStart,
}: Props) {
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lobby, setLobby] = useState<{
    code: string;
    youAre: PvpSeat;
    hostName: string | null;
    guestName: string | null;
    hostReady: boolean;
    guestReady: boolean;
  } | null>(null);
  const socketRef = useRef<PvpSocket | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    return () => {
      socketRef.current?.leave();
      socketRef.current = null;
    };
  }, []);

  const handleMsg = (msg: PvpServerMsg) => {
    if (msg.type === "error") {
      setMessage(msg.message);
      setBusy(false);
      return;
    }
    if (msg.type === "lobby") {
      setLobby({
        code: msg.code,
        youAre: msg.youAre,
        hostName: msg.hostName,
        guestName: msg.guestName,
        hostReady: msg.hostReady,
        guestReady: msg.guestReady,
      });
      setBusy(false);
      setMessage(null);
      return;
    }
    if (msg.type === "peer_left") {
      setMessage(msg.message);
      setLobby((prev) =>
        prev
          ? {
              ...prev,
              guestName: prev.youAre === "host" ? null : prev.guestName,
              hostName: prev.youAre === "guest" ? null : prev.hostName,
              hostReady: false,
              guestReady: false,
            }
          : prev,
      );
      return;
    }
    if (msg.type === "battle" && !startedRef.current) {
      startedRef.current = true;
      const sock = socketRef.current;
      if (!sock) return;
      onPvpStart({
        socket: sock,
        state: msg.state,
        youAre: msg.youAre,
        code: msg.code,
        turnEndsAt: msg.turnEndsAt,
        yourTimeouts: msg.yourTimeouts,
        foeTimeouts: msg.foeTimeouts,
        maxTimeouts: msg.maxTimeouts,
        turnLimitSec: msg.turnLimitSec,
      });
    }
  };

  const enterRoom = async (roomCode: string) => {
    const token = getToken();
    if (!token) {
      setMessage("Нужен вход");
      return;
    }
    if (deck.length < 4) {
      setMessage("Собери колоду в кабинете");
      return;
    }
    if (canStartPvp && !canStartPvp()) return;
    setBusy(true);
    setMessage(null);
    startedRef.current = false;
    try {
      socketRef.current?.leave();
      const sock = new PvpSocket();
      socketRef.current = sock;
      await sock.connect(handleMsg);
      sock.join({
        code: roomCode,
        token,
        heroId,
        deck,
        name: displayName,
        level: playerLevel,
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка связи");
      setBusy(false);
    }
  };

  const leaveLobby = () => {
    socketRef.current?.leave();
    socketRef.current = null;
    setLobby(null);
    setMessage(null);
    startedRef.current = false;
  };

  const readyUp = () => {
    try {
      socketRef.current?.ready();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка");
    }
  };

  if (lobby) {
    const peerName =
      lobby.youAre === "host" ? lobby.guestName : lobby.hostName;
    const youReady =
      lobby.youAre === "host" ? lobby.hostReady : lobby.guestReady;
    const peerReady =
      lobby.youAre === "host" ? lobby.guestReady : lobby.hostReady;

    return (
      <div className="multi-screen" aria-label="Комната PvP">
        <header className="page-bar">
          <button type="button" className="ghost" onClick={leaveLobby}>
            ← Выйти
          </button>
          <h1>Комната</h1>
          <span />
        </header>
        <div className="multi-panel">
          <p className="multi-room-code" aria-label="Код комнаты">
            {lobby.code}
          </p>
          <p className="hint">
            Скажи код другу. Ты —{" "}
            <strong>{lobby.youAre === "host" ? "хост" : "гость"}</strong>.
            Когда оба нажмут «Готов» — начнётся бой.
          </p>
          <div className="multi-lobby-status">
            <div>
              <em>Ты</em>
              <strong>
                {displayName} {youReady ? "· готов" : "· ждёт"}
              </strong>
            </div>
            <div>
              <em>Соперник</em>
              <strong>
                {peerName
                  ? `${peerName} ${peerReady ? "· готов" : "· в комнате"}`
                  : "ещё нет…"}
              </strong>
            </div>
          </div>
          {message && <p className="hint">{message}</p>}
          <button
            type="button"
            className="primary large"
            disabled={youReady || !peerName}
            onClick={readyUp}
          >
            {!peerName
              ? "Ждём соперника…"
              : youReady
                ? "Ждём готовности…"
                : "Готов!"}
          </button>
          <button type="button" className="ghost large" onClick={onFightBot}>
            Вместо этого — бой с ботом
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="multi-screen" aria-label="Одиночный бой">
      <header className="page-bar">
        <button type="button" className="ghost" onClick={onBack}>
          ← Меню
        </button>
        <h1>Одиночный бой</h1>
        <span />
      </header>

      <div className="multi-panel">
        <p className="hint">
          Быстрый бой с ботом (±1 к твоему уровню) или дуэль с другом по коду.
          В PvP награды выше; ход 20 сек, 5 пропусков = поражение, выход =
          сдача.
        </p>

        <button type="button" className="primary large" onClick={onFightBot}>
          Бой с ботом (ур. ~{Math.min(50, playerLevel + 1)})
        </button>

        <button
          type="button"
          className="ghost large"
          disabled={busy}
          onClick={() => enterRoom(randomCode())}
        >
          Создать комнату (PvP)
        </button>

        <label>
          Код комнаты
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            placeholder="ABC123"
          />
        </label>
        <button
          type="button"
          className="ghost large"
          disabled={busy || code.trim().length < 3}
          onClick={() => enterRoom(code.trim())}
        >
          Войти по коду
        </button>

        {message && <p className="hint">{message}</p>}
      </div>
    </div>
  );
}
