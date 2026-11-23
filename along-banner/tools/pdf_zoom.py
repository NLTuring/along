"""Render one region of the print PDF at high DPI next to the same region of the PNG, to judge what the PDF's
rasterised fallbacks look like at print size.   python pdf_zoom.py x0 y0 x1 y1 [dpi]   (banner CSS px)"""
import sys
from pathlib import Path
import pymupdf
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
NAME = "Along一起游_团队横幅_1000x400mm"
sys.stdout.reconfigure(encoding="utf-8")
Image.MAX_IMAGE_PIXELS = None
x0, y0, x1, y1 = [float(v) for v in sys.argv[1:5]]
dpi = int(sys.argv[5]) if len(sys.argv) > 5 else 300
pg = pymupdf.open(ROOT / "out" / f"{NAME}.pdf")[0]
print("font types:", sorted({f[2] for f in pg.get_fonts()}))
pt = 0.4 / 25.4 * 72  # banner px -> PDF points
pix = pg.get_pixmap(dpi=dpi, clip=pymupdf.Rect(x0 * pt, y0 * pt, x1 * pt, y1 * pt))
pdf = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
f = 5906 / 2500
png = Image.open(ROOT / "out" / f"{NAME}_150dpi.png").convert("RGB").crop(tuple(round(v * f) for v in (x0, y0, x1, y1)))
png = png.resize(pdf.size, Image.LANCZOS)
sheet = Image.new("RGB", (pdf.width * 2 + 20, pdf.height), "white")
sheet.paste(pdf, (0, 0))
sheet.paste(png, (pdf.width + 20, 0))
sheet.save(ROOT / "work" / "z-pdf-vs-png.png")
print("work/z-pdf-vs-png.png  left = PDF @", dpi, "dpi, right = PNG export (150 dpi, upscaled)", sheet.size)
