"""Deterministic capture of the website's 3D archive (记忆馆) for S09/S10.

python capture_museum.py intro   -> public/web/museum-intro.mp4  (entry: row → Along mark → wall; UI chrome hidden)
python capture_museum.py browse  -> public/web/museum-browse.mp4 (wall turns → Bund magnet → in hand → stamp)
Both: 1920×1080 CSS @2x (3840×2160), 30 fps, page time advanced exactly 1/30 s per frame.
Writes public/web/capture.json with the key frame numbers and positions.
"""
import json, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from vclock import guard, launch

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "web"
OUT.mkdir(parents=True, exist_ok=True)
META = OUT / "capture.json"
URL = "http://127.0.0.1:4192/?sky={sky}#museum"
FPS = 30

# Virtual clock: rAF, performance.now, setTimeout (once enabled) and CSS/WAAPI animations all follow page time.
VCLOCK = r"""
(() => {
  let vnow = 1000;
  const realST = window.setTimeout.bind(window), realCT = window.clearTimeout.bind(window);
  performance.now = () => vnow;
  const cbs = new Map(); let nextId = 1;
  window.requestAnimationFrame = (cb) => { const id = nextId++; cbs.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => { cbs.delete(id); };
  const timers = new Map(); let tid = 1; window.__vt = false;
  window.setTimeout = (fn, ms = 0, ...a) => {
    if (!window.__vt) return realST(fn, ms, ...a);
    const id = 1e6 + tid++; timers.set(id, { at: vnow + (ms || 0), fn, a }); return id;
  };
  window.clearTimeout = (id) => { if (timers.has(id)) timers.delete(id); else realCT(id); };
  const born = new WeakMap();
  window.__step = (ms) => {
    vnow += ms;
    for (const [id, t] of [...timers]) if (t.at <= vnow) { timers.delete(id); try { typeof t.fn === 'function' && t.fn(...t.a); } catch (e) { console.error(e); } }
    const list = [...cbs.values()]; cbs.clear();
    for (const cb of list) { try { cb(vnow); } catch (e) { console.error('raf', e && e.message); } }
    for (const an of document.getAnimations()) {
      if (!born.has(an)) born.set(an, vnow - ms);
      try { an.pause(); an.currentTime = Math.max(0, vnow - born.get(an)); } catch (e) {}
    }
    return list.length;
  };
})();
"""

HIDE_CHROME = """
.museum__bar, .museum__nav, .museum__caption, .museum__keys, .museum__index, .museum__detail { visibility: hidden !important; }
"""


def encoder(path: Path):
    return subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "png", "-i", "-",
         "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(path)],
        stdin=subprocess.PIPE)


def open_hall(p, sky, hide_chrome):
    b = launch(p, gpu=True)
    ctx = b.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=2, locale="zh-CN", timezone_id="Asia/Shanghai")
    ctx.route("**/*", guard)
    ctx.add_init_script("sessionStorage.setItem('along.shade','open');localStorage.setItem('along.lang','zh');localStorage.removeItem('along.stamps.v2');")
    ctx.add_init_script(VCLOCK)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: print("PAGEERR", str(e)[:200]))
    pg.goto(URL.format(sky=sky))
    pg.wait_for_timeout(1500)
    # The hall's own 0.6 s fade-in (museum.css `museum-in`) would show the page behind it in the first frames.
    pg.add_style_tag(content=".museum.is-open { animation: none !important; }")
    if hide_chrome:
        pg.add_style_tag(content=HIDE_CHROME)
    if not pg.query_selector(".museum.is-open"):
        pg.click("[data-open-museum]")
    pg.wait_for_selector(".museum.is-open", timeout=60000)
    pg.wait_for_timeout(600)
    # Screenshots force rendering updates, which create the overlay's opening transitions; finish them
    # before page time starts so the first recorded frame is already the hall.
    for _ in range(3):
        pg.screenshot(type="jpeg", quality=30)
        pg.evaluate("document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} })")
        pg.wait_for_timeout(150)
    pg.evaluate("window.__vt = true")
    return b, pg


def shoot(pg, enc):
    enc.stdin.write(pg.screenshot(type="png"))


def step(pg, n=1):
    for _ in range(n):
        pg.evaluate(f"window.__step({1000 / FPS})")


def capture_intro(p, sky):
    b, pg = open_hall(p, sky, hide_chrome=True)
    enc = encoder(OUT / "museum-intro.mp4")
    total = round(7.6 * FPS)  # row → mark (≈3.5 s) → hold → rise onto the wall (done ≈6.8 s)
    for i in range(total):
        step(pg)
        shoot(pg, enc)
    enc.stdin.close(); enc.wait()
    b.close()
    return {"frames": total, "markDoneSec": 3.5, "holdUntilSec": 4.3, "riseStartSec": 4.3, "wallDoneSec": 6.8,
            "note": "frame k = page time (k+1)/30 s after entering; UI chrome hidden"}


def wheel(pg, dy):
    pg.evaluate("""(dy) => { const s = document.querySelector('.museum__stage');
      s.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, deltaX: 0, bubbles: true, cancelable: true, clientX: 960, clientY: 540 })); }""", dy)


def ptr(pg, kind, x, y=600, buttons=1):
    pg.evaluate("""([kind, x, y, buttons]) => { const s = document.querySelector('.museum__stage');
      s.dispatchEvent(new PointerEvent(kind, { clientX: x, clientY: y, pointerId: 7, pointerType: 'mouse', buttons, isPrimary: true, bubbles: true })); }""",
                [kind, x, y, buttons])


def capture_browse(p, sky, start_rank, drag_frames):
    b, pg = open_hall(p, sky, hide_chrome=False)
    step(pg, round(7.4 * FPS))  # let the entry finish (browse mode)
    # Start `start_rank` keepsakes along the wall, settled. Then one continuous turn back to N°01: the stage is held
    # (pointer down on the empty floor, no movement → the site doesn't snap) while the wheel moves the target with an
    # ease-in-out profile over `drag_frames`; release after the wall has caught up (stale → no flick, no pick).
    pg.evaluate("(r) => document.querySelector(`[data-dots] [data-rank='${r}']`).click()", start_rank)
    step(pg, 120)
    enc = encoder(OUT / "museum-browse.mp4")
    meta = {"note": "frame k = k-th recorded frame; UI chrome visible", "startRank": start_rank}
    f = 0
    ptr(pg, "pointerdown", 960, 1010)
    meta["turnStart"] = f
    w = [((k + 0.5) / drag_frames) ** 1.6 * (1 - (k + 0.5) / drag_frames) ** 1.6 for k in range(drag_frames)]
    for k in range(drag_frames):
        wheel(pg, -(start_rank * w[k] / sum(w)) / 0.005)
        step(pg); shoot(pg, enc); f += 1
    for _ in range(12):
        step(pg); shoot(pg, enc); f += 1
    ptr(pg, "pointerup", 960, 1010)
    meta["release"] = f
    for _ in range(6):
        step(pg); shoot(pg, enc); f += 1
    meta["landedOn"] = pg.evaluate("document.querySelector('.museum__no')?.textContent")
    print("landed on", meta["landedOn"])
    meta["turnSettled"] = f
    # Take it down: click the keepsake in the middle of the wall.
    pg.evaluate("document.activeElement && document.activeElement.blur()")
    pg.mouse.move(960, 560); pg.mouse.down(); pg.mouse.up()
    if not pg.query_selector(".museum.is-detail"):
        pg.keyboard.press("Enter")
    print("detail open:", bool(pg.query_selector(".museum.is-detail")))
    meta["pick"] = f
    step(pg); shoot(pg, enc); f += 1
    # The site's pedestal shrinks through the keepsake for ~16 frames as it leaves the wall: step past it unrecorded
    # (a cut in the footage), so the next recorded frame has the keepsake already clear of the wall.
    step(pg, 18)
    meta["pickCut"] = f
    for _ in range(30):
        step(pg); shoot(pg, enc); f += 1
    # Turn it in the hand (shows the back with the magnet groove on the way round).
    for _ in range(5):
        pg.keyboard.press("ArrowRight")
    meta["turn"] = f
    for _ in range(54):
        step(pg); shoot(pg, enc); f += 1
    pg.query_selector("[data-stamp]").click()
    meta["stamp"] = f
    step(pg)
    seal = pg.query_selector(".museum__seal")
    meta["sealBox"] = seal.bounding_box() if seal else None  # CSS px in the 1920×1080 page
    shoot(pg, enc); f += 1
    for _ in range(60):
        step(pg); shoot(pg, enc); f += 1
    meta["frames"] = f
    enc.stdin.close(); enc.wait()
    b.close()
    return meta


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    sky = sys.argv[2] if len(sys.argv) > 2 else "dusk"
    meta = json.loads(META.read_text(encoding="utf8")) if META.exists() else {}
    with sync_playwright() as p:
        if which in ("intro", "all"):
            meta["intro"] = {**capture_intro(p, sky), "file": "web/museum-intro.mp4", "size": [3840, 2160], "sky": sky}
        if which in ("browse", "all"):
            start_rank = int(sys.argv[3]) if len(sys.argv) > 3 else 7
            drag_frames = int(sys.argv[4]) if len(sys.argv) > 4 else 64
            meta["browse"] = {**capture_browse(p, sky, start_rank, drag_frames), "file": "web/museum-browse.mp4", "size": [3840, 2160], "sky": sky}
    META.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf8")
    print(json.dumps(meta, ensure_ascii=False, indent=1))
