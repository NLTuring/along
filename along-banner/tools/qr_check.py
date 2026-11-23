"""Decode the banner's QR code from the 150 dpi PNG: as printed (card + frame), padded with a wide quiet zone,
and shrunk to simulate scanning from further away.   python qr_check.py"""
import sys
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(encoding="utf-8")
f = 5906 / 2500
png = Image.open(ROOT / "out/Along一起游_团队横幅_1000x400mm_150dpi.png").convert("RGB")
det = cv2.QRCodeDetector()


def dec(im, label):
    a = cv2.cvtColor(np.asarray(im), cv2.COLOR_RGB2GRAY)
    txt = det.detectAndDecode(a)[0]
    print(f"{label:34s} -> {txt!r}")
    return txt


card = png.crop(tuple(round(v * f) for v in (740, 768, 906, 934)))
dec(card, "card as printed")
code = png.crop(tuple(round(v * f) for v in (776.4, 804.4, 879.6, 907.6)))   # inside the card's padding
dec(ImageOps.expand(code, border=60, fill="white"), "code + wide quiet zone")
dec(ImageOps.expand(code, border=60, fill="white").resize((90, 90), Image.LANCZOS), "code + quiet zone, 90 px")
code.save(ROOT / "work/z-qr.png")
