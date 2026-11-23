"""Render poster.html (served on :4193) to A3 at 300 DPI: 3508x4961 PNG + vector-text PDF + preview JPG,
and report any box whose content overflows.   python render.py [name]"""
import json, sys
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "along-promo" / "capture"))
from vclock import launch  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"
PAGE = sys.argv[1] if len(sys.argv) > 1 else "poster-v6.html"
NAME = sys.argv[2] if len(sys.argv) > 2 else "Along一起游_视觉海报_V6_灰黑橙_A3_300DPI"
CHECK = """() => {
  const bad = [];
  for (const e of document.querySelectorAll('.sk, .ph, .bw, .cd, .bx, .kpi, .sec, .body, .hc, .ft, .stat, .pt, .mk, .rc')) {
    const dh = e.scrollHeight - e.clientHeight, dw = e.scrollWidth - e.clientWidth;
    if (dh > 2 || dw > 2) bad.push(`${e.className || e.id} ${e.id || ''} overflow h+${dh} w+${dw} :: ${e.innerText.slice(0, 40).replace(/\\s+/g, ' ')}`);
  }
  for (const td of document.querySelectorAll('.pt tr')) { const h = td.getBoundingClientRect().height; if (h > 44) bad.push('table row wraps ' + Math.round(h) + ' :: ' + td.innerText.slice(0, 30).replace(/\\s+/g, ' ')); }
  for (const h of document.querySelectorAll('h4, .sh, .ft .s b, .tags, .status')) { const r = h.getBoundingClientRect(); if (r.right > 1716) bad.push('past right margin ' + Math.round(r.right) + ' :: ' + h.innerText.slice(0, 30)); }
  const hc = document.querySelector('.hc').getBoundingClientRect(), s1 = document.querySelector('#s1').getBoundingClientRect();
  bad.push(`hero copy bottom ${Math.round(hc.bottom)} / s1 top ${Math.round(s1.top)}`);
  const pitch = document.querySelector('.pitch').getBoundingClientRect(); bad.push(`pitch h ${Math.round(pitch.height)}`);
  const fonts = [...document.fonts].map(f => f.family + ':' + f.status); bad.push('fonts ' + fonts.join(', '));
  const broken = [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.src); if (broken.length) bad.push('BROKEN ' + broken.join(' '));
  return bad;
}"""

sys.stdout.reconfigure(encoding="utf-8")
with sync_playwright() as p:
    b = launch(p, gpu=True)
    pg = b.new_page(viewport={"width": 1754, "height": 2481}, device_scale_factor=2)
    pg.goto(f"http://127.0.0.1:4193/{PAGE}")
    pg.evaluate("document.fonts.ready")
    pg.wait_for_function("[...document.images].every(i => i.complete)")
    pg.wait_for_timeout(1500)
    print("\n".join(pg.evaluate(CHECK)))
    raw = OUT / f"{NAME}.raw.png"
    pg.screenshot(path=str(raw))
    # 1754 CSS px across must land on 297 mm (= 1122.5 px at 96 dpi): scale 0.64.
    pg.pdf(path=str(OUT / f"{NAME}.pdf"), width="297mm", height="420mm", print_background=True,
           scale=297 / 25.4 * 96 / 1754, margin={"top": "0", "right": "0", "bottom": "0", "left": "0"}, page_ranges="1")
    b.close()

im = Image.open(raw).convert("RGB")
print("raw", im.size)
im = im.crop((0, 0, 3508, 4961))
im.save(OUT / f"{NAME}.png", dpi=(300, 300), optimize=True)
im.resize((1200, round(1200 * 4961 / 3508)), Image.LANCZOS).save(OUT / f"{NAME}_预览.jpg", quality=90)
raw.unlink()
print("saved", OUT / f"{NAME}.png", im.size)
