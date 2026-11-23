"""Capture the App's own pages for the film (offline, 390×844 @2x, page clock 2026-11-20 09:00 Shanghai).
python capture_apk.py [group ...]    groups: home assistant form plan poi friends booking misc craft film
Writes public/apk/<name>.png and updates public/apk/manifest.json (h = CSS height, rects in CSS px)."""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from apk_session import BASE, ROOT, context, settle

OUT = ROOT / "public" / "apk"
MAN = OUT / "manifest.json"
manifest = json.loads(MAN.read_text(encoding="utf8"))
manifest.setdefault("screens", {}); manifest.setdefault("videos", {})
manifest["_note"] = "App screenshots (390 CSS px wide, @2x). rects in CSS px of the screenshot. placeholder=false means real."
HIDE_FIXED = "#nav, [data-assistant-fab], #assistant { visibility: hidden !important; }"
LOG = []


def save_manifest():
    MAN.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf8")


def rects(pg, sel_map):
    """sel_map: name -> css selector (first match) ; returns {name: {x,y,w,h}} in page coordinates."""
    return pg.evaluate("""(m) => { const out = {}; const sy = window.scrollY;
      for (const [k, sel] of Object.entries(m)) { const e = document.querySelector(sel); if (!e) continue;
        const r = e.getBoundingClientRect(); if (r.width < 1) continue;
        out[k] = { x: Math.round(r.x), y: Math.round(r.y + sy), w: Math.round(r.width), h: Math.round(r.height) }; }
      return out; }""", sel_map)


def shot(pg, name, sel_map=None, full=False, extra=None):
    settle(pg)
    style = pg.add_style_tag(content=HIDE_FIXED) if full else None
    if full:
        pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(300)
    r = rects(pg, sel_map or {})
    h = pg.evaluate("document.documentElement.scrollHeight") if full else 844
    pg.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
    if style:
        pg.evaluate("(s) => s.remove()", style)
    entry = {"file": f"apk/{name}.png", "w": 390, "h": h, "rects": {**r, **(extra or {})}, "placeholder": False}
    manifest["screens"][name] = entry
    save_manifest()
    LOG.append(f"{name}: h={h} rects={list(entry['rects'].keys())}")
    print("  saved", name, h, list(entry["rects"].keys()))


def open_page(p, lang="en", route="trip"):
    b, ctx = context(p, lang)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: print("  PAGEERR", str(e)[:150]))
    pg.goto(f"{BASE}#/{route}")
    pg.wait_for_timeout(1500)
    return b, pg


def go(pg, hash_):
    pg.evaluate(f"location.hash = {json.dumps(hash_)}")
    pg.wait_for_timeout(1100)


def sign_in(pg):
    go(pg, "#/you")
    pg.click("[data-signin]"); pg.wait_for_timeout(700)
    pg.click("[data-local-experience]"); pg.wait_for_timeout(900)
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)


NAV = {"lens": "[data-lens]", "nav": "#nav", "fab": "[data-assistant-fab]"}


def g_home(p):
    for lang in ("zh", "en"):
        b, pg = open_page(p, lang)
        shot(pg, f"{lang}-trip", NAV)
        b.close()


def g_assistant(p):
    for lang in ("zh", "en"):
        b, pg = open_page(p, lang)
        pg.click("[data-assistant-fab]"); pg.wait_for_timeout(900)
        shot(pg, f"{lang}-assistant", {"sheet": ".xy-sheet, .sheet", "chips": "[data-xy-chip]", "mic": "[data-xy-mic]", "input": "[data-xy-input]"})
        if lang == "zh":
            # The voice/text command the app runs on the phone itself: "switch to English".
            pg.fill("[data-xy-input]", "切换成英文")
            shot(pg, "zh-assistant-cmd", {"input": "[data-xy-input]", "send": "[data-xy-send]"})
            pg.click("[data-xy-send]"); pg.wait_for_timeout(1800)
            shot(pg, "en-assistant-translate", NAV)  # the app after the command: English UI
        b.close()


def fill_form(pg):
    pg.evaluate("document.querySelector('input[name=date]').scrollIntoView({block:'center'})")
    pg.fill("input[name=date]", "2026-11-21"); pg.fill("input[name=time]", "10:00")
    pg.wait_for_timeout(500)


def build_plan(pg):
    fill_form(pg)
    pg.click("[data-track=plan_cta_click]"); pg.wait_for_timeout(800)
    for t in ("Food", "Photography", "History"):
        pg.click(f"text={t}")
    pg.click("text=Build my plan"); pg.wait_for_timeout(1500)


def g_form(p):
    b, pg = open_page(p)
    fill_form(pg)
    pg.evaluate("window.scrollTo(0, document.querySelector('input[name=date]').getBoundingClientRect().top + scrollY - 150)")
    pg.wait_for_timeout(500)
    sy = pg.evaluate("scrollY")
    r = rects(pg, {"date": "input[name=date]", "time": "input[name=time]", "cta": "[data-track=plan_cta_click]"})
    city = pg.evaluate("""() => { const e = [...document.querySelectorAll('button, label')].find(x => x.innerText.trim() === 'Shanghai');
      if (!e) return null; const r = e.getBoundingClientRect(); return {x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height)}; }""")
    days = pg.evaluate("""() => { const e = [...document.querySelectorAll('button, label')].find(x => /^3 days$/.test(x.innerText.trim()));
      if (!e) return null; const r = e.getBoundingClientRect(); return {x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height)}; }""")
    extra = {k: v for k, v in {"city": city, "days": days}.items() if v}
    # rects in viewport coordinates of this (scrolled) screenshot
    view = {k: {**v, "y": v["y"] - sy} for k, v in {**r, **extra}.items()}
    settle(pg)
    pg.screenshot(path=str(OUT / "en-trip-form.png"))
    manifest["screens"]["en-trip-form"] = {"file": "apk/en-trip-form.png", "w": 390, "h": 844, "rects": view, "placeholder": False}
    save_manifest(); print("  saved en-trip-form", list(view))
    pg.click("[data-track=plan_cta_click]"); pg.wait_for_timeout(800)
    for t in ("Food", "Photography", "History"):
        pg.click(f"text={t}")
    pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(300)
    shot(pg, "en-trip-form-2", {"cta": "[data-track=plan_cta_click]", "back": "[data-back]"})
    b.close()


STOP_JS = """() => { const sy = scrollY; const box = (e) => { const r = e.getBoundingClientRect(); return {x: Math.round(r.x), y: Math.round(r.y + sy), w: Math.round(r.width), h: Math.round(r.height)}; };
  const out = {};
  document.querySelectorAll('[data-stop]').forEach((s, i) => {
    const k = 'stop' + (i + 1); out[k] = box(s);
    const leaves = [...s.querySelectorAll('*')].filter(e => e.children.length === 0 && e.innerText && e.innerText.trim());
    const find = (re) => leaves.find(e => re.test(e.innerText.trim()));
    const time = find(/^\\d{1,2}:\\d{2}$/); if (time) out[k + '-time'] = box(time);
    const cost = find(/(¥|\\$|Free|min,)/); if (cost) out[k + '-cost'] = box(cost);
    const warn = [...s.querySelectorAll('*')].find(e => /closed|Closed|not open|opens/i.test(e.innerText || '') && e.children.length === 0); if (warn) out[k + '-warning'] = box(warn);
  });
  const legs = [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /^(walk|metro|taxi|bus|bike|ferry|train)\\b.*min/i.test((e.innerText || '').trim()));
  legs.forEach((e, i) => { out['leg' + (i + 1)] = box(e); });
  document.querySelectorAll('[data-day]').forEach((d, i) => { out['tab' + (i + 1)] = box(d); });
  return out; }"""


def g_plan(p):
    b, pg = open_page(p)
    build_plan(pg)
    pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(300)
    shot(pg, "en-plan-view", NAV)
    for d in range(3):
        pg.click(f"[data-day='{d}']"); pg.wait_for_timeout(900)
        pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(300)
        r = pg.evaluate(STOP_JS)
        shot(pg, f"en-plan-day{d + 1}", None, full=True, extra=r)
        texts = pg.evaluate("() => [...document.querySelectorAll('[data-stop]')].map(s => s.innerText.replace(/\\s+/g, ' ').slice(0, 90))")
        LOG.append(f"day{d + 1} stops: {texts}")
    b.close()


def g_poi(p):
    b, pg = open_page(p)
    build_plan(pg)
    pg.click("[data-day='0']"); pg.wait_for_timeout(600)
    pg.click("[data-stop='0']"); pg.wait_for_timeout(1100)
    shot(pg, "en-poi-yuyuan", {"sheet": ".sheet", "photo": ".sheet img", "directions": "[data-directions]", "driver": "[data-driver]", "save": "[data-save]"})
    pg.click("[data-driver]"); pg.wait_for_timeout(1100)
    shot(pg, "en-driver-card", {})
    b.close()


def buttons(pg):
    return pg.evaluate("() => [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width > 2).map(b => [...b.attributes].filter(a => a.name.startsWith('data-')).map(a => a.name + '=' + a.value).join(' ') + ' | ' + b.innerText.replace(/\\s+/g, ' ').slice(0, 30)).join('\\n')")


def g_friends(p):
    b, pg = open_page(p, route="friends")
    cards = pg.evaluate("() => [...document.querySelectorAll('[data-guide]')].map((g, i) => { const r = g.getBoundingClientRect(); return ['card' + (i + 1), {x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height)}]; })")
    shot(pg, "en-friends", NAV, extra=dict(cards))
    for gid, name in (("guide_jiajia", "jiajia"), ("guide_zhangmin", "zhangmin"), ("guide_junjie", "junjie")):
        go(pg, f"#/guides/{gid}")
        pg.evaluate("window.scrollTo(0, 0)")
        shot(pg, f"en-guide-{name}", {"photo": "img", "book": "[data-book]", "slot": "[data-slot]"})
    b.close()


def g_booking(p):
    b, pg = open_page(p)
    sign_in(pg)
    go(pg, "#/guides/guide_jiajia")
    pg.click("[data-slot]"); pg.wait_for_timeout(500)
    pg.click("[data-book]"); pg.wait_for_timeout(1500)
    print("  after book:", pg.evaluate("location.hash"))
    shot(pg, "en-checkout", {"pay": "[data-pay]", "payby": "[data-payby]", "demo": "[data-demo-confirm]"})
    try:
        if pg.query_selector("[data-payby]"):
            opts = pg.query_selector_all("[data-payby]")
            opts[-1].click(); pg.wait_for_timeout(400)
        if pg.query_selector("[data-pay]"):
            pg.click("[data-pay]"); pg.wait_for_timeout(1500)
        if pg.query_selector("[data-demo-confirm]"):
            pg.click("[data-demo-confirm]"); pg.wait_for_timeout(1500)
    except Exception as e:
        print("  booking step failed:", str(e)[:160]); print(buttons(pg))
    print("  booked page:", pg.evaluate("location.hash"))
    pg.evaluate("window.scrollTo(0, 0)")
    shot(pg, "en-booked", {"stamp": ".stamp, [class*=stamp]"})
    b.close()


def g_misc(p):
    b, pg = open_page(p)
    pg.click("[data-lens]"); pg.wait_for_timeout(900)
    shot(pg, "en-lens-menu", {"sheet": ".sheet", "photo": "[data-capture=photo]", "craft": "[data-capture=craft]", "story": "[data-capture=story]"})
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)
    go(pg, "#/support")
    shot(pg, "en-support", {"emergency": ".support, [data-help]"})
    go(pg, "#/stories")
    pg.click("[data-mode=examples]"); pg.wait_for_timeout(1400)
    shot(pg, "en-stories", NAV)
    pg.evaluate("window.scrollTo(0, 0)")
    shot(pg, "en-stories-full", None, full=True)
    b.close()
    # The Bund example story opened.
    b, pg = open_page(p, route="stories")
    pg.click("[data-mode=examples]"); pg.wait_for_timeout(1400)
    link = pg.query_selector("a:has-text('First morning')")
    if link:
        link.click(); pg.wait_for_timeout(1400)
        shot(pg, "en-story-bund", NAV)
    b.close()


ANIME = ROOT / "public" / "img" / "anime" / "along-shanghai-friends.webp"
SEED_ANIME = """async (b64) => {
  const { getCraft, variantCacheKey, cacheVariant } = await import('/js/crafts.js');
  const id = decodeURIComponent(location.hash.split('/')[2] || '');
  const craft = getCraft(id); if (!craft) return 'no craft ' + id;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'image/webp' });
  const key = variantCacheKey(craft, 'ANIME');
  await cacheVariant(key, { blob, maskSource: 'NONE', outputMediaId: 'along-anime-sample', jobId: 'along-anime-sample' });
  return key; }"""
CRAFT_RECTS = {"model": "[data-stage]", "style-real": "[data-real]", "style-anime": "[data-anime]", "next": "[data-next]",
               "magnet": "[data-product=MAGNET]", "keychain": "[data-product=KEYCHAIN]", "raise": "[data-raise]"}


def open_craft(p):
    b, pg = open_page(p)
    sign_in(pg)
    go(pg, "#/trip")
    pg.click("[data-lens]"); pg.wait_for_timeout(800)
    pg.click("[data-capture=craft]"); pg.wait_for_timeout(1500)
    pg.click("[data-samples]"); pg.wait_for_timeout(1200)
    pg.click("[data-photo=sample_along_shanghai_friends]"); pg.wait_for_timeout(2500)
    return b, pg


def g_craft(p):
    import base64
    b, pg = open_craft(p)
    print("  craft route:", pg.evaluate("location.hash"))
    shot(pg, "en-craft-real", CRAFT_RECTS)
    shot(pg, "en-craft-real-full", CRAFT_RECTS, full=True)
    # Holding the real model: the five-second style ring, caught half way (released before it fires).
    pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(300)
    box = pg.query_selector("[data-stage]").bounding_box()
    pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    pg.mouse.down(); pg.wait_for_timeout(2500)
    pg.screenshot(path=str(OUT / "en-craft-hold.png"))
    manifest["screens"]["en-craft-hold"] = {"file": "apk/en-craft-hold.png", "w": 390, "h": 844, "rects": rects(pg, CRAFT_RECTS), "placeholder": False}
    save_manifest(); print("  saved en-craft-hold (real)")
    pg.mouse.up(); pg.wait_for_timeout(800)
    key = pg.evaluate(SEED_ANIME, base64.b64encode(ANIME.read_bytes()).decode())
    print("  seeded:", key)
    pg.reload(); pg.wait_for_timeout(3000)
    try:
        pg.evaluate("document.querySelector('[data-anime]').scrollIntoView({block:'center'})"); pg.wait_for_timeout(300)
        pg.click("[data-anime]"); pg.wait_for_timeout(3000)
    except Exception as e:
        print("  anime click failed:", str(e)[:160])
    print("  style note:", pg.evaluate("document.querySelector('[data-style-note]')?.innerText"), "| job:", pg.evaluate("document.querySelector('[data-job]')?.innerText"))
    pg.evaluate("window.scrollTo(0, 0)"); pg.wait_for_timeout(400)
    shot(pg, "en-craft-anime", CRAFT_RECTS)
    shot(pg, "en-craft-anime-full", CRAFT_RECTS, full=True)
    for step in (3, 4):
        try:
            pg.click("[data-next]"); pg.wait_for_timeout(1500)
            pg.evaluate("window.scrollTo(0, 0)")
            shot(pg, f"en-craft-step{step}", {"model": "[data-stage]", "next": "[data-next]", "save": "[data-save-craft]", "download": "[data-download]"})
        except Exception as e:
            print(f"  step {step} failed:", str(e)[:160]); print(buttons(pg))
    cid = pg.evaluate("decodeURIComponent(location.hash.split('/')[2] || '')")
    try:
        if pg.query_selector("[data-save-craft]"):
            pg.click("[data-save-craft]"); pg.wait_for_timeout(1500)
    except Exception as e:
        print("  save failed:", str(e)[:160])
    go(pg, f"#/make-order/{cid}")
    pg.wait_for_timeout(800)
    for sel, val in (("input[name=name]", "Maya Laurent"), ("input[name=email]", "maya@example.com"), ("input[name=city]", "Lyon, France"),
                     ("input[name=country]", "France"), ("textarea", "Two magnets, please. Sample order for the demo.")):
        try:
            if pg.query_selector(sel): pg.fill(sel, val)
        except Exception:
            pass
    pg.evaluate("window.scrollTo(0, 0)")
    shot(pg, "en-make-order", {"form": "[data-inquiry-form]"})
    shot(pg, "en-make-order-full", {"form": "[data-inquiry-form]"}, full=True)
    go(pg, "#/crafts")
    shot(pg, "en-crafts-library", NAV)
    b.close()


def g_film(p):
    b, pg = open_page(p)
    sign_in(pg)
    go(pg, "#/studio")
    pg.click("[data-samples]"); pg.wait_for_timeout(1000)
    for ph in ("sample_along_shanghai_friends", "sample_poi_yuyuan", "sample_poi_ferry", "sample_poi_westbund"):
        pg.click(f"[data-photo={ph}]"); pg.wait_for_timeout(150)
    pg.click("[data-make]"); pg.wait_for_timeout(2500)
    print("  film route:", pg.evaluate("location.hash"))
    shot(pg, "en-film", NAV)
    share = pg.query_selector("[data-share], button:has-text('Share')")
    if share:
        share.click(); pg.wait_for_timeout(1300)
        area = pg.query_selector(".sheet textarea")
        if area: area.fill("First morning on the Bund #ChinaTravel #Along #TheBund")
        shot(pg, "en-share-bund", {"polaroid": "[data-card]", "tiktok": "[data-tiktok]", "caption": "[data-caption]", "publish": "[data-publish]"})
    else:
        print("  no share button:"); print(buttons(pg))
    b.close()
    # Post a story: the compose sheet.
    b, pg = open_page(p)
    sign_in(pg)
    go(pg, "#/stories")
    try:
        pg.click("[data-compose]"); pg.wait_for_timeout(1200)
        area = pg.query_selector(".sheet textarea")
        if area: area.fill("First morning on the Bund. Nine o'clock, the river still quiet. #ChinaTravel #Along #TheBund")
        shot(pg, "en-post-bund", {"sheet": ".sheet", "upload": "[data-upload]"})
    except Exception as e:
        print("  compose failed:", str(e)[:160]); print(buttons(pg))
    b.close()


GROUPS = {"home": g_home, "assistant": g_assistant, "form": g_form, "plan": g_plan, "poi": g_poi, "friends": g_friends,
          "booking": g_booking, "misc": g_misc, "craft": g_craft, "film": g_film}

if __name__ == "__main__":
    want = sys.argv[1:] or list(GROUPS)
    sys.stdout.reconfigure(encoding="utf-8")
    with sync_playwright() as p:
        for g in want:
            print("==", g)
            try:
                GROUPS[g](p)
            except Exception as e:
                print("  GROUP FAILED", g, str(e)[:300])
    print("\n".join(LOG))
