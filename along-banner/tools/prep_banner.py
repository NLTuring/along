"""Banner art from the official event KV (7000x3938):
  bg.png     full-banner background at KV pixel scale (2.5:1 -> 9845x3938): the KV's right part (sketch Pearl Tower,
             orange band, lattice, skyline, halftone) with the KV's own title text cleaned off, the band filled to the
             crop edge, and the flat grey + bottom mesh strip continued periodically to the left edge.
  techweek.png / qutansuo.png   the two organiser logos cut from the KV's mesh strip with real alpha.
Prints the geometry the HTML needs, in banner CSS px (2500 x 1000, 1 px = 0.4 mm).   python prep_banner.py"""
import json
import os
import sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "assets"
sys.stdout.reconfigure(encoding="utf-8")
Image.MAX_IMAGE_PIXELS = None
KV_PATH = Path(os.environ.get("ALONG_KV", A / "src/official-kv-7000.png"))
if not KV_PATH.exists():
    sys.exit(f"未找到活动主视觉：{KV_PATH}。请设置 ALONG_KV 指向本地文件。")
kv = np.asarray(Image.open(KV_PATH).convert("RGB")).copy()
H, W = kv.shape[:2]
BG = np.array([232, 234, 236], np.uint8)
OR = np.array([248, 127, 71], np.uint8)
STRIP = 3038            # first row of the bottom mesh strip
BAND = (1799, 2612)     # band rows [top, bottom)
SLOPE = 0.394           # band left edge: x decreases this much per row going down
EDGE_AT_2500 = 3909.43  # band left edge x on row 2500
X0 = 3500               # scene crop starts here (KV x)
PERIOD = 120            # mesh repeat, px
K = 1000 / H            # banner CSS px per KV px
BW = round(2500 / K)    # banner width in KV px

# 1. The strip is continued left by repeating one 120 px column block taken right at the seam, so that block must
#    repeat cleanly into its neighbour (the mesh drifts slowly across the KV, so only the local repeat matters).
a, b = kv[STRIP:, X0:X0 + PERIOD].astype(int), kv[STRIP:, X0 + PERIOD:X0 + 2 * PERIOD].astype(int)
print("mesh local repeat residual: mean %.2f (of 255)" % np.abs(a - b).mean())

# 2. Clean the KV title text that reaches into the crop: blobs left of the tower, above the band and strip.
reg = kv[:STRIP, X0:4700].astype(int)
mask = (np.abs(reg - BG).max(axis=2) > 6).astype(np.uint8)
n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
text = np.zeros_like(mask)
for i in range(1, n):
    x, y, w, h, a = stats[i]
    if X0 + x + w <= 4300 and y + h <= 2100 and a > 50:  # title glyphs; the tower blob is wider
        text[lab == i] = 1
text = cv2.dilate(text, np.ones((9, 9), np.uint8))
kv[:STRIP, X0:4700][text > 0] = BG
print("cleaned text pixels:", int(text.sum()))

# 3. Extend the band to the crop edge (the banner draws its own slanted end further left).
for y in range(*BAND):
    xe = EDGE_AT_2500 + (2500 - y) * SLOPE
    kv[y, X0:int(np.ceil(xe)) + 2] = OR

# Nothing but flat grey may remain left of the band edge above the strip.
left = kv[:BAND[0], X0:4300].astype(int)
print("non-flat pixels left above band:", int((np.abs(left - BG).max(axis=2) > 2).sum()))

# 4. Full-banner background: flat grey + periodic mesh to the left, the cleaned KV crop on the right.
bg = np.empty((H, BW, 3), np.uint8)
bg[:] = BG
xs = BW - (W - X0)
cols = X0 + ((np.arange(xs) - xs) % PERIOD)
bg[STRIP:, :xs] = kv[STRIP:, cols]
bg[:, xs:] = kv[:, X0:]
Image.fromarray(bg).save(A / "bg.png", optimize=True)
Image.fromarray(bg).resize((BW // 8, H // 8), Image.LANCZOS).save(ROOT / "work/bg-check.jpg", quality=88)
print("bg.png", bg.shape[1], "x", bg.shape[0], "scene starts at", xs)

# 5. Organiser logos. The mesh behind them is not strictly periodic across the KV, so treat it as one flat colour
#    and project each pixel toward the nearest logo ink; the mesh's own +-25 wobble is cut by the alpha floor.
src = np.asarray(Image.open(KV_PATH).convert("RGB")).astype(np.float32)
mesh_c = np.median(src[3395:3605, 350:700].reshape(-1, 3), axis=0)
print("mesh colour", mesh_c.round(1))


def bbox(x0, x1, y0=STRIP + 150, y1=H - 150, pad=10):
    reg = src[y0:y1, x0:x1]
    ink = (reg.min(2) < 150) | (reg.max(2) - reg.min(2) > 60)
    ys, xs_ = np.where(ink)
    return x0 + xs_.min() - pad, y0 + ys.min() - pad, x0 + xs_.max() + 1 + pad, y0 + ys.max() + 1 + pad


def cut(name, box, inks):
    x0, y0, x1, y1 = box
    obs = src[y0:y1, x0:x1]
    best_a = np.zeros(obs.shape[:2], np.float32)
    best_r = np.full(obs.shape[:2], 1e9, np.float32)
    best_c = np.zeros(obs.shape, np.float32)
    for c in inks:
        v = c - mesh_c
        a = np.clip(((obs - mesh_c) * v).sum(2) / (v @ v), 0, 1.2)
        r = np.linalg.norm(obs - (mesh_c + a[..., None] * v), axis=2)
        better = r < best_r
        best_r[better], best_a[better] = r[better], a[better]
        best_c[better] = c
    alpha = np.clip((best_a - .2) / (.85 - .2), 0, 1)
    rgba = np.dstack([best_c, alpha * 255]).round().clip(0, 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(A / name, optimize=True)
    print(name, x1 - x0, "x", y1 - y0, "box", box)
    return (x1 - x0) / (y1 - y0)


tw_box = bbox(780, 2120)    # TECH WEEK · HONGQIAO | 虹桥国际科技周
qt_box = bbox(2260, 3420)   # 去探索
reg = src[tw_box[1]:tw_box[3], tw_box[0]:tw_box[2]].reshape(-1, 3)
sat = reg.max(1) - reg.min(1)
orange = np.median(reg[sat > 150], axis=0)
navy = np.median(reg[(reg.max(1) < 90) & (reg[:, 2] > reg[:, 0] + 12)], axis=0)
reg = src[qt_box[1]:qt_box[3], qt_box[0]:qt_box[2]].reshape(-1, 3)
black = np.median(reg[reg.max(1) < 70], axis=0)
print("inks orange", orange, "navy", navy, "black", black)

geo = {"k": K, "bandTop": BAND[0] * K, "bandBottom": BAND[1] * K, "slope": SLOPE,
       "sceneLeft": xs * K, "stripTop": STRIP * K, "meshPeriod": PERIOD * K,
       "techweekAspect": cut("techweek.png", tw_box, [orange, navy]),
       "qutansuoAspect": cut("qutansuo.png", qt_box, [black])}
(A / "geometry.json").write_text(json.dumps(geo, indent=1), encoding="utf8")
print(json.dumps(geo, indent=1))
