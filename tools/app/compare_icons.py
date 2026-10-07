"""Extract the nine comparison pictograms from Tabler and Phosphor for app/dev/compare.html (DECISIONS D49).
The output file is gitignored: third-party comparison data stays on the machine that made it.

Used once for the design comparison page only; neither set ships in the app. Each SVG is parsed and
reduced to shape elements with geometry attributes, so nothing executable can come along.

Usage:
    npm pack @tabler/icons@3.49.0 @phosphor-icons/core@2.1.1 --ignore-scripts   # then extract both
    python tools/app/compare_icons.py <tabler package dir> <phosphor package dir>
"""
import json
import pathlib
import sys
import xml.etree.ElementTree as ET

SHAPES = {'path', 'circle', 'ellipse', 'line', 'polygon', 'polyline', 'rect'}
GEOMETRY = {'d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'width', 'height', 'points'}

# Lucide name -> (Tabler outline name, Phosphor regular name)
SET = {
    'bus': ('bus', 'bus'),
    'id-card': ('id', 'identification-card'),
    'file-text': ('file-text', 'file-text'),
    'receipt': ('receipt', 'receipt'),
    'pill': ('pill', 'pill'),
    'calendar': ('calendar', 'calendar'),
    'house': ('home', 'house'),
    'graduation-cap': ('school', 'graduation-cap'),
    'banknote': ('cash', 'money'),
}


def nodes(svg_path: pathlib.Path) -> list:
    root = ET.parse(svg_path).getroot()
    out = []
    for el in root.iter():
        tag = el.tag.split('}')[-1]
        if tag == 'svg':
            continue
        if tag not in SHAPES:
            sys.exit(f'{svg_path.name}: <{tag}> not allowed')
        if el.get('stroke') == 'none':  # Tabler's invisible bounding box
            continue
        out.append([tag, {k: v for k, v in el.attrib.items() if k in GEOMETRY}])
    return out


def main(tabler: str, phosphor: str) -> None:
    t, p = pathlib.Path(tabler), pathlib.Path(phosphor)
    data = {
        'tabler': {k: nodes(t / 'icons/outline' / f'{v[0]}.svg') for k, v in SET.items()},
        'phosphor': {k: nodes(p / 'assets/regular' / f'{v[1]}.svg') for k, v in SET.items()},
    }
    target = pathlib.Path(__file__).resolve().parents[2] / 'app/dev/compare-icons.json'
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8', newline='\n')
    print('->', target)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
