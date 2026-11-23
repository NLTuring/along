"""Write placeholder APK screenshots + manifest so scene work can start before the final capture.
The capture agent overwrites every file with the real one and fills in the manifest."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RECON = ROOT / "capture" / "recon"
OUT = ROOT / "public" / "apk"
OUT.mkdir(parents=True, exist_ok=True)

# name -> recon screenshot used as a stand-in
SCREENS = {
    "zh-trip": "apk-zh-trip.png", "en-trip": "apk-en-trip.png",
    "zh-assistant": "apk-zh-trip.png", "en-assistant": "apk-en-trip.png", "en-assistant-translate": "apk-en-trip.png",
    "en-trip-form": "apk-en-trip.png", "en-trip-form-2": "apk-en-trip.png",
    "en-plan-day1": "apk-en-trip.png", "en-plan-day2": "apk-en-trip.png", "en-plan-day3": "apk-en-trip.png",
    "en-poi-yuyuan": "apk-en-trip.png", "en-driver-card": "apk-en-trip.png",
    "en-friends": "apk-en-friends.png", "en-guide-jiajia": "apk-en-guides_guide_jiajia.png",
    "en-guide-zhangmin": "apk-en-guides_guide_jiajia.png", "en-guide-junjie": "apk-en-guides_guide_jiajia.png",
    "en-checkout": "apk-en-guides_guide_jiajia.png", "en-booked": "apk-en-guides_guide_jiajia.png",
    "en-support": "apk-en-support.png", "en-lens-menu": "apk-en-trip.png", "en-stories": "apk-en-stories.png",
    "en-post-bund": "apk-en-stories.png", "en-share-bund": "apk-en-stories.png",
    "en-craft-real": "apk-en-crafts.png", "en-craft-anime": "apk-en-crafts.png", "en-craft-hold": "apk-en-crafts.png",
    "en-make-order": "apk-en-crafts.png", "en-crafts-library": "apk-en-crafts.png",
}

manifest = {"_note": "PLACEHOLDER — replaced by the APK capture. Sizes in app CSS px (390 wide).", "screens": {}, "videos": {}}
for name, src in SCREENS.items():
    im = Image.open(RECON / src).convert("RGB").resize((780, 1688))
    im.save(OUT / f"{name}.png", optimize=True)
    manifest["screens"][name] = {"file": f"apk/{name}.png", "w": 390, "h": 844, "rects": {}, "placeholder": True}
(OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf8")
print(len(SCREENS), "placeholders")
