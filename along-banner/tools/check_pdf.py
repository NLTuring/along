"""Check the print PDF: one page of exactly 1000 x 400 mm, fonts embedded, image resolution at print size, and a
render of the PDF itself compared against the PNG export.   python check_pdf.py [name]"""
import sys
from pathlib import Path
import fitz
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
NAME = sys.argv[1] if len(sys.argv) > 1 else "Along一起游_团队横幅_1000x400mm"
sys.stdout.reconfigure(encoding="utf-8")
Image.MAX_IMAGE_PIXELS = None
doc = fitz.open(ROOT / "out" / f"{NAME}.pdf")
print("pages", doc.page_count, "| size %.1f x %.1f mm" % (doc[0].rect.width / 72 * 25.4, doc[0].rect.height / 72 * 25.4),
      "| file %.1f MB" % ((ROOT / "out" / f"{NAME}.pdf").stat().st_size / 1e6))
pg = doc[0]
for f in pg.get_fonts():
    print("font", f[3], f[1], "embedded" if f[1] != "n/a" else "NOT EMBEDDED")
for info in pg.get_image_info(xrefs=True):
    w_mm = (info["bbox"][2] - info["bbox"][0]) / 72 * 25.4
    if w_mm < 5:
        continue
    print("image %5dx%-5d placed %6.1f mm wide -> %4.0f dpi" % (info["width"], info["height"], w_mm, info["width"] / (w_mm / 25.4)))
print("text sample:", pg.get_text()[:80].replace("\n", " | "))

# Render the PDF at 60 dpi and compare with the PNG export at the same size.
pix = pg.get_pixmap(dpi=60)
a = np.asarray(Image.frombytes("RGB", (pix.width, pix.height), pix.samples)).astype(int)
png = Image.open(ROOT / "out" / f"{NAME}_150dpi.png").convert("RGB").resize((pix.width, pix.height), Image.LANCZOS)
d = np.abs(a - np.asarray(png).astype(int)).max(axis=2)
print("pdf vs png at 60 dpi: mean diff %.2f, pixels off by >40: %.3f%%" % (d.mean(), (d > 40).mean() * 100))
Image.fromarray(a.astype(np.uint8)).save(ROOT / "work" / "pdf-render-60dpi.jpg", quality=88)

# The QR code must scan from the PDF as well (rendered at 100 dpi, a low print resolution).
import cv2  # noqa: E402
pt = 0.4 / 25.4 * 72
qp = pg.get_pixmap(dpi=100, clip=fitz.Rect(740 * pt, 768 * pt, 906 * pt, 934 * pt))
gray = cv2.cvtColor(np.asarray(Image.frombytes("RGB", (qp.width, qp.height), qp.samples)), cv2.COLOR_RGB2GRAY)
print("QR from PDF @100dpi:", repr(cv2.QRCodeDetector().detectAndDecode(gray)[0]))
