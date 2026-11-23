"""Mean luma per frame over a range (finds flashes / dark gaps at seams).  python tools/luma_scan.py video a b"""
import subprocess, sys
import numpy as np

video, a, b = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
W, H = 64, 36
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", f"select='between(n\\,{a}\\,{b})',scale={W}:{H},format=gray",
                      "-fps_mode", "passthrough", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W).mean(axis=(1, 2))
jumps = np.abs(np.diff(frames))
print(f"frames {a}-{b}: luma min {frames.min():.0f} max {frames.max():.0f}; biggest frame-to-frame jump {jumps.max():.1f} at {a + int(jumps.argmax()) + 1}")
print(" ".join(f"{v:.0f}" for v in frames))
