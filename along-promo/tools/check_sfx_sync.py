"""SFX sync check: for each sharp cue, find the attack peak in the rendered SFX-only track near the cue's
target frame and report the error in frames.  python tools/check_sfx_sync.py out/sfx-only.wav"""
import subprocess, sys
import numpy as np

SR, FPS = 48000, 30
# (label, target frame of the visual action) — the sharp, isolated hits
TARGETS = [("S01 crash hit", 126 + 260), ("S02 stamp 1", None), ("S06 shutter", None), ("S09 stamp", None), ("S10 mark complete", None), ("S11 一起", None)]


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


x = np.abs(load(sys.argv[1]))
env = np.convolve(x, np.ones(240) / 240, mode="same")  # 5 ms envelope
targets = [(l, int(t)) for l, t in (a.split("=") for a in sys.argv[2:])]
for label, f in targets:
    lo, hi = int((f - 10) / FPS * SR), int((f + 10) / FPS * SR)
    seg = env[lo:hi]
    # attack = first sample above 60% of the window max
    k = int(np.argmax(seg))  # attack peak (same definition as the lag table)
    peak_f = (lo + k) / SR * FPS
    print(f"{label:22s} target {f:5d}  attack {peak_f:7.1f}  error {peak_f - f:+5.1f} f")
