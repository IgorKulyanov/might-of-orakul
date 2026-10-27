#!/usr/bin/env python3
"""Build public/legal/*.html from markdown agreement."""
from __future__ import annotations

import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MD = ROOT / "public" / "legal" / "polzovatelskoe-soglashenie.md"
OUT = ROOT / "public" / "legal" / "polzovatelskoe-soglashenie.html"


def inline(s: str) -> str:
    parts = re.split(r"(\*\*.+?\*\*)", s)
    buf: list[str] = []
    for p in parts:
        if p.startswith("**") and p.endswith("**") and len(p) >= 4:
            buf.append("<strong>" + html.escape(p[2:-2]) + "</strong>")
        else:
            buf.append(html.escape(p))
    return "".join(buf)


def main() -> None:
    lines = MD.read_text(encoding="utf-8").splitlines()
    out: list[str] = []
    in_list = False

    def close_list() -> None:
        nonlocal in_list
        if in_list:
            out.append("</ul>")
            in_list = False

    for line in lines:
        if line.strip() == "---":
            close_list()
            out.append("<hr/>")
            continue
        if line.startswith("# "):
            close_list()
            out.append(f"<h1>{html.escape(line[2:])}</h1>")
            continue
        if line.startswith("## "):
            close_list()
            out.append(f"<h2>{html.escape(line[3:])}</h2>")
            continue
        if line.startswith("- "):
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{inline(line[2:])}</li>")
            continue
        close_list()
        if not line.strip():
            continue
        out.append(f"<p>{inline(line)}</p>")
    close_list()

    body = "\n".join(out)
    page = f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Пользовательское соглашение — Might of Orakul</title>
  <style>
    :root {{ color-scheme: dark; }}
    body {{
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background: #14110e;
      color: #e8e0d4;
      line-height: 1.55;
    }}
    main {{ max-width: 42rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }}
    h1 {{ font-size: 1.65rem; line-height: 1.25; margin: 0 0 0.5rem; color: #f3ebe0; }}
    h2 {{ font-size: 1.15rem; margin: 2rem 0 0.75rem; color: #f0d9a8; }}
    p {{ margin: 0.55rem 0; }}
    ul {{ margin: 0.4rem 0 0.8rem 1.2rem; padding: 0; }}
    li {{ margin: 0.35rem 0; }}
    hr {{ border: 0; border-top: 1px solid #3a3228; margin: 1.5rem 0; }}
    a.back {{ color: #c4a574; }}
    .meta {{ color: #9a8f80; font-size: 0.92rem; margin-bottom: 1.5rem; }}
  </style>
</head>
<body>
  <main>
    <p class="meta"><a class="back" href="/">← К игре</a></p>
{body}
  </main>
</body>
</html>
"""
    OUT.write_text(page, encoding="utf-8")
    print("wrote", OUT.relative_to(ROOT), "bytes", OUT.stat().st_size)


if __name__ == "__main__":
    main()
