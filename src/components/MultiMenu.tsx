import { useEffect, useRef, useState } from "react";
import { PvpSocket } from "../game/pvpClient";
import {
  PVP_MATCH_LEVEL_DELTA,
  type PvpSeat,
  type PvpServerMsg,
} from "../game/pvpProtocol";
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
    openingDice?: { you: number; foe: number; youFirst: boolean };
    openingLocked?: boolean;
  }) => void;
};

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
  const [busyHint, setBusyHint] = useState<string | null>(null);
  const lobbyWaitRef = useRef<number | null>(null);
  const [searching, setSearching] = useState<{
    levelMin: number;
    levelMax: number;
  } | null>(null);
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
  const searchPulse = useRef(0);
  const [, setTick] = useState(0);

  const clearLobbyWait = () => {
    if (lobbyWaitRef.current != null) {
      window.clearTimeout(lobbyWaitRef.current);
      lobbyWaitRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearLobbyWait();
      socketRef.current?.leave();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!searching) return;
    const id = window.setInterval(() => {
      searchPulse.current += 1;
      setTick((n) => n + 1);
    }, 900);
    return () => window.clearInterval(id);
  }, [searching]);

  const handleMsg = (msg: PvpServerMsg) => {
    if (msg.type === "error") {
      clearLobbyWait();
      setMessage(msg.message);
      setBusy(false);
      setBusyHint(null);
      setSearching(null);
      return;
    }
    if (msg.type === "queued") {
      clearLobbyWait();
      setSearching({ levelMin: msg.levelMin, levelMax: msg.levelMax });
      setBusy(false);
      setBusyHint(null);
      setMessage(null);
      setLobby(null);
      return;
    }
    if (msg.type === "queue_cancelled") {
      clearLobbyWait();
      setSearching(null);
      setBusy(false);
      setBusyHint(null);
      return;
    }
    if (msg.type === "lobby") {
      clearLobbyWait();
      setSearching(null);
      setLobby({
        code: msg.code,
        youAre: msg.youAre,
        hostName: msg.hostName,
        guestName: msg.guestName,
        hostReady: msg.hostReady,
        guestReady: msg.guestReady,
      });
      setBusy(false);
      setBusyHint(null);
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
      setSearching(null);
      // Отдаём сокет в бой — иначе unmount MultiMenu вызовет leave() и оборвёт PvP.
      const sock = socketRef.current;
      socketRef.current = null;
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
        openingDice: msg.openingDice,
        openingLocked: msg.openingLocked,
      });
    }
  };

  const ensureSocket = async () => {
    socketRef.current?.leave();
    const sock = new PvpSocket();
    socketRef.current = sock;
    await sock.connect(handleMsg);
    return sock;
  };

  const findOpponent = async () => {
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
      const sock = await ensureSocket();
      sock.queue({
        token,
        heroId,
        deck,
        name: displayName,
        level: playerLevel,
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка связи");
      setBusy(false);
      setSearching(null);
    }
  };

  const cancelSearch = () => {
    try {
      socketRef.current?.cancelQueue();
    } catch {
      /* ignore */
    }
    socketRef.current?.leave();
    socketRef.current = null;
    setSearching(null);
    setBusy(false);
    setMessage(null);
  };

  const enterRoom = async (mode: "create" | "join", roomCode = "") => {
    const token = getToken();
    if (!token) {
      setMessage("Нужен вход");
      return;
    }
    if (deck.length < 4) {
      setMessage("Собери колоду в кабинете (минимум 4 карты)");
      return;
    }
    if (canStartPvp && !canStartPvp()) return;
    if (mode === "join" && roomCode.trim().length < 3) {
      setMessage("Введи код комнаты");
      return;
    }
    clearLobbyWait();
    setBusy(true);
    setBusyHint(
      mode === "create"
        ? "Создаём комнату…"
        : "Входим в комнату…",
    );
    setMessage(null);
    setSearching(null);
    startedRef.current = false;
    try {
      const sock = await ensureSocket();
      setBusyHint(
        mode === "create"
          ? "Ждём код от сервера…"
          : "Ждём ответ сервера…",
      );
      sock.join({
        mode,
        ...(mode === "join" ? { code: roomCode.trim() } : {}),
        token,
        heroId,
        deck,
        name: displayName,
        level: playerLevel,
      });
      lobbyWaitRef.current = window.setTimeout(() => {
        setBusy(false);
        setBusyHint(null);
        setMessage(
          "Сервер не ответил. Обнови страницу (Ctrl+F5) и попробуй снова.",
        );
        try {
          socketRef.current?.leave();
        } catch {
          /* ignore */
        }
        socketRef.current = null;
      }, 12_000);
    } catch (err) {
      clearLobbyWait();
      setMessage(err instanceof Error ? err.message : "Ошибка связи");
      setBusy(false);
      setBusyHint(null);
    }
  };

  const leaveLobby = () => {
    socketRef.current?.leave();
    socketRef.current = null;
    setLobby(null);
    setMessage(null);
    setSearching(null);
    startedRef.current = false;
  };

  const readyUp = () => {
    try {
      socketRef.current?.ready();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const levelLo = Math.max(1, playerLevel - PVP_MATCH_LEVEL_DELTA);
  const levelHi = Math.min(50, playerLevel + PVP_MATCH_LEVEL_DELTA);
  const dots = ".".repeat((searchPulse.current % 3) + 1);

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
          <p className="hint" style={{ textAlign: "center", marginBottom: 0 }}>
            Код комнаты — скажи другу:
          </p>
          <p className="multi-room-code" aria-label="Код комнаты">
            {lobby.code}
          </p>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(lobby.code).then(
                () => setMessage("Код скопирован"),
                () => setMessage(`Код: ${lobby.code}`),
              );
            }}
          >
            Скопировать код
          </button>
          <p className="hint">
            Ты —{" "}
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

  if (searching) {
    return (
      <div className="multi-screen" aria-label="Поиск соперника">
        <header className="page-bar">
          <button type="button" className="ghost" onClick={cancelSearch}>
            ← Отмена
          </button>
          <h1>Поиск</h1>
          <span />
        </header>
        <div className="multi-panel multi-panel-search">
          <p className="multi-search-title">Ищем живого оракула{dots}</p>
          <p className="hint">
            Уровни{" "}
            <strong>
              {searching.levelMin}–{searching.levelMax}
            </strong>{" "}
            (±{PVP_MATCH_LEVEL_DELTA} к твоему {playerLevel}). Как только
            найдётся — бой начнётся сам.
          </p>
          <div className="multi-search-orb" aria-hidden>
            <span />
          </div>
          <button type="button" className="ghost large" onClick={cancelSearch}>
            Отменить поиск
          </button>
          <button type="button" className="ghost large" onClick={onFightBot}>
            Пока сыграть с ботом
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
          Главное — дуэль с живым игроком рядом по силе (ур. {levelLo}–
          {levelHi}). Бот и комнаты по коду — запасные пути.
        </p>

        <button
          type="button"
          className="cta-live large"
          disabled={busy}
          onClick={() => void findOpponent()}
        >
          <span className="cta-live-kicker">Онлайн</span>
          <span className="cta-live-title">Найти соперника</span>
          <span className="cta-live-sub">
            ±{PVP_MATCH_LEVEL_DELTA} ур. · равный бой
          </span>
        </button>

        <button type="button" className="primary large" onClick={onFightBot}>
          Бой с ботом (ур. ~{Math.min(50, playerLevel + 1)})
        </button>

        <div className="multi-divider" aria-hidden>
          <span>или с другом</span>
        </div>

        <button
          type="button"
          className="ghost large"
          disabled={busy}
          onClick={() => void enterRoom("create")}
        >
          {busy && busyHint?.includes("Создаём")
            ? busyHint
            : "Создать комнату (PvP)"}
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
          onClick={() => void enterRoom("join", code.trim())}
        >
          {busy && busyHint?.includes("Входим")
            ? busyHint
            : "Войти по коду"}
        </button>

        {busyHint && <p className="multi-busy-hint">{busyHint}</p>}
        {message && <p className="auth-error">{message}</p>}
      </div>
    </div>
  );
}
