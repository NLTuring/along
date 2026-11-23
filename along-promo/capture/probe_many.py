"""Run several probes (route + actions + screenshot) from one JSON list; print element dumps.
python probe_many.py probes.json"""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from apk_session import BASE, DUMP, ROOT, context, run, settle

cases = json.loads(Path(sys.argv[1]).read_text(encoding="utf8"))
sys.stdout.reconfigure(encoding="utf-8")
with sync_playwright() as p:
    for c in cases:
        b, ctx = context(p, c.get("lang", "en"))
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
        pg.goto(f"{BASE}#/{c['route']}")
        pg.wait_for_timeout(1500)
        print(f"===== {c['shot']}")
        try:
            run(pg, c.get("actions", []))
        except Exception as e:
            print("ACTION FAILED:", str(e)[:200])
        settle(pg)
        dump = pg.evaluate(DUMP).splitlines()
        keep = [l for l in dump if not any(k in l for k in ("nav_trip", "nav_friends", "nav_stories", "nav_you"))]
        print("\n".join(keep[: c.get("max", 40)]))
        if errs:
            print("ERRORS:", errs)
        out = ROOT / "capture" / "probe" / c["shot"]
        out.parent.mkdir(exist_ok=True)
        pg.screenshot(path=str(out))
        b.close()
