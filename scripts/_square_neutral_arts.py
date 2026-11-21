"""Crop tall neutral starter arts to 768x768 like the rest of the card set.

Heads sit near the top of the tall PNGs — pad the square so helmets aren't clipped.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / "public" / "cards" / "нетральные существа"

# pad_top: fraction of square reserved above the portrait (headroom).
JOBS = [
    ("озорница.png", "озорница.jpg", 0.08),
    ("бывалый.png", "бывалый.jpg", 0.18),
    ("страж_ворот.png", "страж_ворот.jpg", 0.16),
]


def main() -> None:
    for src_name, out_name, pad_frac in JOBS:
        src = Image.open(DIR / src_name).convert("RGB")
        w, h = src.size
        side = min(w, h)
        pad_top = max(0, int(side * pad_frac))
        content_h = side - pad_top

        # Top strip of the tall art, scaled to square width.
        strip = src.crop((0, 0, w, min(h, int(h * content_h / side))))
        strip = strip.resize((side, content_h), Image.Resampling.LANCZOS)

        # Fill headroom with colour sampled from the sky/top edge.
        sample = src.crop((0, 0, w, min(8, h))).resize((1, 1))
        fill = sample.getpixel((0, 0))
        canvas = Image.new("RGB", (side, side), fill)
        canvas.paste(strip, (0, pad_top))

        out = DIR / out_name
        canvas.resize((768, 768), Image.Resampling.LANCZOS).save(
            out, "JPEG", quality=90, optimize=True
        )
        print(f"OK {out_name} pad={pad_frac:.0%}")


if __name__ == "__main__":
    main()
