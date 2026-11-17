#!/usr/bin/env python3
"""
Агентский ловчик PvP — жёстко, быстро, с точным кодом.

1) GET /api/pvp-canary  (~мс) — логика стола / передача хода / видимость карты
2) GET /api/health      — последний watchdog canary
3) journalctl [pvp:FAIL] с VPS — живые поломки в бою
4) (опц.) живой 2-WS turn-sync, если canary OK но нужен провод

Запуск: python scripts/diag_pvp_catch.py
        python scripts/diag_pvp_catch.py --live
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API = "https://157.22.204.47.sslip.io"
ROOT = Path(__file__).resolve().parent


def http_json(path: str, timeout: float = 15):
    req = urllib.request.Request(
        API + path,
        headers={"Accept": "application/json"},
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"ok": False, "code": "HTTP", "detail": raw[:300]}


def pull_fail_journal() -> str:
    try:
        import paramiko
    except ImportError:
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "paramiko", "-q"]
        )
        import paramiko

    host = "157.22.204.47"
    passwd = os.environ.get("ORACUL_ROOT_PASS", "Asdfgh12345!")
    sock = socket.create_connection((host, 22), timeout=20)
    t = paramiko.Transport(sock)
    t.banner_timeout = 60
    t.start_client(timeout=60)
    t.auth_password("root", passwd)
    cmd = r"""
echo COMMIT=$(cd /opt/orakul && git log -1 --oneline)
journalctl -u orakul-api --since '30 min ago' --no-pager | grep -E '\[pvp:(FAIL|OK)\]' | tail -50
"""
    chan = t.open_session()
    chan.settimeout(45)
    chan.exec_command(cmd)
    out = b""
    while True:
        if chan.recv_ready():
            out += chan.recv(65535)
        if chan.recv_stderr_ready():
            out += chan.recv_stderr(65535)
        if (
            chan.exit_status_ready()
            and not chan.recv_ready()
            and not chan.recv_stderr_ready()
        ):
            break
        time.sleep(0.05)
    t.close()
    return out.decode("utf-8", "replace")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--live",
        action="store_true",
        help="После canary ещё прогнать 2-WS turn-sync",
    )
    args = ap.parse_args()

    print("=== 1) /api/pvp-canary ===")
    t0 = time.time()
    status, canary = http_json("/api/pvp-canary", timeout=20)
    print(f"http={status} {json.dumps(canary, ensure_ascii=False)} ({(time.time()-t0)*1000:.0f}ms)")

    print("\n=== 2) /api/health.pvpCanary ===")
    _, health = http_json("/api/health", timeout=15)
    print(json.dumps(health.get("pvpCanary"), ensure_ascii=False))

    print("\n=== 3) journal [pvp:FAIL|OK] ===")
    try:
        journal = pull_fail_journal()
        print(journal if journal.strip() else "(пусто)")
    except Exception as e:
        print("journal fail:", e)
        journal = ""

    if not canary.get("ok"):
        print("\n======== VERDICT ========")
        print(
            f"ROOT: PVP_LOGIC code={canary.get('code')} detail={canary.get('detail')}"
        )
        print("Стол/ход/видимость карты сломаны на сервере — чинить applySeatAction/viewForSeat.")
        return 2

    fails = [ln for ln in journal.splitlines() if "[pvp:FAIL]" in ln]
    if fails:
        print("\n======== VERDICT ========")
        print("ROOT: LIVE_FAIL — canary логики OK, но в journal есть FAIL за 30м:")
        for ln in fails[-8:]:
            print(" ", ln)
        print("Смотри code= в строках (ENDTURN_NOOP / PEER_WS_DEAD / ACTION_OUT_OF_TURN / WS_SEND).")
        return 3

    if args.live:
        print("\n=== 4) live 2-WS turn-sync ===")
        sys.path.insert(0, str(ROOT))
        import diag_pvp_turn_sync as sync

        sync.WS = "wss://157.22.204.47.sslip.io/ws/pvp"
        try:
            live = int(sync.main())
        except SystemExit as e:
            live = int(e.code) if isinstance(e.code, int) else 1
        if live != 0:
            print("\n======== VERDICT ========")
            print(f"ROOT: LIVE_WS code={live} — доставка по WebSocket (см. diag_pvp_turn_sync).")
            return 4

    print("\n======== VERDICT ========")
    print("PASS: логика стола OK, свежих [pvp:FAIL] нет")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
