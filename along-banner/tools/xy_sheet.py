"""Side-by-side of 小游 variants in place on the banner (same crop around the mascot).
   python xy_sheet.py assets/a.svg assets/b.svg ...   -> work/xy-sheet.png"""
import functools
import http.server
import socketserver
import sys
import threading
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
HEADLESS = None  # 可选：指向本机 chrome-headless-shell；None 使用 Playwright 自带浏览器
CROP = (1060, 150, 1900, 900)  # banner CSS px
SCALE = 1.4


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(ROOT)))
threading.Thread(target=httpd.serve_forever, daemon=True).start()
tiles = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=HEADLESS)
    pg = b.new_page(viewport={"width": 2500, "height": 1000}, device_scale_factor=SCALE)
    for v in sys.argv[1:]:
        pg.goto(f"http://127.0.0.1:{httpd.server_address[1]}/banner.html?xy={v}")
        pg.evaluate("document.fonts.ready")
        pg.wait_for_function("[...document.images].every(i => i.complete && i.naturalWidth > 0)")
        pg.wait_for_timeout(300)
        out = ROOT / "work" / f"xy-{Path(v).stem}.png"
        pg.screenshot(path=str(out), clip={"x": CROP[0], "y": CROP[1], "width": CROP[2] - CROP[0], "height": CROP[3] - CROP[1]})
        tiles.append(Image.open(out))
    b.close()
httpd.shutdown()
w, h = tiles[0].size
sheet = Image.new("RGB", (w * len(tiles) + 16 * (len(tiles) - 1), h), "white")
for i, t in enumerate(tiles):
    sheet.paste(t, (i * (w + 16), 0))
sheet.save(ROOT / "work/xy-sheet.png")
print("work/xy-sheet.png", sheet.size, [Path(v).stem for v in sys.argv[1:]])
