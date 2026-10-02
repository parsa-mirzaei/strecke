"""Phase 0 build: inject the Sheet README into the spike Apps Script and draw the PWA icons.

Usage: python tools/phase0/build_spike.py
Writes build/spike/Code.gs (gitignored) and spike/web/icon-*.png.
The learner context comes from data/private/learner-context.txt (gitignored) and only ever
lands in the generated script and the private Sheet, never in a committed file.
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
CONTEXT = ROOT / "data" / "private" / "learner-context.txt"
PAPER = (246, 243, 236)
INK = (28, 27, 25)


def build_gs():
    context = CONTEXT.read_text(encoding="utf-8").strip() if CONTEXT.exists() else "- (none given)"
    readme = (ROOT / "docs" / "sheet-readme.md").read_text(encoding="utf-8")
    lines = readme.replace("{{LEARNER_CONTEXT}}", context).splitlines()
    tpl = (ROOT / "spike" / "apps-script" / "Code.template.gs").read_text(encoding="utf-8")
    out = tpl.replace("/*README_LINES*/[]", json.dumps(lines, ensure_ascii=False, indent=2))
    dest = ROOT / "build" / "spike" / "Code.gs"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(out, encoding="utf-8")


def icon(size: int, maskable: bool):
    img = Image.new("RGB", (size, size), PAPER)
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype("C:/Windows/Fonts/georgia.ttf", int(size * (0.5 if maskable else 0.62)))
    box = d.textbbox((0, 0), "S", font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((size - w) / 2 - box[0], (size - h) / 2 - box[1]), "S", font=font, fill=INK)
    name = f"icon-{size}{'-maskable' if maskable else ''}.png"
    img.save(ROOT / "spike" / "web" / name)


if __name__ == "__main__":
    build_gs()
    for s in (192, 512):
        icon(s, False)
    icon(512, True)
    print("ok")
