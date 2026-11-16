import { useEffect, useRef, useState } from "react";
import { apiMe } from "../game/api";
import { getCard } from "../game/cards";
import { PvpSocket } from "../game/pvpClient";
import {
  PVP_MATCH_LEVEL_DELTA,
  pvpQueueBand,
  type PvpSeat,
  type PvpServerMsg,
} from "../game/pvpProtocol";
import { getToken } from "../game/session";
import type { BattleState } from "../game/types";

const LOBBY_KEY = "orakul_pvp_lobby_code";

function saveLobbyCode(code: string | null) {
  try {
    if (!code) sessionStorage.removeItem(LOBBY_KEY);
    else sessionStorage.setItem(LOBBY_KEY, code);
  } catch {
    /* ignore */
  }
}

function inviteUrl(roomCode: string): string {
  try {
    const u = new URL(window.location.href);
    u.search = "";
    u.hash = "";
    u.searchParams.set("pvp", roomCode);
    return u.toString();
  } catch {
    return roomCode;
  }
}

type Props = {
  playerLevel: number;
  heroId: string;
  displayName: string;
  deck: string[];
  /** Код из ссылки ?pvp= */
  initialCode?: string;
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
    needRoll?: boolean;
    youRolled?: boolean;
    foeRolled?: boolean;
  }) => void;
};

export function MultiMenu({
  playerLevel,
  heroId,
  displayName,
  deck,
  initialCode = "",
  onBack,
  onFightBot,
  canStartPvp,
  onPvpStart,
}: Props) {
  const [code, setCode] = useState(() =>
    (initialCode || "").trim().toUpperCase(),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyHint, setBusyHint] = useState<string | null>(null);
  const lobbyWaitRef = useRef<number | null>(null);
  const [searching, setSearching] = useState<{
    levelMin: number;
    levelMax: number;
    delta: number;
    waiting: number;
  } | null>(null);
  const [lobby, setLobby] = useState<{
    code: string;
    youAre: PvpSeat;
    hostName: string | null;
    guestName: string | null;
    hostReady: boolean;
    guestReady: boolean;
    hostOnline: boolean;
    guestOnline: boolean;
  } | null>(null);
  const socketRef = useRef<PvpSocket | null>(null);
  const lobbyRef = useRef(lobby);
  lobbyRef.current = lobby;
  const reconnectingRef = useRef(false);
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
      // Тихий close: жёсткий leave() убивал комнату, пока хост кидал код в Telegram.
      socketRef.current?.leave({ silent: true });
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
      setSearching({
        levelMin: msg.levelMin,
        levelMax: msg.levelMax,
        delta: msg.delta,
        waiting: msg.waiting ?? 0,
      });
      setBusy(false);
      setBusyHint(null);
      setMessage(null);
      setLobby(null);
      return;
    }
    if (msg.type === "queue_update") {
      setSearching((prev) =>
        prev
          ? {
              levelMin: msg.levelMin,
              levelMax: msg.levelMax,
              delta: msg.delta,
              waiting: msg.waiting,
            }
          : prev,
      );
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
      reconnectingRef.current = false;
      setSearching(null);
      saveLobbyCode(msg.code);
      setLobby({
        code: msg.code,
        youAre: msg.youAre,
        hostName: msg.hostName,
        guestName: msg.guestName,
        hostReady: msg.hostReady,
        guestReady: msg.guestReady,
        hostOnline: msg.hostOnline !== false,
        guestOnline: msg.guestOnline !== false,
      });
      setBusy(false);
      setBusyHint(null);
      setMessage(null);
      return;
    }
    if (msg.type === "hello") {
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
        needRoll: msg.needRoll,
        youRolled: msg.youRolled,
        foeRolled: msg.foeRolled,
      });
    }
  };

  const pvpDeck = () => {
    const clean = deck.filter((id) => {
      try {
        getCard(id);
        return true;
      } catch {
        return false;
      }
    });
    return clean;
  };

  const assertSession = async (token: string) => {
    try {
      await apiMe(token);
      return true;
    } catch (e) {
      const status =
        e && typeof e === "object" && "status" in e
          ? Number((e as { status?: number }).status)
          : 0;
      setMessage(
        status === 401 || status === 403
          ? "Ты не на сервере — нажми «Выйти» и войди заново (иначе в комнату не пустит)"
          : "Нет связи с сервером — проверь интернет/VPN и зайди ещё раз",
      );
      return false;
    }
  };

  /** Без авто-восстановления сессий — только ручной вход по коду. */
  const rejoinLobby = async () => {
    reconnectingRef.current = false;
    saveLobbyCode(null);
    setLobby(null);
    setMessage("Связь оборвалась. Создай новую комнату или войди по коду.");
    setBusy(false);
    setBusyHint(null);
  };

  const ensureSocket = async (
    token: string,
    opts?: { silentReplace?: boolean },
  ) => {
    socketRef.current?.setDropHandler(null);
    socketRef.current?.leave(
      opts?.silentReplace ? { silent: true } : undefined,
    );
    const sock = new PvpSocket();
    socketRef.current = sock;
    sock.setDropHandler(() => {
      if (startedRef.current) {
        setMessage("Связь оборвалась. Обнови страницу.");
        return;
      }
      if (lobbyRef.current) {
        void rejoinLobby();
        return;
      }
      setMessage("Связь оборвалась. Обнови страницу.");
      setSearching(null);
      setBusy(false);
    });
    await sock.connect(token, handleMsg);
    return sock;
  };

  // Не авто-rejoin при фокусе — это возвращало в мёртвые/ломаные комнаты.

  const findOpponent = async () => {
    const token = getToken();
    if (!token) {
      setMessage("Нужен вход");
      return;
    }
    const liveDeck = pvpDeck();
    if (liveDeck.length < 4) {
      setMessage("Собери колоду в кабинете (минимум 4 карты)");
      return;
    }
    if (canStartPvp && !canStartPvp()) return;
    setBusy(true);
    setMessage(null);
    startedRef.current = false;
    // Сразу экран поиска — на телефоне иначе «тишина», пока сокет открывается.
    const band = pvpQueueBand(playerLevel, 0);
    setSearching({
      levelMin: band.levelMin,
      levelMax: band.levelMax,
      delta: band.delta,
      waiting: 0,
    });
    try {
      if (!(await assertSession(token))) {
        setBusy(false);
        setSearching(null);
        return;
      }
      const sock = await ensureSocket(token);
      sock.queue({
        token,
        heroId,
        deck: liveDeck,
        name: displayName,
        level: playerLevel,
      });
      setBusy(false);
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
    const liveDeck = pvpDeck();
    if (liveDeck.length < 4) {
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
      if (!(await assertSession(token))) {
        setBusy(false);
        setBusyHint(null);
        return;
      }
      const sock = await ensureSocket(token);
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
        deck: liveDeck,
        name: displayName,
        level: playerLevel,
      });
      lobbyWaitRef.current = window.setTimeout(() => {
        setBusy(false);
        setBusyHint(null);
        setMessage(
          "Сервер не ответил на комнату. Жёстко обнови (Ctrl+F5), выйди и войди в аккаунт, затем снова создай комнату.",
        );
        try {
          socketRef.current?.leave();
        } catch {
          /* ignore */
        }
        socketRef.current = null;
      }, 18_000);
    } catch (err) {
      clearLobbyWait();
      setMessage(err instanceof Error ? err.message : "Ошибка связи");
      setBusy(false);
      setBusyHint(null);
    }
  };

  const leaveLobby = () => {
    reconnectingRef.current = false;
    clearLobbyWait();
    saveLobbyCode(null);
    socketRef.current?.setDropHandler(null);
    socketRef.current?.leave();
    socketRef.current = null;
    setLobby(null);
    setMessage(null);
    setSearching(null);
    setBusy(false);
    setBusyHint(null);
    startedRef.current = false;
  };

  const autoJoinOnce = useRef(false);
  useEffect(() => {
    // Старые коды из sessionStorage больше не поднимаем — только явная ссылка ?pvp=
    saveLobbyCode(null);
    if (autoJoinOnce.current) return;
    const fromLink = (initialCode || "").trim().toUpperCase();
    if (!fromLink) return;
    autoJoinOnce.current = true;
    setCode(fromLink);
    void enterRoom("join", fromLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const peerOnline =
      lobby.youAre === "host" ? lobby.guestOnline : lobby.hostOnline;

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
            Код комнаты — кинь другу в Telegram:
          </p>
          <p className="multi-room-code" aria-label="Код комнаты">
            {lobby.code}
          </p>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(lobby.code).then(
                () => setMessage("Код скопирован — можно свернуть игру"),
                () => setMessage(`Код: ${lobby.code}`),
              );
            }}
          >
            Скопировать код
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              const link = inviteUrl(lobby.code);
              void navigator.clipboard?.writeText(link).then(
                () => setMessage("Ссылка скопирована — кинь в Telegram"),
                () => setMessage(link),
              );
            }}
          >
            Скопировать ссылку для друга
          </button>
          <p className="hint">
            Ты —{" "}
            <strong>{lobby.youAre === "host" ? "хост" : "гость"}</strong>.
            Можно свернуть и отправить код — комната не пропадёт. Когда оба
            нажмут «Готов» — начнётся бой.
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
                  ? `${peerName} ${
                      !peerOnline
                        ? "· офлайн…"
                        : peerReady
                          ? "· готов"
                          : "· в комнате"
                    }`
                  : "ещё нет…"}
              </strong>
            </div>
          </div>
          {message && <p className="hint">{message}</p>}
          {busyHint && <p className="multi-busy-hint">{busyHint}</p>}
          <button
            type="button"
            className="primary large"
            disabled={youReady || !peerName || !peerOnline || busy}
            onClick={readyUp}
          >
            {!peerName
              ? "Ждём соперника…"
              : !peerOnline
                ? "Соперник офлайн…"
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
            </strong>
            {searching.delta >= 49
              ? " (любой, кто в поиске)"
              : ` (±${searching.delta} к твоему ${playerLevel})`}
            . Сначала ближе по силе, потом диапазон сам расширяется. Как
            только найдётся — бой начнётся сам
            {searching.waiting > 0 ? ` · ${searching.waiting} с` : ""}.
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
          Главное — дуэль с живым игроком. Сначала ищем рядом по силе (ур.{" "}
          {levelLo}–{levelHi}), если пусто — диапазон расширяется до любого в
          поиске. Бот и комнаты по коду — запасные пути.
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
            слепой матч · сначала ±{PVP_MATCH_LEVEL_DELTA}
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
        <p
          className="hint"
          style={{ marginTop: 16, opacity: 0.55, fontSize: "0.75rem" }}
          title="Если другой код — у тебя старый кэш. Ctrl+F5"
        >
          билд {typeof __ORAKUL_BUILD__ === "string" ? __ORAKUL_BUILD__ : "?"}
        </p>
      </div>
    </div>
  );
}
