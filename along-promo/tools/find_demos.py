"""List the demo TSX files (and sizes) referenced by the shot cards used in S00–S07."""
import json, re, sys
import os
from pathlib import Path

SK = Path(os.environ.get("SHOTCRAFT_SKILL", Path.home() / ".zcode" / "skills" / "video-shotcraft"))
sys.stdout.reconfigure(encoding="utf-8")
lib = {c["name"]: c for c in json.loads((SK / "gallery/api/library.json").read_text(encoding="utf8"))["cards"]}
WANT = ["shot-transitions", "glow-flyline-moves", "crash-zoom-punch", "slam-entrance-moves", "riso-print-hits", "page-turn-transitions",
        "radial-ripple-phone-chips", "voice-waveform-live", "card-flip-reveal", "scanline-annotate-focus", "depth-layer-moves",
        "overhead-camera-moves", "draw-svg-trace", "circle-match-iris", "avatar-bracket-carousel", "fui-hud-moves",
        "hashtag-to-pill-materialize", "space-camera-moves", "theme-switch-moves", "grain-dissolve"]
for n in WANT:
    c = lib.get(n)
    if not c:
        print(n, "MISSING"); continue
    md = (SK / c["source"]).read_text(encoding="utf8")
    m = re.search(r"##\s*参考实现(.*?)(\n## |\Z)", md, re.S)
    refs = re.findall(r"demos/[\w\-/]+\.tsx", m.group(1) if m else md)
    sizes = [f"{r} ({(SK / r).stat().st_size if (SK / r).exists() else '??'}B)" for r in dict.fromkeys(refs)]
    print(f"{n} styles={[s['key'] for s in c['styles']]}\n   " + "\n   ".join(sizes or ["(no demo path found)"]))
