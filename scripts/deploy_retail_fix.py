#!/usr/bin/env python3
"""Upload retail server/game fixes to VPS and smoke-check API."""
import os
import socket
import time
from pathlib import Path

import paramiko

HOST = "157.22.204.47"
PASSWD = os.environ.get("ORACUL_ROOT_PASS", "Asdfgh12345!")
ROOT = Path(__file__).resolve().parents[1]

FILES = [
    ("server/index.js", "/opt/orakul/server/index.js"),
    ("server/security.js", "/opt/orakul/server/security.js"),
    ("server/admin.js", "/opt/orakul/server/admin.js"),
    ("server/lobbyChat.ts", "/opt/orakul/server/lobbyChat.ts"),
    ("server/pvpRooms.ts", "/opt/orakul/server/pvpRooms.ts"),
    ("server/main.ts", "/opt/orakul/server/main.ts"),
    ("server/mail.js", "/opt/orakul/server/mail.js"),
    ("server/package.json", "/opt/orakul/server/package.json"),
    ("src/game/cards.ts", "/opt/orakul/src/game/cards.ts"),
    ("src/game/botDeck.ts", "/opt/orakul/src/game/botDeck.ts"),
    ("src/game/engine.ts", "/opt/orakul/src/game/engine.ts"),
    ("src/game/types.ts", "/opt/orakul/src/game/types.ts"),
    ("src/game/mana.ts", "/opt/orakul/src/game/mana.ts"),
]


def run(t: paramiko.Transport, cmd: str, timeout: int = 120) -> str:
    chan = t.open_session()
    chan.settimeout(timeout)
    chan.exec_command(cmd)
    out = b""
    err = b""
    while True:
        if chan.recv_ready():
            out += chan.recv(65535)
        if chan.recv_stderr_ready():
            err += chan.recv_stderr(65535)
        if chan.exit_status_ready() and not chan.recv_ready() and not chan.recv_stderr_ready():
            break
        time.sleep(0.05)
    text = out.decode("utf-8", "replace")
    print(">>>", cmd[:160])
    print(text[-2500:])
    if err:
        e = err.decode("utf-8", "replace")
        if "npm warn" not in e:
            print("ERR", e[-800:])
    return text


def main() -> None:
    last: Exception | None = None
    for attempt in range(1, 6):
        try:
            print(f"attempt {attempt}")
            sock = socket.create_connection((HOST, 22), timeout=30)
            t = paramiko.Transport(sock)
            t.banner_timeout = 60
            t.auth_timeout = 60
            t.start_client(timeout=60)
            t.auth_password("root", PASSWD)
            sftp = paramiko.SFTPClient.from_transport(t)
            assert sftp is not None
            for rel, remote in FILES:
                remote_dir = str(Path(remote).parent).replace("\\", "/")
                run(t, f"mkdir -p {remote_dir}")
                sftp.put(str(ROOT / rel), remote)
                print("uploaded", rel)
            sftp.close()
            run(
                t,
                "cd /opt/orakul/server && npm install --omit=dev 2>&1 | tail -n 15",
            )
            # Пока нет боевой почты — DEV-коды (см. EMAIL-AUTH.md). Не трогаем, если drop-in уже есть.
            run(
                t,
                "mkdir -p /etc/systemd/system/orakul-api.service.d; "
                "if [ ! -f /etc/systemd/system/orakul-api.service.d/mail.conf ]; then "
                "printf '%s\\n' '[Service]' "
                "'Environment=ORACUL_MAIL_DEV=1' "
                "'Environment=MAIL_FROM=Might of Orakul <noreply@localhost>' "
                "> /etc/systemd/system/orakul-api.service.d/mail.conf; "
                "echo 'created mail.conf DEV'; else echo 'mail.conf exists'; fi; "
                # Код компенсации — только на сервере (не в git-клиенте).
                "if [ ! -f /etc/systemd/system/orakul-api.service.d/owner.conf ]; then "
                "printf '%s\\n' '[Service]' "
                "'Environment=ORACUL_OWNER_CODE=оракул792640' "
                "> /etc/systemd/system/orakul-api.service.d/owner.conf; "
                "chmod 600 /etc/systemd/system/orakul-api.service.d/owner.conf; "
                "echo 'created owner.conf'; else echo 'owner.conf exists'; fi; "
                "systemctl daemon-reload",
            )
            run(t, "systemctl restart orakul-api; sleep 3; systemctl is-active orakul-api")
            run(t, "journalctl -u orakul-api -n 20 --no-pager")
            run(t, "curl -sS -m 8 http://127.0.0.1:8787/api/health; echo")
            run(t, "curl -sS -m 8 http://127.0.0.1:8787/api/payments/packs; echo")
            t.close()
            print("DEPLOY_OK")
            return
        except Exception as e:
            last = e
            print("fail", type(e).__name__, e)
            time.sleep(3 * attempt)
    raise SystemExit(last)


if __name__ == "__main__":
    main()
