"""Contact sheet of 小游's right arm at several angles (and pivots) to pick a wave that reads in a still image.
   python arm_sheet.py"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
HEADLESS = None  # 可选：指向本机 chrome-headless-shell；None 使用 Playwright 自带浏览器
svg = (ROOT / "assets/xiaoyou.svg").read_text(encoding="utf8")
# (label, css transform for .p-armR); the app's wave swings between -104deg and -140deg about 15% 18% of the arm box.
poses = [("app -104", "rotate(-104deg)"), ("app -122", "rotate(-122deg)"), ("app -140", "rotate(-140deg)"),
         ("lift -150 +shift", "translate(6px,-6px) rotate(-150deg)"), ("lift -165 +shift", "translate(8px,-10px) rotate(-165deg)"),
         ("lift -135 +shift", "translate(10px,-4px) rotate(-135deg)")]
cells = "".join(f'<figure><div class="c" data-t="{t}">{svg}</div><figcaption>{lab}</figcaption></figure>' for lab, t in poses)
html = f"""<!doctype html><meta charset=utf-8><style>body{{margin:0;background:#E8EAEC;display:flex;flex-wrap:wrap;width:1500px;font:16px sans-serif}}
figure{{margin:10px;width:470px}} .c svg{{width:470px;height:auto;display:block}} figcaption{{text-align:center}}</style>{cells}
<script>document.querySelectorAll('.c').forEach(c => c.querySelector('.p-armR').style.transform = c.dataset.t)</script>"""
sys.stdout.reconfigure(encoding="utf-8")
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=HEADLESS)
    pg = b.new_page(viewport={"width": 1500, "height": 1000})
    pg.set_content(html)
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(ROOT / "work/arm-sheet.png"), full_page=True)
    b.close()
print("work/arm-sheet.png")
