"""Capture the latest APK's own pages for the poster.
Pages come from Along-help-dial.apk's web assets (along-promo/capture/apk-web, byte-identical, served on :4191),
390x844 CSS @3x, page clock 2026-11-20 09:00 Shanghai. The Bund sample photo is answered with the user's HD
natural version of the same picture, so every 3D keepsake screen shows it.
python capture_app.py [group ...]    groups: home plan friends assistant booking craft misc"""
import json, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

PROMO = Path(__file__).resolve().parents[2] / "along-promo" / "capture"
sys.path.insert(0, str(PROMO))
from vclock import guard, launch  # noqa: E402
from apk_session import FIXED_CLOCK, DUMP  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "app"
OUT.mkdir(parents=True, exist_ok=True)
HD_BUND = Path(__file__).resolve().parents[2] / "along-promo" / "public" / "img" / "bund-friends.png"
HD_BYTES = HD_BUND.read_bytes()
BASE = "http://127.0.0.1:4191/index.html?sky={sky}"
DPR = 3
HIDE_FIXED = "#nav, [data-assistant-fab], #assistant { visibility: hidden !important; }"
LOG = {}


def serve_hd(route):
    route.fulfill(status=200, body=HD_BYTES, headers={"Content-Type": "image/png", "Cache-Control": "no-store"})


def open_app(p, lang="zh", route="trip", sky="day", settings=None):
    b = launch(p, gpu=True)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=DPR, is_mobile=True, has_touch=True,
                        locale="zh-CN" if lang == "zh" else "en-US", timezone_id="Asia/Shanghai")
    ctx.route("**/*", guard)
    ctx.route(re.compile(r"along-samples/along-shanghai-friends\.png"), serve_hd)  # registered last, so it wins
    store = {"instrip.welcomed": "1", "instrip.locale": lang,
             "instrip.settings": json.dumps({"assistant": True, **(settings or {})})}
    js = "".join(f"localStorage.setItem({json.dumps(k)}, {json.dumps(v)});" for k, v in store.items())
    ctx.add_init_script(f"if (!sessionStorage.getItem('__init')) {{ {js} sessionStorage.setItem('__init','1'); }}")
    ctx.add_init_script(FIXED_CLOCK)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: print("  PAGEERR", str(e)[:160]))
    pg.goto(BASE.format(sky=sky) + f"#/{route}")
    pg.wait_for_timeout(1600)
    return b, pg


def settle(pg, ms=800):
    pg.evaluate("document.fonts.ready")
    pg.wait_for_timeout(ms)


def shot(pg, name, full=False):
    settle(pg)
    style = pg.add_style_tag(content=HIDE_FIXED) if full else None
    if full:
        pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(300)
    pg.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
    h = pg.evaluate("document.documentElement.scrollHeight") if full else 844
    if style:
        pg.evaluate("(s) => s.remove()", style)
    LOG[name] = {"h": h, "route": pg.evaluate("location.hash")}
    print("  saved", name, h)


def go(pg, hash_):
    pg.evaluate(f"location.hash = {json.dumps(hash_)}")
    pg.wait_for_timeout(1200)


def sign_in(pg):
    go(pg, "#/you")
    pg.click("[data-signin]"); pg.wait_for_timeout(700)
    pg.click("[data-local-experience]"); pg.wait_for_timeout(900)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)


def g_home(p):
    b, pg = open_app(p, "zh")
    shot(pg, "zh-trip")
    b.close()
    b, pg = open_app(p, "en")
    shot(pg, "en-trip")
    b.close()
    b, pg = open_app(p, "zh", settings={"senior": True})
    shot(pg, "zh-senior-today")
    b.close()


def build_plan(pg):
    pg.evaluate("document.querySelector('input[name=date]').scrollIntoView({block:'center'})")
    pg.fill("input[name=date]", "2026-11-20"); pg.fill("input[name=time]", "10:00")
    pg.wait_for_timeout(400)
    pg.click("[data-track=plan_cta_click]"); pg.wait_for_timeout(900)
    for t in ("美食", "摄影", "历史"):
        pg.click(f"text={t}")
    pg.click("text=生成我的计划"); pg.wait_for_timeout(1600)


def g_plan(p):
    b, pg = open_app(p, "zh")
    build_plan(pg)
    pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(300)
    shot(pg, "zh-plan-view")
    for d in range(2):
        pg.click(f"[data-day='{d}']"); pg.wait_for_timeout(900)
        pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(300)
        shot(pg, f"zh-plan-day{d + 1}", full=True)
    pg.click("[data-day='0']"); pg.wait_for_timeout(700)
    pg.click("[data-stop='0']"); pg.wait_for_timeout(1200)
    shot(pg, "zh-poi")
    try:
        pg.click("[data-driver]"); pg.wait_for_timeout(1100)
        shot(pg, "zh-driver-card")
    except Exception as e:
        print("  driver card failed:", str(e)[:120])
    b.close()


def g_friends(p):
    b, pg = open_app(p, "zh", route="friends")
    shot(pg, "zh-friends")
    go(pg, "#/guides/guide_jiajia")
    pg.evaluate("window.scrollTo(0, 0)")
    shot(pg, "zh-guide-jiajia")
    b.close()


def g_assistant(p):
    b, pg = open_app(p, "zh")
    pg.click("[data-assistant-fab]"); pg.wait_for_timeout(1000)
    shot(pg, "zh-assistant")
    pg.fill("[data-xy-input]", "豫园几点开门？"); pg.click("[data-xy-send]"); pg.wait_for_timeout(2200)
    shot(pg, "zh-assistant-answer")
    b.close()


def g_booking(p):
    b, pg = open_app(p, "zh")
    sign_in(pg)
    go(pg, "#/guides/guide_jiajia")
    pg.click("[data-slot]"); pg.wait_for_timeout(500)
    pg.click("[data-book]"); pg.wait_for_timeout(1600)
    pg.evaluate("window.scrollTo(0, 0)")
    shot(pg, "zh-checkout")
    b.close()


# The three friends in the Bund photo, traced by hand in normalised image coordinates (x right, y down).
PEOPLE = [(0.23, 0.38), (0.28, 0.31), (0.36, 0.30), (0.41, 0.36), (0.44, 0.32), (0.50, 0.29), (0.55, 0.32),
          (0.57, 0.36), (0.62, 0.33), (0.66, 0.38), (0.67, 0.47), (0.68, 0.56), (0.74, 0.62), (0.79, 0.70),
          (0.84, 0.82), (0.86, 1.00), (0.07, 1.00), (0.08, 0.80), (0.12, 0.62), (0.20, 0.55), (0.24, 0.47)]


def spans(poly, y):
    xs = []
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 <= y < y2) or (y2 <= y < y1):
            xs.append(x1 + (y - y1) * (x2 - x1) / (y2 - y1))
    xs.sort()
    return list(zip(xs[0::2], xs[1::2]))


def paint_people(pg):
    """Turn on 'raise people', then brush the three friends in with the app's own manual mask editor."""
    pg.evaluate("() => { const i = document.querySelector('[data-raise]'); i.scrollIntoView({block:'center'}); if (!i.checked) i.click(); }")
    pg.wait_for_timeout(1500)
    pg.wait_for_selector("[data-mask]", state="visible", timeout=8000)
    pg.evaluate("() => { const r = document.querySelector('[data-radius]'); r.value = '5'; r.dispatchEvent(new Event('input', {bubbles: true})); }")
    pg.evaluate("document.querySelector('[data-mask]').scrollIntoView({block:'center'})"); pg.wait_for_timeout(500)
    box = pg.query_selector("[data-mask]").bounding_box()
    print("  mask canvas", box)
    rows = 0
    y = 0.30
    while y < 0.995:
        for x0, x1 in spans(PEOPLE, y):
            x0, x1 = x0 + 0.012, x1 - 0.012
            if x1 <= x0:
                continue
            pg.mouse.move(box["x"] + x0 * box["width"], box["y"] + y * box["height"])
            pg.mouse.down()
            n = max(2, int((x1 - x0) * box["width"] / 3))
            for k in range(n + 1):
                pg.mouse.move(box["x"] + (x0 + (x1 - x0) * k / n) * box["width"], box["y"] + y * box["height"])
            pg.mouse.up()
            rows += 1
        y += 0.018
    print("  painted strokes:", rows)
    pg.wait_for_timeout(500)
    shot(pg, "zh-craft-paint")
    pg.click("[data-apply-mask]"); pg.wait_for_timeout(3500)
    print("  relief:", pg.evaluate("document.querySelector('[data-relief]')?.innerText"))


def g_craft(p):
    b, pg = open_app(p, "zh")
    sign_in(pg)
    go(pg, "#/trip")
    pg.click("[data-lens]"); pg.wait_for_timeout(800)
    pg.click("[data-capture=craft]"); pg.wait_for_timeout(1500)
    pg.click("[data-samples]"); pg.wait_for_timeout(1200)
    pg.click("[data-photo=sample_along_shanghai_friends]"); pg.wait_for_timeout(3000)
    print("  craft route:", pg.evaluate("location.hash"))
    shot(pg, "zh-craft-flat")
    try:
        paint_people(pg)
        pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(600)
        shot(pg, "zh-craft-real")
        shot(pg, "zh-craft-real-full", full=True)
    except Exception as e:
        print("  raise/paint failed:", str(e)[:200]); print(pg.evaluate(DUMP))
    for step in (3, 4):
        try:
            pg.click("[data-next]"); pg.wait_for_timeout(1800)
            pg.evaluate("window.scrollTo(0, 0)")
            shot(pg, f"zh-craft-step{step}")
        except Exception as e:
            print(f"  step {step} failed:", str(e)[:160])
    # Turn the real mesh with the app's own buttons: the raised friends and the magnet recess on the back.
    for turns, name in ((2, "zh-craft-turn-a"), (3, "zh-craft-turn-b"), (3, "zh-craft-turn-back")):
        try:
            for _ in range(turns):
                pg.click("text=向左旋转"); pg.wait_for_timeout(350)
            pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(1200)
            shot(pg, name)
        except Exception as e:
            print("  turn failed:", str(e)[:160])
    try:
        pg.click("text=正面"); pg.wait_for_timeout(800)
    except Exception:
        pass
    # Drag-tilt the mesh (slowly, then pause before release so it does not flick) to show the raised friends.
    for name, dx, dy in (("zh-craft-tilt-a", 55, 70), ("zh-craft-tilt-b", -110, 0)):
        try:
            pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(400)
            box = pg.query_selector("[data-stage]").bounding_box()
            cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
            pg.mouse.move(cx, cy); pg.mouse.down()
            for k in range(1, 31):
                pg.mouse.move(cx + dx * k / 30, cy + dy * k / 30); pg.wait_for_timeout(25)
            pg.wait_for_timeout(400); pg.mouse.up(); pg.wait_for_timeout(1500)
            shot(pg, name)
        except Exception as e:
            print("  tilt failed:", str(e)[:160])
    try:
        if pg.query_selector("[data-save-craft]"):
            pg.click("[data-save-craft]"); pg.wait_for_timeout(1500)
    except Exception as e:
        print("  save failed:", str(e)[:160])
    go(pg, "#/crafts")
    shot(pg, "zh-crafts-library")
    b.close()


def g_misc(p):
    b, pg = open_app(p, "zh")
    pg.click("[data-lens]"); pg.wait_for_timeout(900)
    shot(pg, "zh-lens-menu")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    go(pg, "#/support")
    shot(pg, "zh-support")
    go(pg, "#/stories")
    try:
        pg.click("[data-mode=examples]"); pg.wait_for_timeout(1400)
    except Exception as e:
        print("  stories examples:", str(e)[:120])
    shot(pg, "zh-stories")
    sign_in(pg)
    go(pg, "#/you")
    pg.evaluate("window.scrollTo(0, 0)")
    shot(pg, "zh-you")
    b.close()


GROUPS = {"home": g_home, "plan": g_plan, "friends": g_friends, "assistant": g_assistant, "booking": g_booking,
          "craft": g_craft, "misc": g_misc}

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    want = sys.argv[1:] or list(GROUPS)
    with sync_playwright() as p:
        for g in want:
            print("==", g)
            try:
                GROUPS[g](p)
            except Exception as e:
                print("  GROUP FAILED", g, str(e)[:300])
    log = OUT / "capture-log.json"
    old = json.loads(log.read_text(encoding="utf8")) if log.exists() else {}
    log.write_text(json.dumps({**old, **LOG}, ensure_ascii=False, indent=1), encoding="utf8")
