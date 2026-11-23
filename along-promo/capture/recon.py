"""Quick look at the APK pages and the website before the storyboard (not final capture)."""
import sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).parent / "recon"
OUT.mkdir(exist_ok=True)
APK = "http://127.0.0.1:4191/index.html?sky=day"
WEB = "http://127.0.0.1:4192/?sky=day"
EXE = r"C:\\Users\\Sgh\\AppData\\Local\\ms-playwright\\chromium_headless_shell-1248\\chrome-headless-shell-win64\\chrome-headless-shell.exe"
LOCAL = ("127.0.0.1", "localhost")


def guard(route):
    host = route.request.url.split("/")[2].split(":")[0]
    if host in LOCAL or route.request.url.startswith(("data:", "blob:")):
        return route.continue_()
    return route.abort()


def apk(p, lang):
    b = p.chromium.launch(executable_path=EXE)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, locale="zh-CN",
                        timezone_id="Asia/Shanghai", is_mobile=True, has_touch=True)
    ctx.route("**/*", guard)
    ctx.add_init_script(f"localStorage.setItem('instrip.welcomed','1');localStorage.setItem('instrip.locale','{lang}');")
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
    for name in ["trip", "friends", "stories", "you", "guides/guide_jiajia", "crafts", "support", "studio", "map"]:
        pg.goto(f"{APK}#/{name}")
        pg.wait_for_timeout(1500)
        pg.screenshot(path=str(OUT / f"apk-{lang}-{name.replace('/', '_')}.png"))
    print(lang, "errors:", errs[:5])
    b.close()


def web(p):
    b = p.chromium.launch(executable_path=EXE)
    ctx = b.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=1, locale="zh-CN", timezone_id="Asia/Shanghai")
    ctx.route("**/*", guard)
    ctx.add_init_script("sessionStorage.setItem('along.shade','open');localStorage.setItem('along.lang','zh');")
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
    pg.goto(WEB)
    pg.wait_for_timeout(2500)
    h = pg.evaluate("document.documentElement.scrollHeight")
    print("web height", h)
    y, i = 0, 0
    while y < h and i < 14:
        pg.evaluate(f"window.scrollTo(0,{y})")
        pg.wait_for_timeout(1400)
        pg.screenshot(path=str(OUT / f"web-{i:02d}.png"))
        y += 1000
        i += 1
    print("web errors:", errs[:5])
    b.close()


with sync_playwright() as p:
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("all", "apk"):
        apk(p, "zh")
        apk(p, "en")
    if which in ("all", "web"):
        web(p)
