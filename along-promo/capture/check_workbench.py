"""Open the workbench with ?import=project headlessly; report console errors and save a screenshot."""
import sys
from playwright.sync_api import sync_playwright
from vclock import HEADLESS

sys.stdout.reconfigure(encoding="utf-8")
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=HEADLESS, args=["--use-angle=d3d11", "--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width": 1600, "height": 900})
    errs = []
    pg.on("console", lambda m: errs.append(m.text[:220]) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("PAGEERR " + str(e)[:220]))
    pg.goto("http://localhost:5198/?import=project", timeout=120000)
    pg.wait_for_timeout(25000)
    pg.screenshot(path=r"D:\华智双创项目\一起游\along-promo\out\qa\workbench.png")
    print("title:", pg.title())
    print("errors:", len(errs))
    for e in errs[:12]:
        print(" -", e)
    b.close()
