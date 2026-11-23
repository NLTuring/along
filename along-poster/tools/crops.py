"""Crops of the captured screens for the poster's 3D keepsake strip and hero card (boxes in CSS px of the capture).
python crops.py"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
APP, SITE, OUT = ROOT / "assets" / "app", ROOT / "assets" / "site", ROOT / "assets" / "crop"
OUT.mkdir(exist_ok=True)
JOBS = {
    # name: (source, css box x0, y0, x1, y1, device scale)
    "step-paint": (APP / "zh-craft-paint.png", 20, 150, 370, 694, 3),
    "step-relief": (APP / "zh-craft-step4.png", 0, 197, 390, 657, 3),
    "step-tilt": (APP / "zh-craft-tilt-b.png", 50, 262, 300, 606, 3),
    "step-back": (APP / "zh-craft-tilt-a.png", 40, 275, 370, 585, 3),
    "hero-keepsake": (APP / "zh-craft-step4.png", 30, 300, 388, 560, 3),
    "plan-top": (APP / "zh-plan-day1.png", 0, 0, 390, 844, 3),
}
for name, (src, x0, y0, x1, y1, k) in JOBS.items():
    im = Image.open(src).convert("RGB").crop((x0 * k, y0 * k, x1 * k, y1 * k))
    im.save(OUT / f"{name}.png", optimize=True)
    print(name, im.size)
