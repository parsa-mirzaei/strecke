"""Draw the Strecke app icons: a route line with two stops on night blue.

Usage: python tools/app/make_icons.py         ->  app/public/icon-192.png, icon-512.png, icon-512-maskable.png
       python tools/app/make_icons.py --next  ->  app/public-next/…: the Next channel's icons, amber with a NEXT
                                                  mark, so the two installed apps never look alike
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

NEXT = "--next" in sys.argv
OUT = Path(__file__).resolve().parents[2] / "app" / ("public-next" if NEXT else "public")
BG = (242, 169, 0) if NEXT else (14, 22, 33)
LINE = (20, 24, 34) if NEXT else (230, 236, 242)
ACCENT = (255, 255, 255) if NEXT else (92, 200, 190)


def draw(size: int, safe: float) -> Image.Image:
    s = size * 4  # supersample, then downscale for smooth curves
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)
    pad = s * (1 - safe) / 2
    box = s - 2 * pad

    def p(x: float, y: float) -> tuple[float, float]:
        return (pad + x * box, pad + y * box)

    # Cubic Bezier from bottom-left stop to top-right stop, like the in-app route icon.
    pts = []
    a, b, c, e = (0.24, 0.78), (0.24, 0.40), (0.76, 0.60), (0.76, 0.22)
    if NEXT:  # route lifted to make room for the NEXT band
        a, b, c, e = (0.24, 0.62), (0.24, 0.30), (0.76, 0.46), (0.76, 0.12)
    for i in range(101):
        t = i / 100
        x = (1 - t) ** 3 * a[0] + 3 * (1 - t) ** 2 * t * b[0] + 3 * (1 - t) * t ** 2 * c[0] + t ** 3 * e[0]
        y = (1 - t) ** 3 * a[1] + 3 * (1 - t) ** 2 * t * b[1] + 3 * (1 - t) * t ** 2 * c[1] + t ** 3 * e[1]
        pts.append(p(x, y))
    d.line(pts, fill=LINE, width=int(box * 0.07), joint="curve")
    r1, r2 = box * 0.085, box * 0.075
    x1, y1 = p(*a)
    d.ellipse([x1 - r1, y1 - r1, x1 + r1, y1 + r1], fill=ACCENT)
    x2, y2 = p(*e)
    d.ellipse([x2 - r2, y2 - r2, x2 + r2, y2 + r2], fill=BG, outline=LINE, width=int(box * 0.05))
    if NEXT:
        # A dark band with NEXT across the lower part of the safe zone.
        font = next_font(int(box * 0.16))
        w = d.textlength("NEXT", font=font)
        bx0, by0, bx1, by1 = p(0.14, 0.78) + p(0.86, 0.98)
        d.rounded_rectangle([bx0, by0, bx1, by1], radius=box * 0.04, fill=LINE)
        d.text(((bx0 + bx1 - w) / 2, (by0 + by1) / 2), "NEXT", font=font, fill=BG, anchor="lm")
    return img.resize((size, size), Image.LANCZOS)


def next_font(px: int):
    for name in ("arialbd.ttf", "DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, px)
        except OSError:
            pass
    return ImageFont.load_default(size=px)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    draw(192, 0.82).save(OUT / "icon-192.png")
    draw(512, 0.82).save(OUT / "icon-512.png")
    draw(512, 0.62).save(OUT / "icon-512-maskable.png")
    print("ok")
