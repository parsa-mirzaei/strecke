"""Turn the review build (app/dist-review, built with VITE_REVIEW=1) into one self-contained HTML page for a
private claude.ai artifact: JS and CSS inlined, fonts as data URIs, no service worker, demo deck only.

    python tools/app/review_page.py <out.html>
"""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
DIST = ROOT / 'app/dist-review'


def main(out: str) -> None:
    html = (DIST / 'index.html').read_text(encoding='utf-8')
    js_name = re.search(r'src="\./assets/([^"]+\.js)"', html).group(1)
    css_name = re.search(r'href="\./assets/([^"]+\.css)"', html).group(1)
    js = (DIST / 'assets' / js_name).read_text(encoding='utf-8')
    css = (DIST / 'assets' / css_name).read_text(encoding='utf-8')

    def font(m: re.Match) -> str:
        data = base64.b64encode((DIST / 'assets' / m.group(1)).read_bytes()).decode()
        return f'url(data:font/woff2;base64,{data})'

    css = re.sub(r'url\(\.?/?(?:assets/)?([^)"\']+\.woff2)\)', font, css)
    if '.woff2)' in css.replace('base64', ''):
        sys.exit('a font reference was not inlined')
    # Inside the artifact frame the page fills its frame, not the device viewport.
    frame_css = 'html,body{height:100%}#app{height:100%}.app{height:100%}'
    js = js.replace('</script', '<\\/script')
    page = (
        '<title>Strecke Stilprobe</title>\n'
        '<meta name="color-scheme" content="light dark">\n'
        '<meta name="theme-color" content="#F4F0E6">\n'
        f'<style>{css}\n{frame_css}</style>\n'
        '<div id="app"></div>\n'
        f'<script type="module">{js}</script>\n'
    )
    pathlib.Path(out).write_text(page, encoding='utf-8', newline='\n')
    print(out, f'{len(page) / 1024:.0f} KB')


if __name__ == '__main__':
    main(sys.argv[1])
