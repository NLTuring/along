"""Feasibility: can we step the museum intro deterministically, and how fast is a frame?"""
import sys, time
from playwright.sync_api import sync_playwright
from vclock import VCLOCK_JS, guard, launch, gl_info, out_dir

gpu = "--soft" not in sys.argv
OUT = out_dir("recon", "museum-test")
with sync_playwright() as p:
    b = launch(p, gpu=gpu)
    ctx = b.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=1, locale="zh-CN", timezone_id="Asia/Shanghai")
    ctx.route("**/*", guard)
    ctx.add_init_script("sessionStorage.setItem('along.shade','open');localStorage.setItem('along.lang','zh');")
    ctx.add_init_script(VCLOCK_JS)
    pg = ctx.new_page()
    logs = []
    pg.on("console", lambda m: logs.append(m.text[:200]) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: logs.append("PAGEERR " + str(e)[:200]))
    pg.goto("http://127.0.0.1:4192/?sky=day")
    pg.wait_for_timeout(1500)
    print("GL:", gl_info(pg))
    pg.click("[data-open-museum]")
    pg.wait_for_selector(".museum.is-open", timeout=60000)
    pg.wait_for_timeout(800)
    t0 = time.time()
    n = 0
    for sec in [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.2, 5.0, 6.0, 7.2]:
        target = round(sec * 30)
        while n < target:
            pg.evaluate("window.__step(1000/30)")
            n += 1
        pg.evaluate("window.__step(0.0001)")
        s = time.time()
        pg.screenshot(path=str(OUT / f"f{target:03d}.jpg"), type="jpeg", quality=90)
        print(f"frame {target} shot {time.time() - s:.2f}s")
    el = time.time() - t0
    print(f"{n} frames stepped in {el:.1f}s => {el / max(1, n):.3f}s/frame (incl. shots)")
    print("logs:", logs[:8])
    b.close()
