"""Extract review frames from a render: for every shot, frames at entry / action peak / settled / before the seam,
saved full-size as out/review/<shot>-f<frame>.jpg plus one contact sheet per shot.  python tools/review_frames.py out/along-promo-v2.mp4"""
import json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
video = sys.argv[1]
out = ROOT / "out" / "review"
out.mkdir(parents=True, exist_ok=True)
src = (ROOT / "src" / "timeline.ts").read_text(encoding="utf8")
shots = re.findall(r"id: '(S\d\d)', label: '([^']+)', from: (\d+), dur: (\d+)", src)
index = []
for sid, label, frm, dur in shots:
    a, d = int(frm), int(dur)
    frames = sorted({a + 4, a + d // 4, a + d // 2, a + (3 * d) // 4, a + d - 3})
    sel = "+".join(f"eq(n\\,{k})" for k in frames)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-vf", f"select='{sel}'", "-fps_mode", "passthrough", str(out / f"{sid}-%02d.jpg")], check=True)
    files = []
    for i, k in enumerate(frames, 1):
        p = out / f"{sid}-{i:02d}.jpg"
        q = out / f"{sid}-f{k}.jpg"
        if q.exists(): q.unlink()
        p.rename(q); files.append(q.name)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-vf", f"select='{sel}',scale=640:-1,tile={len(frames)}x1", "-frames:v", "1", str(out / f"sheet-{sid}.jpg")], check=True)
    index.append({"shot": sid, "label": label, "from": a, "dur": d, "frames": files, "sheet": f"sheet-{sid}.jpg"})
(out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf8")
print(len(index), "shots →", out)
