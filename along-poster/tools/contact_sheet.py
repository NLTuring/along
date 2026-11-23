"""Labelled contact sheet of captured screens, for choosing what goes on the poster.
python contact_sheet.py <dir> <out.jpg> [thumb_width] [columns]"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
tw = int(sys.argv[3]) if len(sys.argv) > 3 else 260
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 8
files = sorted(f for f in src.glob("*.png"))
thumbs = []
for f in files:
    im = Image.open(f).convert("RGB")
    h = min(int(im.height * tw / im.width), int(tw * 2.4))
    im = im.resize((tw, int(im.height * tw / im.width)), Image.LANCZOS).crop((0, 0, tw, h))
    thumbs.append((f.stem, im))
row_h = [max(t[1].height for t in thumbs[i:i + cols]) + 34 for i in range(0, len(thumbs), cols)]
sheet = Image.new("RGB", (cols * (tw + 12) + 12, sum(row_h) + 12), (40, 40, 40))
d = ImageDraw.Draw(sheet)
font = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 15)
y = 12
for r in range(len(row_h)):
    for c, (name, im) in enumerate(thumbs[r * cols:(r + 1) * cols]):
        x = 12 + c * (tw + 12)
        sheet.paste(im, (x, y))
        d.text((x, y + im.height + 6), name, fill=(240, 240, 240), font=font)
    y += row_h[r]
sheet.save(dst, quality=88)
print(dst, sheet.size, len(thumbs), "screens")
