"""Measure the official KV before cutting: band edges, mesh strip start, and every non-background blob left of
the tower that has to be cleaned out of the scene crop.   python measure_kv.py"""
import os
import sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(encoding="utf-8")
KV_PATH = Path(os.environ.get("ALONG_KV", ROOT / "assets/src/official-kv-7000.png"))
if not KV_PATH.exists():
    sys.exit(f"未找到活动主视觉：{KV_PATH}。请设置 ALONG_KV 指向本地文件。")
kv = np.asarray(Image.open(KV_PATH).convert("RGB")).astype(np.int32)  # cv2 can't open non-ASCII paths
H, W = kv.shape[:2]
BG = np.array([232, 234, 236])
OR = np.array([248, 127, 71])

# Mesh strip start: first row where the column band x 70..700 stops being flat.
flat_rows = (np.abs(kv[:, 70:700] - BG).max(axis=2) <= 2).mean(axis=1)
strip = int(np.argmax((flat_rows < .5) & (np.arange(H) > H // 2)))
print("mesh strip starts at row", strip, "flat share above/below", flat_rows[strip - 1], flat_rows[strip])


def edge(profile, a, b):
    """Sub-pixel position where a 1-D profile crosses halfway between levels a and b."""
    t = (profile - a) / (b - a)
    i = int(np.argmax(t >= .5))
    return i - 1 + (.5 - t[i - 1]) / (t[i] - t[i - 1])


# Band: blue channel goes 236 (bg) -> 71 (orange). Sample columns between the band's left edge and the ball.
for x in (4200, 4250, 4300):
    col = kv[1500:2800, x, 2].astype(float)
    top = 1500 + edge(col, 236, 71)
    bot = 1500 + edge(col[::-1], 236, 71)
    print(f"band at x={x}: top {top:.2f}  bottom {1500 + len(col) - 1 - (bot - 1500):.2f}")

# Band left (slanted) edge on a few rows.
for y in (1820, 1900, 2200, 2500, 2580):
    row = kv[y, 3500:4600, 2].astype(float)
    print(f"band left edge at y={y}: x {3500 + edge(row, 236, 71):.2f}")

# Blobs that are not background in the crop region left of x=4700 and above the strip.
x0, x1 = 3500, 4700
reg = kv[:strip, x0:x1]
mask = ((np.abs(reg - BG).max(axis=2) > 6)).astype(np.uint8)
n, lab, stats, cent = cv2.connectedComponentsWithStats(mask, 8)
print("components:", n - 1)
for i in sorted(range(1, n), key=lambda i: -stats[i, cv2.CC_STAT_AREA])[:40]:
    x, y, w, h, a = stats[i]
    print(f"  #{i:4d} x {x0 + x:5d}..{x0 + x + w:5d}  y {y:5d}..{y + h:5d}  area {a}")
