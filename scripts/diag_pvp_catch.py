#!/usr/bin/env python3
"""
Агентский ловчик PvP: один запуск → точная причина или PASS.

1) Живой 2-WS turn-sync на прямом VPS
2) То же через Pages CF proxy (если доступен)
3) Хвост journalctl [pvp] action с VPS

Exit codes:
  0 PASS
  2..9 — коды из diag_pvp_turn_sync (сервер/доставка)
  10 — VPS journal недоступен (не фатально, если turn-sync PASS)
  20 — Pages proxy FAIL при PASS на прямом VPS (прокси виноват)
"""
from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

import diag_pvp_turn_sync as sync  # noqa: E402


def run_turn_sync(label: str, ws: str) -> int:
    print(f"\n######## {label} ########")
    print("WS", ws)
    sync.WS = ws
    try:
        return int(sync.main())
    except SystemExit as e:
        code = e.code
        return int(code) if isinstance(code, int) else 1
    except Exception as e:
        print("EXCEPTION", e)
        return 1


def pull_journal() -> int:
    print("\n######## VPS journal [pvp] ########")
    try:
        import paramiko
    except ImportError:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "paramiko", "-q"]
        )
        import paramiko

    host = "157.22.204.47"
    passwd = os.environ.get("ORACUL_ROOT_PASS", "Asdfgh12345!")
    try:
        sock = socket.create_connection((host, 22), timeout=20)
        t = paramiko.Transport(sock)
        t.banner_timeout = 60
        t.start_client(timeout=60)
        t.auth_password("root", passwd)
        cmd = r"""
cd /opt/orakul
echo COMMIT=$(git log -1 --oneline)
curl -s --max-time 5 http://127.0.0.1:8787/api/health; echo
journalctl -u orakul-api --since '15 min ago' --no-pager | grep -iE '\[pvp\]' | tail -40
"""
        chan = t.open_session()
        chan.settimeout(60)
        chan.exec_command(cmd)
        out = b""
        err = b""
        while True:
            if chan.recv_ready():
                out += chan.recv(65535)
            if chan.recv_stderr_ready():
                err += chan.recv_stderr(65535)
            if (
                chan.exit_status_ready()
                and not chan.recv_ready()
                and not chan.recv_stderr_ready()
            ):
                break
            time.sleep(0.05)
        print((out + err).decode("utf-8", "replace"))
        t.close()
        return 0
    except Exception as e:
        print("journal pull failed:", e)
        return 10


def main() -> int:
    direct = "wss://157.22.204.47.sslip.io/ws/pvp"
    pages = "wss://might-of-orakul.pages.dev/ws/pvp"

    d = run_turn_sync("DIRECT VPS", direct)
    print("RESULT direct:", d)

    p = run_turn_sync("PAGES CF PROXY", pages)
    print("RESULT pages:", p)

    j = pull_journal()
    print("RESULT journal:", j)

    print("\n======== VERDICT ========")
    if d == 0 and p == 0:
        print("PASS: прямой VPS и Pages proxy оба доставляют ходы")
        return 0
    if d == 0 and p != 0:
        print(
            "ROOT: Pages/CF proxy ломает доставку "
            f"(direct=0 pages={p}). Клиент должен сидеть на sslip."
        )
        return 20
    if d != 0:
        print(f"ROOT: сервер/протокол на прямом VPS (code={d})")
        return d
    return d


if __name__ == "__main__":
    raise SystemExit(main())
