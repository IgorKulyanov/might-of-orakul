#!/usr/bin/env python3
"""
Живой диагноз: два WS → очередь → бой → endTurn / карта.
Печатает, кто какой battleSeq получил и совпал ли active/yourTurn у обоих.
"""
from __future__ import annotations

import json
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
from uuid import uuid4

try:
    import websocket
except ImportError:
    import subprocess

    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "websocket-client", "-q"]
    )
    import websocket

API = "https://157.22.204.47.sslip.io"
WS = "wss://157.22.204.47.sslip.io/ws/pvp"
DECK = [
    "skeleton",
    "skeleton",
    "skeleton",
    "skeleton",
    "mage",
    "tank",
    "zombie",
    "zombie",
]
SSLOPT = {"cert_reqs": ssl.CERT_NONE}


def http(path, method="GET", body=None, token=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        API + path,
        data=data,
        method=method,
        headers={
            "Content-Type": "application/json",
            **({"Authorization": f"Bearer {token}"} if token else {}),
        },
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"error": raw}


def register(tag: str):
    login = f"sync_{tag}_{uuid4().hex[:8]}"
    password = "TestPass123!"
    email = f"{login}@example.com"
    status, data = http(
        "/api/register",
        "POST",
        {
            "login": login,
            "password": password,
            "displayName": tag[:20],
            "email": email,
        },
    )
    if status >= 400 or not data.get("token"):
        status, data = http(
            "/api/login", "POST", {"login": login, "password": password}
        )
    token = data.get("token")
    if not token:
        raise SystemExit(f"auth fail {tag} {status} {data}")
    return token


class PvpProbe:
    def __init__(self, name: str, token: str):
        self.name = name
        self.token = token
        self.ws = websocket.create_connection(
            f"{WS}?token={token}", sslopt=SSLOPT, timeout=20
        )
        self.ws.settimeout(0.3)
        self.msgs: list[dict] = []
        self.battles: list[dict] = []
        self.errors: list[str] = []
        self._lock = threading.Lock()
        self._stop = False
        self._thr = threading.Thread(target=self._reader, daemon=True)
        self._thr.start()
        self._wait_type("hello", 10)

    def _reader(self):
        while not self._stop:
            try:
                raw = self.ws.recv()
            except Exception:
                time.sleep(0.05)
                continue
            if not raw:
                continue
            try:
                msg = json.loads(raw)
            except Exception as e:
                with self._lock:
                    self.errors.append(f"bad json: {e}")
                continue
            with self._lock:
                self.msgs.append(msg)
                if msg.get("type") == "battle":
                    self.battles.append(msg)
                    st = msg.get("state") or {}
                    print(
                        f"  [{self.name}] battle seq={msg.get('battleSeq')} "
                        f"youAre={msg.get('youAre')} yourTurn={msg.get('yourTurn')} "
                        f"active={st.get('active')} turn={st.get('turn')} "
                        f"log0={(st.get('log') or ['?'])[0][:70]!r}"
                    )
                elif msg.get("type") == "error":
                    self.errors.append(str(msg.get("message")))
                    print(f"  [{self.name}] ERROR {msg.get('message')}")
                elif msg.get("type") in ("queued", "ended", "peer_left"):
                    print(f"  [{self.name}] {msg.get('type')} {msg}")

    def _wait_type(self, typ: str, timeout: float):
        end = time.time() + timeout
        while time.time() < end:
            with self._lock:
                for m in self.msgs:
                    if m.get("type") == typ:
                        return m
            time.sleep(0.05)
        raise SystemExit(f"{self.name}: no {typ}")

    def send(self, obj: dict):
        self.ws.send(json.dumps(obj))

    def queue(self):
        self.send(
            {
                "type": "queue",
                "token": self.token,
                "heroId": "hero_death",
                "deck": DECK,
                "name": self.name,
                "level": 5,
            }
        )

    def wait_battle(self, after: int = 0, timeout: float = 20) -> dict:
        end = time.time() + timeout
        while time.time() < end:
            with self._lock:
                if len(self.battles) > after:
                    return self.battles[-1]
                err = list(self.errors)
            if err and after == 0:
                # keep waiting — queue errors possible
                pass
            time.sleep(0.05)
        with self._lock:
            types = [m.get("type") for m in self.msgs[-12:]]
            errs = list(self.errors)
            n = len(self.battles)
        raise SystemExit(
            f"{self.name}: no battle after={after} have={n} errs={errs} last={types}"
        )

    def last_battle(self) -> dict:
        with self._lock:
            return self.battles[-1] if self.battles else {}

    def last_state(self) -> dict:
        return (self.last_battle().get("state") or {})

    def battle_count(self) -> int:
        with self._lock:
            return len(self.battles)

    def close(self):
        self._stop = True
        try:
            self.send({"type": "leave"})
        except Exception:
            pass
        try:
            self.ws.close()
        except Exception:
            pass


def snapshot(label: str, a: PvpProbe, b: PvpProbe):
    sa, sb = a.last_state(), b.last_state()
    ba, bb = a.last_battle(), b.last_battle()

    def slots(side):
        return sum(1 for x in ((side or {}).get("slots") or []) if x)

    print(
        f"== {label} ==\n"
        f"  {a.name}: yourTurn={ba.get('yourTurn')} active={sa.get('active')} turn={sa.get('turn')} "
        f"youSlots={slots(sa.get('you'))} enemySlots={slots(sa.get('enemy'))} seq={ba.get('battleSeq')}\n"
        f"  {b.name}: yourTurn={bb.get('yourTurn')} active={sb.get('active')} turn={sb.get('turn')} "
        f"youSlots={slots(sb.get('you'))} enemySlots={slots(sb.get('enemy'))} seq={bb.get('battleSeq')}"
    )


def main() -> int:
    print("health", http("/api/health"))
    print("auth…")
    t1, t2 = register("Alpha"), register("Beta")
    a, b = PvpProbe("Alpha", t1), PvpProbe("Beta", t2)
    print("queue…")
    a.queue()
    time.sleep(0.4)
    b.queue()

    ba0 = a.wait_battle(0, 25)
    bb0 = b.wait_battle(0, 25)
    snapshot("start", a, b)

    first = a if ba0.get("yourTurn") else b
    second = b if first is a else a
    print(f"first={first.name} second={second.name}")

    n_first = first.battle_count()
    n_second = second.battle_count()

    print(f"\n>> {first.name} endTurn")
    first.send({"type": "action", "action": {"kind": "endTurn"}})
    time.sleep(2.0)

    try:
        first.wait_battle(n_first, 10)
    except SystemExit as e:
        print("FAIL first no echo after own endTurn:", e)
        return 2
    try:
        second.wait_battle(n_second, 10)
    except SystemExit as e:
        print("FAIL second got NO battle after foe endTurn:", e)
        print("ROOT: broadcast/payload не доходит до ожидающего")
        return 3

    snapshot("after first endTurn", a, b)
    if not second.last_battle().get("yourTurn"):
        print("FAIL second.yourTurn still false")
        print("ROOT: applySeatAction/endTurn не сменил active на сервере")
        return 4
    print("OK turn passed to second")

    st = second.last_state()
    hand = (st.get("you") or {}).get("hand") or []
    print(f"\n>> {second.name} playCard hand={len(hand)} mana={(st.get('you') or {}).get('mana')}")
    n_first = first.battle_count()
    n_second = second.battle_count()
    played = False
    for hi in range(min(5, len(hand))):
        second.send(
            {
                "type": "action",
                "action": {"kind": "playCard", "handIndex": hi, "slotIndex": 0},
            }
        )
        time.sleep(1.3)
        if second.battle_count() > n_second:
            # check if error or real
            if second.errors:
                print("  error after play", second.errors[-1])
                second.errors.clear()
                n_second = second.battle_count()
                continue
            played = True
            break

    if played:
        try:
            first.wait_battle(n_first, 10)
        except SystemExit as e:
            print("FAIL first did not see foe playCard:", e)
            print("ROOT: ожидающий не получает чужие действия")
            return 5
        snapshot("after second playCard", a, b)
        enemy_slots = sum(
            1 for x in ((first.last_state().get("enemy") or {}).get("slots") or []) if x
        )
        you_slots_second = sum(
            1
            for x in ((second.last_state().get("you") or {}).get("slots") or [])
            if x
        )
        if you_slots_second < 1:
            print("WARN second has no slot after play — maybe spell/reject")
        elif enemy_slots < 1:
            print("FAIL first.enemySlots=0 while second placed a unit")
            print("ROOT: flip/viewForSeat — чужая карта не на стороне enemy у оппонента")
            return 6
        else:
            print("OK first sees enemy unit")
    else:
        print("WARN could not confirm playCard, continue")

    n_first = first.battle_count()
    n_second = second.battle_count()
    print(f"\n>> {second.name} endTurn")
    second.send({"type": "action", "action": {"kind": "endTurn"}})
    time.sleep(2.0)
    try:
        first.wait_battle(n_first, 10)
    except SystemExit as e:
        print("FAIL first did not get turn back:", e)
        return 7
    snapshot("after second endTurn", a, b)
    if not first.last_battle().get("yourTurn"):
        print("FAIL first.yourTurn false after second endTurn")
        print("ROOT: обратная передача хода сломана")
        return 9

    print("\nPASS server delivers actions+endTurn to BOTH sockets")
    a.close()
    b.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
