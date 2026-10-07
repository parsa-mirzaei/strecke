"""Copy the Lucide icons Strecke uses into app/src/ui/icons.ts, as plain data (DECISIONS D44, D49).

Only the listed icons are bundled. Every node is checked against an allow-list of SVG shape elements
and geometry attributes, so no script, event handler, href or style can come along.

Usage (from the repo root):
    npm pack lucide-static@1.52.0 --ignore-scripts      # into a scratch folder, then extract it
    python tools/app/build_icons.py <path-to-extracted>/package
"""
import json
import pathlib
import re
import sys

UI_ICONS = ['volume-2']  # icons the interface uses; add here when a screen needs one

ALLOWED_TAGS = {'path', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'rect'}
ALLOWED_ATTRS = {'d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height', 'points', 'fill'}
SAFE_VALUE = re.compile(r'^[0-9a-zA-Z .,\-]*$')

ROOT = pathlib.Path(__file__).resolve().parents[2]


def image_keys() -> list[str]:
    """The pictogram allow-list lives in core/src/schema.ts (IMAGE_KEYS)."""
    src = (ROOT / 'core/src/schema.ts').read_text(encoding='utf-8')
    block = src[src.index('export const IMAGE_KEYS = ['):]
    block = block[:block.index('] as const')]
    return re.findall(r"'([a-z0-9-]+)'", block)


def main(pkg_dir: str) -> None:
    pkg = pathlib.Path(pkg_dir)
    meta = json.loads((pkg / 'package.json').read_text(encoding='utf-8'))
    if meta.get('name') != 'lucide-static' or meta.get('license') != 'ISC':
        sys.exit('not the lucide-static package')
    nodes = json.loads((pkg / 'icon-nodes.json').read_text(encoding='utf-8'))
    names = sorted(set(UI_ICONS + image_keys()))
    out: dict[str, list] = {}
    for name in names:
        if name not in nodes:
            sys.exit(f'missing icon: {name}')
        clean = []
        for tag, attrs in nodes[name]:
            if tag not in ALLOWED_TAGS:
                sys.exit(f'{name}: element <{tag}> not allowed')
            for k, v in attrs.items():
                if k not in ALLOWED_ATTRS or not SAFE_VALUE.match(str(v)):
                    sys.exit(f'{name}: attribute {k}="{v}" not allowed')
            clean.append([tag, attrs])
        out[name] = clean
    body = json.dumps(out, ensure_ascii=True, separators=(',', ':'))
    target = ROOT / 'app/src/ui/icons.ts'
    target.write_text(
        '/**\n'
        f' * Lucide icons, copied from lucide-static {meta["version"]} by tools/app/build_icons.py. Do not edit.\n'
        ' * Lucide: ISC License, Copyright (c) 2026 Lucide Icons and Contributors. Icons derived from Feather:\n'
        ' * MIT License, Copyright (c) 2013-present Cole Bemis. Full texts in NOTICE.md.\n'
        ' * Each icon is a list of [element, attributes] on a 24x24 grid, drawn with a 2 px round stroke.\n'
        ' */\n'
        f'export const ICONS: Record<string, [string, Record<string, string>][]> = {body};\n',
        encoding='utf-8', newline='\n')
    print(f'{len(out)} icons -> {target.relative_to(ROOT)}')


if __name__ == '__main__':
    main(sys.argv[1])
