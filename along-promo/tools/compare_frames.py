"""Check a speed-changed render keeps every frame: frame k of B must equal frame k of A.
python tools/compare_frames.py a.mp4 b.mp4 k1 k2 ...   → PSNR per frame (≥40 dB = same picture, re-encoded)"""
import subprocess, sys
import numpy as np

W, H = 960, 540


def frame(video, k):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", f"select='eq(n\\,{k})',scale={W}:{H}", "-frames:v", "1",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(H, W, 3).astype(np.float64)


a, b = sys.argv[1], sys.argv[2]
for k in map(int, sys.argv[3:]):
    x, y = frame(a, k), frame(b, k)
    mse = ((x - y) ** 2).mean()
    psnr = 99.0 if mse == 0 else 10 * np.log10(255 ** 2 / mse)
    # neighbour check: the same frame should match far better than the next one
    y1 = frame(b, k + 1) if k + 1 < 2700 else y
    mse1 = ((x - y1) ** 2).mean()
    psnr1 = 99.0 if mse1 == 0 else 10 * np.log10(255 ** 2 / mse1)
    print(f"frame {k:4d}: PSNR vs same frame {psnr:5.1f} dB | vs next frame {psnr1:5.1f} dB")
