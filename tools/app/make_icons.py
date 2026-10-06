"""Draw the Strecke app icons: a route line with two stops on night blue.

Usage: python tools/app/make_icons.py  ->  app/public/icon-192.png, icon-512.png, icon-512-maskable.png
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[2] / "app" / "public"
BG = (14, 22, 33)
LINE = (230, 236, 242)
ACCENT = (92, 200, 190)


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
    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    draw(192, 0.82).save(OUT / "icon-192.png")
    draw(512, 0.82).save(OUT / "icon-512.png")
    draw(512, 0.62).save(OUT / "icon-512-maskable.png")
    print("ok")
