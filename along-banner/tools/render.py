"""Render banner.html to print files: 1000 x 400 mm vector PDF, 150 DPI PNG (5906 x 2362) and a preview JPG,
after checking fonts, images and the 30 mm safe margin.   python render.py [page.html] [output-name]"""
import functools
import http.server
import socketserver
import sys
import threading
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
PAGE = sys.argv[1] if len(sys.argv) > 1 else "banner.html"
NAME = sys.argv[2] if len(sys.argv) > 2 else "Along一起游_团队横幅_1000x400mm"
HEADLESS = None  # 可选：指向本机 chrome-headless-shell；None 使用 Playwright 自带浏览器
W_MM, H_MM, DPI = 1000, 400, 150
PX_W, PX_H = round(W_MM / 25.4 * DPI), round(H_MM / 25.4 * DPI)   # 5906 x 2362
SAFE = 75  # CSS px = 30 mm
CHECK = """(safe) => {
  const out = [], W = 2500, H = 1000;
  for (const sel of ['.ev', '.team', '.ttl', '.slg', '.eng', '.fts', '.org', '.qr', '.bub', '.xy']) {
    const e = document.querySelector(sel); if (!e) { out.push('MISSING ' + sel); continue; }
    const r = e.getBoundingClientRect();
    const bad = r.left < safe - 8 || r.top < safe - 16 || r.right > W - safe || r.bottom > H - safe;
    out.push(`${bad ? 'OUTSIDE SAFE ' : ''}${sel} x ${Math.round(r.left)}..${Math.round(r.right)} y ${Math.round(r.top)}..${Math.round(r.bottom)}`);
  }
  for (const e of document.querySelectorAll('.ttl > *, .slg, .eng, .fts li, .bub b, .bub span, .trk'))
    if (e.scrollWidth - e.clientWidth > 1) out.push('overflow ' + e.className + ' ' + e.innerText.slice(0, 20));
  const fonts = [...document.fonts].map(f => f.family + ' ' + f.weight + ':' + f.status); out.push('fonts ' + fonts.join(', '));
  const broken = [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.src);
  if (broken.length) out.push('BROKEN ' + broken.join(' '));
  return out;
}"""


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    handler = functools.partial(Quiet, directory=str(ROOT))
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


sys.stdout.reconfigure(encoding="utf-8")
OUT.mkdir(exist_ok=True)
httpd = serve()
url = f"http://127.0.0.1:{httpd.server_address[1]}/{PAGE}"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=HEADLESS) if Path(HEADLESS).exists() else p.chromium.launch()
    pg = b.new_page(viewport={"width": 2500, "height": 1000}, device_scale_factor=PX_W / 2500)
    pg.goto(url)
    pg.evaluate("document.fonts.ready")
    pg.wait_for_function("[...document.images].every(i => i.complete)")
    pg.wait_for_timeout(800)
    print("\n".join(pg.evaluate(CHECK, SAFE)))
    raw = OUT / f"{NAME}.raw.png"
    pg.screenshot(path=str(raw))
    # 2500 CSS px must land on 1000 mm (= 3779.5 px at 96 dpi).
    pg.pdf(path=str(OUT / f"{NAME}.pdf"), width=f"{W_MM}mm", height=f"{H_MM}mm", print_background=True,
           scale=W_MM / 25.4 * 96 / 2500, margin={"top": "0", "right": "0", "bottom": "0", "left": "0"}, page_ranges="1")
    b.close()
httpd.shutdown()

im = Image.open(raw).convert("RGB")
print("raw", im.size)
im = im.crop((0, 0, PX_W, PX_H))
im.save(OUT / f"{NAME}_150dpi.png", dpi=(DPI, DPI), optimize=True)
im.resize((2400, round(2400 * PX_H / PX_W)), Image.LANCZOS).save(OUT / f"{NAME}_预览.jpg", quality=90)
raw.unlink()
print("saved", OUT / f"{NAME}_150dpi.png", im.size)
