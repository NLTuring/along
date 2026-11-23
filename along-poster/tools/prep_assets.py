"""Poster art from the official event KV (7000x3938): the sketch Pearl Tower scene with its orange band,
skyline and halftone, with the KV's own title text removed (inpainted on its flat background) and a soft left edge.
Also: the band's triangle lattice and the grey halftone as separate textures, the HD Bund photo at poster size,
and the colours sampled from the KV.   python prep_assets.py"""
import json, shutil
from pathlib import Path
import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "assets"
KV = ROOT.parent / "along-banner" / "assets" / "src" / "official-kv-7000.png"
BUND = ROOT.parent / "along-promo" / "public" / "img" / "bund-friends.png"
LOGO = ROOT.parent / "along-promo" / "public" / "img" / "apk" / "brand" / "along-ink.png"

kv = cv2.imread(str(KV), cv2.IMREAD_COLOR)
H, W = kv.shape[:2]
print("KV", W, H)
s = W / 1568  # coordinates below were read off the 1568-wide preview

# Remove the KV title text that reaches into the crop; it all sits on a flat background.
x0 = int(770 * s)
mask = np.zeros((H, W), np.uint8)
for (bx0, by0, bx1, by1) in [(560, 80, 975, 182), (560, 196, 960, 258), (560, 385, 870, 478)]:
    X0, Y0, X1, Y1 = int(bx0 * s), int(by0 * s), int(bx1 * s), int(by1 * s)
    region = kv[Y0:Y1, X0:X1]
    gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
    bgr = region.astype(int)
    ink = (gray < 200) | ((bgr[..., 2] - bgr[..., 0]) > 40)  # dark text or orange text
    mask[Y0:Y1, X0:X1] = (ink * 255).astype(np.uint8)
mask = cv2.dilate(mask, np.ones((25, 25), np.uint8))
crop = kv[:, x0:].copy()
cmask = mask[:, x0:]
print("text pixels to remove in crop:", int((cmask > 0).sum()))
clean = cv2.inpaint(crop, cmask, 9, cv2.INPAINT_TELEA) if cmask.any() else crop

bg = np.median(kv[int(300 * s):int(360 * s), int(1180 * s):int(1240 * s)].reshape(-1, 3), axis=0)
orange = np.median(kv[int(470 * s):int(500 * s), int(905 * s):int(935 * s)].reshape(-1, 3), axis=0)
ink = np.median(kv[int(110 * s):int(150 * s), int(120 * s):int(140 * s)].reshape(-1, 3), axis=0)
hexc = lambda c: "#%02X%02X%02X" % (int(c[2]), int(c[1]), int(c[0]))
colours = {"bg": hexc(bg), "orange": hexc(orange), "inkSample": hexc(ink)}
print(colours)

# Where the KV text was, the scene is transparent (feathered) so the poster's own grey and grain show through;
# a short left fade ends the bottom dot strip before the tower's left foot (KV x ~830).
rgba = cv2.cvtColor(clean, cv2.COLOR_BGR2BGRA)
fade = int(50 * s)
ramp = np.clip(np.arange(rgba.shape[1]) / fade, 0, 1) ** 1.2
hole = cv2.GaussianBlur(cv2.dilate(cmask, np.ones((31, 31), np.uint8)).astype(np.float32) / 255, (0, 0), 18)
alpha = ramp[None, :] * (1 - np.clip(hole, 0, 1))
rgba[..., 3] = (alpha * 255).astype(np.uint8)
scene = Image.fromarray(cv2.cvtColor(rgba, cv2.COLOR_BGRA2RGBA))
scene = scene.resize((scene.width // 2, scene.height // 2), Image.LANCZOS)
scene.save(A / "kv-scene.png", optimize=True)
print("kv-scene", scene.size)

# Textures and a full-size check image.
def save(name, box, half=True):
    X0, Y0, X1, Y1 = [int(v * s) for v in box]
    im = Image.fromarray(cv2.cvtColor(kv[Y0:Y1, X0:X1], cv2.COLOR_BGR2RGB))
    if half:
        im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
    im.save(A / name, optimize=True)
    print(name, im.size)

save("kv-lattice.png", (1250, 412, 1566, 578))
save("kv-halftone.png", (1230, 592, 1566, 700))
save("kv-tower-ball.png", (975, 360, 1245, 610), half=False)
Image.fromarray(cv2.cvtColor(cv2.resize(clean, None, fx=0.25, fy=0.25), cv2.COLOR_BGR2RGB)).save(ROOT / "work" / "kv-scene-check.jpg", quality=85)

bund = Image.open(BUND).convert("RGB")
bund.resize((2400, round(2400 * bund.height / bund.width)), Image.LANCZOS).save(A / "bund-hd.jpg", quality=93)
shutil.copy(LOGO, A / "along-ink.png")
(A / "colours.json").write_text(json.dumps(colours, indent=1), encoding="utf8")
print("done")
