"""Measure each SFX file's peak level and the time of its attack peak (for frame-accurate pinning).
python tools/sfx_peaks.py > docs/sfx-peaks.txt"""
import subprocess, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent / "public" / "sfx"
SR = 48000

def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)

sys.stdout.reconfigure(encoding="utf-8")
print("file | dur s | peak dBFS | attack peak ms (first 0.8 s) | lag frames@30")
for f in sorted(ROOT.rglob("*.mp3")):
    x = load(f)
    if len(x) == 0:
        continue
    peak = float(np.max(np.abs(x)))
    head = np.abs(x[: int(SR * 0.8)])
    i = int(np.argmax(head)) if len(head) else 0
    print(f"{f.relative_to(ROOT).as_posix()} | {len(x)/SR:.2f} | {20*np.log10(peak+1e-9):.1f} | {i/SR*1000:.0f} | {i/SR*30:.1f}")
