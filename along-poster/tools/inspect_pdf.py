from pathlib import Path
import pymupdf

p = Path(__file__).resolve().parents[1] / "out" / "Along一起游_视觉海报_V6_灰黑橙_A3_300DPI.pdf"
d = pymupdf.open(str(p))
pg = d[0]
r = pg.rect
print("PDF page pt", round(r.width, 2), round(r.height, 2))
print("PDF page mm", round(r.width / 72 * 25.4, 2), "x", round(r.height / 72 * 25.4, 2))
txt = pg.get_text("rawdict")
nch = sum(len(s["chars"]) for b in txt["blocks"] if b["type"] == 0 for l in b["lines"] for s in l["spans"])
print("vector text chars", nch)
print("fonts", sorted({f[3] for f in pg.get_fonts()}))
imgs = pg.get_images(full=True)
print("embedded images", len(imgs))
rows = []
for item in imgs:
    xref = item[0]
    info = d.extract_image(xref)
    w, h = info["width"], info["height"]
    for rect in pg.get_image_rects(xref):
        wi, hi = rect.width / 72, rect.height / 72
        for height_hint in (0,):
            pass
        dpi_w = w / wi if wi else 0
        dpi_h = h / hi if hi else 0
        rows.append((round(min(dpi_w, dpi_h)), w, h, info["ext"], len(info["image"]) // 1024,
                     round(wi * 25.4, 1), round(hi * 25.4, 1)))
rows.sort()
print("lowest effective DPI (dpi, px_w, px_h, fmt, KB, mm_w, mm_h):")
for row in rows[:8]:
    print("  ", row)
print("images below 300 dpi:", sum(1 for x in rows if x[0] < 300), "of", len(rows))
