"""Shared setup for capturing the App's own pages (offline, phone viewport, fixed clock).
probe:  python apk_session.py "<hash>" "<actions.json or inline JSON>" [shot.png]
Actions: [["click","css"], ["fill","css","text"], ["select","css","value"], ["press","Key"], ["wait",ms],
          ["eval","js"], ["hold","css",ms], ["tap", x, y]]
Prints the visible interactive elements (text / selector hints / box) and optionally saves a screenshot."""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from vclock import guard, launch

BASE = "http://127.0.0.1:4191/index.html?sky=day"
ROOT = Path(__file__).resolve().parent.parent

# Page clock starts 2026-11-20 09:00 Asia/Shanghai and runs at real speed.
FIXED_CLOCK = """
(() => {
  const T0 = Date.UTC(2026, 10, 20, 1, 0, 0), real0 = Date.now(), RealDate = Date;
  const now = () => T0 + (RealDate.now() - real0);
  class FixedDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(now()); else super(...a); }
    static now() { return now(); }
  }
  window.Date = FixedDate;
})();
"""


def context(p, lang="en", extra_storage=None, dpr=2):
    b = launch(p, gpu=True)
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=dpr, is_mobile=True, has_touch=True,
                        locale="en-US" if lang == "en" else "zh-CN", timezone_id="Asia/Shanghai")
    ctx.route("**/*", guard)
    store = {"instrip.welcomed": "1", "instrip.locale": lang, "instrip.settings": json.dumps({"assistant": True})}
    store.update(extra_storage or {})
    js = "".join(f"localStorage.setItem({json.dumps(k)}, {json.dumps(v)});" for k, v in store.items())
    ctx.add_init_script(f"if (!sessionStorage.getItem('__init')) {{ {js} sessionStorage.setItem('__init','1'); }}")
    ctx.add_init_script(FIXED_CLOCK)
    return b, ctx


DUMP = r"""() => {
  const out = [];
  const els = document.querySelectorAll('button, a, input, select, textarea, [role=button], [data-stop], [data-day], [data-guide], [data-slot]');
  for (const e of els) {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const data = [...e.attributes].filter(a => a.name.startsWith('data-') || ['name','id','type','aria-label','value'].includes(a.name)).map(a => a.name + (a.value ? '=' + a.value.slice(0, 30) : '')).join(' ');
    const t = (e.innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    out.push(`${e.tagName.toLowerCase()} [${data}] "${t}" @${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return out.join('\n') + `\n-- scrollH ${document.documentElement.scrollHeight} route=${document.getElementById('app')?.dataset.route}`;
}"""


def run(pg, actions):
    for a in actions:
        k = a[0]
        if k == "click": pg.click(a[1], timeout=5000)
        elif k == "fill": pg.fill(a[1], a[2], timeout=5000)
        elif k == "select": pg.select_option(a[1], a[2], timeout=5000)
        elif k == "press": pg.keyboard.press(a[1])
        elif k == "wait": pg.wait_for_timeout(a[1])
        elif k == "eval": pg.evaluate(a[1])
        elif k == "tap": pg.mouse.click(a[1], a[2])
        elif k == "hold":
            box = pg.query_selector(a[1]).bounding_box()
            pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
            pg.mouse.down(); pg.wait_for_timeout(a[2]); pg.mouse.up()
        elif k == "goto": pg.evaluate(f"location.hash = {json.dumps(a[1])}"); pg.wait_for_timeout(900)
        pg.wait_for_timeout(250)


def settle(pg, ms=700):
    pg.evaluate("document.fonts.ready")
    pg.wait_for_timeout(ms)


if __name__ == "__main__":
    route = sys.argv[1]
    arg = sys.argv[2] if len(sys.argv) > 2 else "[]"
    actions = json.loads(Path(arg).read_text(encoding="utf8")) if arg.endswith(".json") else json.loads(arg)
    shot = sys.argv[3] if len(sys.argv) > 3 else None
    lang = "zh" if (shot or "").startswith("zh") else "en"
    with sync_playwright() as p:
        b, ctx = context(p, lang)
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
        pg.goto(f"{BASE}#/{route}")
        pg.wait_for_timeout(1500)
        run(pg, actions)
        settle(pg)
        sys.stdout.reconfigure(encoding="utf-8")
        print(pg.evaluate(DUMP))
        if errs: print("ERRORS:", errs)
        if shot:
            out = ROOT / "capture" / "probe" / shot
            out.parent.mkdir(exist_ok=True)
            pg.screenshot(path=str(out))
            print("shot", out)
        b.close()
