"""Deterministic frame capture for the real pages: a virtual clock replaces performance.now and
requestAnimationFrame, so each captured frame is exactly 1/30 s of page time after the last one,
however long the browser takes to render it. Network is limited to the local servers."""
from pathlib import Path

HEADLESS = r"C:\Users\Sgh\AppData\Local\ms-playwright\chromium_headless_shell-1248\chrome-headless-shell-win64\chrome-headless-shell.exe"
LOCAL = ("127.0.0.1", "localhost")

VCLOCK_JS = r"""
(() => {
  let vnow = 1000;
  performance.now = () => vnow;
  const cbs = new Map();
  let nextId = 1;
  window.requestAnimationFrame = (cb) => { const id = nextId++; cbs.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => { cbs.delete(id); };
  // Advance page time by `ms` and run every callback that was waiting for a frame.
  window.__step = (ms) => {
    vnow += ms;
    const list = [...cbs.values()];
    cbs.clear();
    for (const cb of list) { try { cb(vnow); } catch (e) { console.error('raf', e && e.message); } }
    return list.length;
  };
  window.__vnow = () => vnow;
})();
"""


def guard(route):
    url = route.request.url
    host = url.split("/")[2].split(":")[0] if "://" in url else ""
    if host in LOCAL or url.startswith(("data:", "blob:")):
        return route.continue_()
    return route.abort()


def launch(p, gpu=True):
    args = ["--ignore-gpu-blocklist", "--enable-gpu-rasterization"]
    if gpu:
        args += ["--use-angle=d3d11", "--enable-unsafe-swiftshader"]
    return p.chromium.launch(executable_path=HEADLESS, args=args)


def gl_info(page):
    return page.evaluate("""() => {
      const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl');
      if (!g) return 'no webgl';
      const e = g.getExtension('WEBGL_debug_renderer_info');
      return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
    }""")


def pump(page, frames, ms=1000 / 30):
    for _ in range(frames):
        page.evaluate(f"window.__step({ms})")


def out_dir(*parts):
    d = Path(__file__).resolve().parent.joinpath(*parts)
    d.mkdir(parents=True, exist_ok=True)
    return d
