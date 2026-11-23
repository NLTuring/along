"""Look at the official 7000px KV before cutting it up: preview crops into work/ and colour statistics of flat areas.
   python inspect_kv.py"""
import os
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
W_ = ROOT / "work"
sys.stdout.reconfigure(encoding="utf-8")
KV_PATH = Path(os.environ.get("ALONG_KV", ROOT / "assets/src/official-kv-7000.png"))
if not KV_PATH.exists():
    sys.exit(f"未找到活动主视觉：{KV_PATH}。请设置 ALONG_KV 指向本地文件。")
kv = Image.open(KV_PATH).convert("RGB")
W, H = kv.size
s = W / 2000  # coordinates below are read off the 2000-wide reference


def crop(name, box, down):
    x0, y0, x1, y1 = [int(v * s) for v in box]
    im = kv.crop((x0, y0, x1, y1))
    im.resize((max(1, im.width // down), max(1, im.height // down)), Image.LANCZOS).save(W_ / name, quality=90)


crop("i-scene.jpg", (950, 0, 2000, 1125), 4)
crop("i-logos.jpg", (210, 950, 970, 1050), 2)
crop("i-eng.jpg", (80, 240, 1200, 330), 3)
crop("i-band-left.jpg", (1080, 480, 1300, 780), 2)
crop("i-dots-zoom.jpg", (100, 900, 160, 960), 1)
crop("i-lattice-zoom.jpg", (1640, 560, 1760, 680), 1)
crop("i-halftone.jpg", (1500, 740, 2000, 1000), 2)
crop("i-skyline.jpg", (1560, 320, 2000, 520), 2)

a = np.asarray(kv).astype(int)
for nm, (x0, y0, x1, y1) in {"flat-top": (1180, 300, 1240, 360), "flat-mid": (600, 620, 700, 700),
                              "band": (1110, 600, 1180, 700), "dots": (100, 900, 200, 1000),
                              "skyline": (1830, 420, 1850, 500)}.items():
    r = a[int(y0 * s):int(y1 * s), int(x0 * s):int(x1 * s)].reshape(-1, 3)
    print(f"{nm:9s} mean {r.mean(0).round(1)} std {r.std(0).round(2)} min {r.min(0)} max {r.max(0)}")
