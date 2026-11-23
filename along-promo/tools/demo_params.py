"""Print the tuned parameters of shot-card demos: header comment, constants, easings, keyframes,
plus the card's 已知坑/命门 section.  python tools/demo_params.py <card-name>:<Demo.tsx> ..."""
import json, re, sys
import os
from pathlib import Path

SK = Path(os.environ.get("SHOTCRAFT_SKILL", Path.home() / ".zcode" / "skills" / "video-shotcraft"))
sys.stdout.reconfigure(encoding="utf-8")
lib = {c["name"]: c for c in json.loads((SK / "gallery/api/library.json").read_text(encoding="utf8"))["cards"]}
KEY = re.compile(r"(interpolate\(|Easing|bezier|spring\(|^\s*(export )?const [A-Z][A-Z0-9_]*\s*=|durationInFrames|\b(dur|DUR|start|end|from|to)\s*[:=]\s*\d|//)")

for arg in sys.argv[1:]:
    card, demo = arg.split(":")
    c = lib[card]
    md = (SK / c["source"]).read_text(encoding="utf8")
    pit = re.search(r"##[^\n]*(已知坑|命门|坑)[^\n]*\n(.*?)(\n## |\Z)", md, re.S)
    print(f"\n######## {card} — {c['summary'][:80]}")
    if pit:
        print("[已知坑] " + re.sub(r"\n\s*\n", "\n", pit.group(2)).strip()[:1400])
    path = next((p for p in (SK / "demos").rglob(demo) if "_legacy" not in p.parts), None)
    if not path:
        print("  demo not found", demo); continue
    lines = path.read_text(encoding="utf8").splitlines()
    head = []
    for l in lines[:40]:
        if l.strip().startswith(("//", "/*", "*")):
            head.append(l.strip())
    print(f"[{path.relative_to(SK)}] header:\n  " + "\n  ".join(head[:18]))
    hits = [f"{i + 1}: {l.strip()[:150]}" for i, l in enumerate(lines) if KEY.search(l) and not l.strip().startswith("import")]
    print("  params:\n  " + "\n  ".join(hits[:55]))
