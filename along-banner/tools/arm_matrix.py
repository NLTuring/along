"""Read the exact user-space matrix Chromium applies to 小游's waving arm (CSS rotate about 15% 18% of the
fill-box), so the sketch version can bake it as a plain SVG transform.   python arm_matrix.py"""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
HEADLESS = None  # 可选：指向本机 chrome-headless-shell；None 使用 Playwright 自带浏览器
svg = (ROOT / "assets/xiaoyou.svg").read_text(encoding="utf8")
sys.stdout.reconfigure(encoding="utf-8")
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=HEADLESS)
    pg = b.new_page()
    pg.set_content(f"<!doctype html><body style='margin:0'><div style='width:636px'>{svg}</div>")
    m = pg.evaluate("""() => {
      const s = document.querySelector('svg.xy'), out = {};
      for (const sel of ['.p-armR ellipse', '.p-armL ellipse']) {
        const e = document.querySelector(sel);
        const r = s.getScreenCTM().inverse().multiply(e.getScreenCTM());
        out[sel] = [r.a, r.b, r.c, r.d, r.e, r.f].map(v => +v.toFixed(5));
      }
      const g = document.querySelector('.p-armR').getBBox();
      out.fillBox = [g.x, g.y, g.width, g.height].map(v => +v.toFixed(3));
      return out;
    }""")
    b.close()
print(json.dumps(m, indent=1))
(ROOT / "work/arm-matrix.json").write_text(json.dumps(m), encoding="utf8")
