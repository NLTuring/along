"""Compare normalized VO against the raw TTS output: length, speech onset, peak, loudness."""
import re, subprocess
from pathlib import Path
import numpy as np

VO = Path(__file__).resolve().parent.parent / "public" / "vo"


def load(p):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", "48000", "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(r, np.float32)


def lufs(p):
    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(p), "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
                         capture_output=True, text=True, encoding="utf8", errors="ignore").stderr
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", err)
    return m[-1] if m else "?"


for f in sorted(VO.glob("*.mp3")):
    a, b = load(VO / "raw" / f.name), load(f)
    A, B = np.abs(a), np.abs(b)
    oa, ob = np.argmax(A > 0.05 * A.max()), np.argmax(B > 0.05 * B.max())
    print(f"{f.stem}: len {len(a)/48000:.3f}->{len(b)/48000:.3f}s  onset {oa/48000:.3f}->{ob/48000:.3f}s  peak {B.max():.2f}  I {lufs(f)} LUFS")
