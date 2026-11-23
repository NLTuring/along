"""Find the repeat of the KV's bottom mesh texture so it can be tiled across the banner's left side.
   python texture_period.py"""
import os
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(encoding="utf-8")
KV_PATH = Path(os.environ.get("ALONG_KV", ROOT / "assets/src/official-kv-7000.png"))
if not KV_PATH.exists():
    sys.exit(f"未找到活动主视觉：{KV_PATH}。请设置 ALONG_KV 指向本地文件。")
kv = np.asarray(Image.open(KV_PATH).convert("L")).astype(np.float32)
H, W = kv.shape
s = W / 2000

# Where does the mesh strip start? Row std over a texture-only column band (left of the logos, x 20..200).
cols = slice(int(20 * s), int(200 * s))
std = kv[:, cols].std(axis=1)
rows = np.where(std > 3)[0]
print("rows with texture (x 20..200): first", rows.min(), "last", rows.max(), "of", H)
for y in range(int(840 * s), int(900 * s), 20):
    print(" y", y, "std %.2f mean %.1f" % (std[y], kv[y, cols].mean()))

# Horizontal period: autocorrelation of a texture-only patch.
y0, y1 = int(1060 * s), int(1110 * s)
patch = kv[y0:y1, int(20 * s):int(200 * s)]
p = patch - patch.mean()
best = []
for dx in range(8, 400):
    a, b = p[:, :-dx], p[:, dx:]
    best.append((float((a * b).mean() / (a.std() * b.std() + 1e-6)), dx))
best.sort(reverse=True)
print("x period candidates", best[:8])

# Vertical period near the bottom.
patch = kv[int(1000 * s):int(1120 * s), int(20 * s):int(200 * s)]
p = patch - patch.mean()
bestv = []
for dy in range(8, 300):
    a, b = p[:-dy], p[dy:]
    bestv.append((float((a * b).mean() / (a.std() * b.std() + 1e-6)), dy))
bestv.sort(reverse=True)
print("y period candidates", bestv[:8])
