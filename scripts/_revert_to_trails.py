#!/usr/bin/env python3
"""Вернуть аккаунт в тропы школ через /api/admin/back-to-trails."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

ADMIN_KEY = os.environ.get("ORACUL_ADMIN_KEY", "792640")
LOGIN = os.environ.get("ORACUL_WIPE_LOGIN", "kulyanov87yandex.ru")
BASES = [
    os.environ.get("ORACUL_API", "").rstrip("/"),
    "https://157.22.204.47.sslip.io",
    "https://might-of-orakul.pages.dev",
    "http://157.22.204.47:8787",
]
BASES = [b for b in BASES if b]


def call(base: str, method: str, path: str, body: dict | None = None):
    data = None
    headers = {"x-admin-key": ADMIN_KEY, "accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["content-type"] = "application/json"
    req = urllib.request.Request(
        f"{base}{path}", data=data, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            raw = resp.read().decode("utf-8", "replace")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw) if raw else {"error": str(e)}
        except json.JSONDecodeError:
            return e.code, {"error": raw}
    except Exception as e:
        return 0, {"error": str(e)}


def main() -> None:
    last = None
    for base in BASES:
        code, data = call(base, "POST", "/api/admin/back-to-trails", {"login": LOGIN})
        print(base, code, data)
        last = (code, data)
        if code == 200:
            print("OK")
            return
        # endpoint ещё не задеплоен
        if code == 404:
            continue
    raise SystemExit(f"failed: {last}")


if __name__ == "__main__":
    main()
