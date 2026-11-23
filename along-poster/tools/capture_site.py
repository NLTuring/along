"""Capture the latest website (along-website) for the poster.
Served on :4192, 1440x900 CSS @2x (phone: 390x844 @3x), page clock 2026-11-20 10:30 Shanghai.
The Bund sample is answered with the user's HD natural photo, so the maker and the 记忆馆 keepsake show it.
python capture_site.py [group ...]   groups: hero sections keepsake museum langs phone"""
import json, re, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

PROMO = Path(__file__).resolve().parents[2] / "along-promo" / "capture"
sys.path.insert(0, str(PROMO))
from vclock import guard, launch  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "site"
OUT.mkdir(parents=True, exist_ok=True)
HD_BYTES = (Path(__file__).resolve().parents[2] / "along-promo" / "public" / "img" / "bund-friends.png").read_bytes()
URL = "http://127.0.0.1:4192/?sky=day"
CLOCK = """
(() => {
  const T0 = Date.UTC(2026, 10, 20, 2, 30, 0), real0 = Date.now(), RealDate = Date;
  const now = () => T0 + (RealDate.now() - real0);
  class FixedDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(now()); else super(...a); }
    static now() { return now(); }
  }
  window.Date = FixedDate;
})();
"""


def serve_hd(route):
    route.fulfill(status=200, body=HD_BYTES, headers={"Content-Type": "image/png", "Cache-Control": "no-store"})


def open_site(p, lang="zh", phone=False, hash_="", still=False):
    b = launch(p, gpu=True)
    view = {"width": 390, "height": 844} if phone else {"width": 1440, "height": 900}
    ctx = b.new_context(viewport=view, device_scale_factor=3 if phone else 2, is_mobile=phone, has_touch=phone,
                        locale="zh-CN" if lang == "zh" else "en-US", timezone_id="Asia/Shanghai",
                        reduced_motion="reduce" if still else "no-preference")
    ctx.route("**/*", guard)
    ctx.route(re.compile(r"img/samples/along-shanghai-friends\.webp"), serve_hd)
    ctx.add_init_script(f"sessionStorage.setItem('along.shade','open');localStorage.setItem('along.lang',{json.dumps(lang)});"
                        "localStorage.removeItem('along.stamps.v2');")
    ctx.add_init_script(CLOCK)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: print("  PAGEERR", str(e)[:160]))
    pg.goto(URL + hash_)
    pg.wait_for_timeout(3500)
    return b, pg


def shot(pg, name, wait=1200):
    pg.evaluate("document.fonts.ready")
    pg.wait_for_timeout(wait)
    pg.screenshot(path=str(OUT / f"{name}.png"))
    print("  saved", name)


def to(pg, sel, block="start", offset=0):
    # Instant scrolls, repeated: a smooth scroll followed by scrollBy cancels the first one.
    for _ in range(3):
        pg.evaluate("""([s, o]) => { document.documentElement.style.scrollBehavior = 'auto';
          const y = document.querySelector(s).getBoundingClientRect().top + scrollY + o;
          window.scrollTo({ top: y, behavior: 'instant' }); }""", [sel, offset])
        pg.wait_for_timeout(600)
    pg.wait_for_timeout(1200)
    print("  at", sel, pg.evaluate("Math.round(scrollY)"))


def pearl_scene(pg, want="东方明珠", tries=6):
    """The porthole turns on click; stop on the Oriental Pearl scene (reduced motion = no auto-turn, no slats)."""
    clicks = 0
    for _ in range(tries):
        tag = pg.evaluate("document.querySelector('[data-scene-tag]')?.innerText || ''")
        if want in tag:
            break
        pg.click("[data-scene-img]"); pg.wait_for_timeout(1400); clicks += 1
    print("  scene:", pg.evaluate("document.querySelector('[data-scene-tag]')?.innerText"), "clicks", clicks)
    return clicks


def click_text(pg, scope, text):
    return pg.evaluate("""([scope, text]) => { const root = document.querySelector(scope) || document;
      const b = [...root.querySelectorAll('button, a, label')].find(x => x.innerText.replace(/\\s+/g, '').includes(text));
      if (!b) return false; b.click(); return true; }""", [scope, text])


CLICKS = {}


def g_hero(p):
    b, pg = open_site(p, still=True)
    CLICKS["n"] = pearl_scene(pg)
    shot(pg, "site-hero", 2000)
    pg.click("[data-langpick-btn]"); pg.wait_for_timeout(700)
    shot(pg, "site-langmenu", 500)
    b.close()


def g_sections(p):
    b, pg = open_site(p)
    to(pg, "#land", offset=-70)
    shot(pg, "site-land")
    try:
        pg.click("[data-pass-go]"); pg.wait_for_timeout(5000)
        shot(pg, "site-land-plan")
        to(pg, "#land", offset=330)
        shot(pg, "site-land-plan-2")
    except Exception as e:
        print("  pass go failed:", str(e)[:120])
    to(pg, "#together", offset=-70)
    shot(pg, "site-together", 4000)
    to(pg, "#more", offset=-70)
    shot(pg, "site-more", 3000)
    b.close()


def g_keepsake(p):
    b, pg = open_site(p)
    to(pg, "#keepsake .maker", offset=-96)
    shot(pg, "site-keepsake", 3500)
    print("  shapes:", pg.evaluate("[...document.querySelectorAll('#keepsake button')].map(b => b.innerText.trim()).filter(Boolean).join(' | ')"))
    if click_text(pg, "#keepsake", "钥匙扣"):
        pg.wait_for_timeout(2500)
        shot(pg, "site-keepsake-keychain", 1500)
    b.close()


def g_museum(p):
    b, pg = open_site(p)
    pg.click("[data-open-museum]")
    pg.wait_for_selector(".museum.is-open", timeout=60000)
    pg.wait_for_timeout(11000)
    shot(pg, "site-museum-wall", 1500)
    print("  centred:", pg.evaluate("document.querySelector('.museum__no')?.textContent"))
    if not click_text(pg, ".museum", "取下来"):
        pg.keyboard.press("Enter")
    pg.wait_for_timeout(3500)
    shot(pg, "site-museum-hold", 800)
    for _ in range(4):
        pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(250)
    pg.wait_for_timeout(1800)
    shot(pg, "site-museum-turn", 500)
    for _ in range(4):
        pg.keyboard.press("ArrowLeft"); pg.wait_for_timeout(250)
    pg.wait_for_timeout(1500)
    try:
        pg.click("[data-stamp]"); pg.wait_for_timeout(2500)
        shot(pg, "site-museum-stamp", 500)
    except Exception as e:
        print("  stamp failed:", str(e)[:120])
    b.close()


def g_langs(p):
    for lang in ("en", "ja", "ar", "fr"):
        b, pg = open_site(p, lang, still=True)
        for _ in range(CLICKS.get("n", 0)):
            pg.click("[data-scene-img]"); pg.wait_for_timeout(1400)
        shot(pg, f"site-hero-{lang}", 2000)
        b.close()


def g_phone(p):
    b, pg = open_site(p, phone=True, still=True)
    pearl_scene(pg)
    shot(pg, "site-phone-hero", 2000)
    b.close()
    b, pg = open_site(p, phone=True)
    to(pg, "#keepsake", offset=0)
    shot(pg, "site-phone-keepsake", 3500)
    b.close()


GROUPS = {"hero": g_hero, "sections": g_sections, "keepsake": g_keepsake, "museum": g_museum, "langs": g_langs, "phone": g_phone}

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    with sync_playwright() as p:
        for g in sys.argv[1:] or list(GROUPS):
            print("==", g)
            try:
                GROUPS[g](p)
            except Exception as e:
                print("  GROUP FAILED", g, str(e)[:300])
