"""QR code for the app's web build as a filled vector path (one rectangle per run of dark modules, no strokes),
so it stays solid at any scale in both the PNG and the PDF.   python qr.py [url]"""
import sys
from pathlib import Path
import segno

ROOT = Path(__file__).resolve().parent.parent
URL = sys.argv[1] if len(sys.argv) > 1 else "https://tokennext.top/along/"
qr = segno.make(URL, error="m")
rows = [list(r) for r in qr.matrix]
n = len(rows)
d = []
for y, row in enumerate(rows):
    x = 0
    while x < n:
        if row[x]:
            run = 1
            while x + run < n and row[x + run]:
                run += 1
            d.append(f"M{x} {y}h{run}v1h-{run}z")
            x += run
        else:
            x += 1
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}"><path fill="#1D1D1F" d="{"".join(d)}"/></svg>'
(ROOT / "assets/qr-along.svg").write_text(svg, encoding="utf8")
print("qr-along.svg", URL, f"version {qr.version} {qr.error}", f"{n}x{n} modules")
