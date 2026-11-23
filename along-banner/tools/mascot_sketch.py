"""小游 re-drawn as a pencil sketch in the KV's grey-black-orange: graphite hatching instead of gradients, sketchy
double outlines, KV-orange hat and shoes, charcoal scarf, grey backpack. The geometry is the app's own mascot
(mobile/assets/js/assistant-mascot.js, happy face, wave pose with the arm at -104deg), so the silhouette is unchanged.
Includes its pencil-hatched ground shadow. Only flat fills and strokes - no gradients, patterns or masks - so the
print PDF keeps the whole character vector.   python mascot_sketch.py [--seed N] [--out assets/xiaoyou-sketch.svg]"""
import argparse
import math
import re
from pathlib import Path
import numpy as np
from matplotlib.path import Path as MPath
from shapely.geometry import Polygon

ROOT = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser()
ap.add_argument("--seed", type=int, default=11)
ap.add_argument("--out", default="assets/xiaoyou-sketch.svg")
args = ap.parse_args()
rng = np.random.default_rng(args.seed)

# Banner palette.
INK, GRAPHITE, PAPER, SHADOW = "#1D1D1F", "#4A4E55", "#F7F8F9", "#45484D"
OL = 0.86  # outline weight relative to the app's mascot: a little lighter, closer to the KV's pencil contours
ORANGE, ORANGE_HATCH, TONGUE = "#F87F47", "#B94A17", "#FBA47F"
SCARF, SCARF_BACK, RIB = "#5D6167", "#4A4E54", "#2C2F33"
PACK, PACK_HATCH = "#A9ADB3", "#34373C"

# Geometry, verbatim from assistant-mascot.js (viewBox -6 22 212 200).
BODY = "M100 74 C150 74 160 116 158 152 C156 188 134 202 100 202 C66 202 44 188 42 152 C40 116 50 74 100 74 Z"
SCARF_D = "M50 125 C72 138 128 138 150 125 C153.6 129.4 154 136.4 151 141 C128 154 72 154 49 141 C46 136.4 46.4 129.4 50 125 Z"
SCARF_HI = "M55 128.4 C77 139.6 123 139.6 145 128.4"
TAIL_BACK = ("M123 145 C127.5 153.5 131.6 160.6 136.4 166.6 L139.4 168.2 L137.4 170.8 L139.8 173.6 L136.4 174.2 L137.2 177.2 "
             "L133.8 176 L132.6 178.4 L130.4 175.4 C128.4 166.2 125.8 157 120.4 147 Z")
TAIL_FRONT = ("M116 144 C113.5 155 112.6 165 114 174.5 L115.5 177.6 L117 174.4 L118.6 178.1 L120.2 174.4 L121.8 178.1 "
              "L123.4 174.2 L125 177.7 L126.4 173.6 C126 163 125.8 154 126.6 144 Z")
KNOT = "M113 136 C112 130 125 128.5 128 134 C130.6 139 128.4 147.6 121.2 148 C114.6 148.3 113.6 141 113 136 Z"
CROWN = "M68 80 C70 52 130 52 132 80 Z"
BAND = "M70 73 Q100 66.5 130 73 L130.6 78 Q100 71.5 69.4 78 Z"
BRIM = "M26 90 Q100 58 174 90 Q100 79 26 90 Z"
EYES = ["M74 110 Q82 100.5 90 110", "M110 110 Q118 100.5 126 110"]
MOUTH = "M90 120 L110 120 Q108 132 100 132 Q92 132 90 120 Z"
TONGUE_D = "M94.5 129 Q100 124.5 105.5 129 Q100 131.5 94.5 129 Z"
# The arms' full user-space matrices as Chromium applies them (tools/arm_matrix.py; right arm = CSS rotate(-104deg)).
ARM_L = (0.88295, 0.46947, -0.46947, 0.88295, 75.69062, 0.42152)
ARM_R = (-0.66913, -0.74314, 0.74314, -0.66913, 156.73265, 347.76068)

TOK = re.compile(r"[MLHVCQZ]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")


def flatten(d, step=0.35):
    """Absolute M/L/H/V/C/Q/Z path -> list of (Nx2 points, closed)."""
    toks, i, out, cur, cmd = TOK.findall(d), 0, [], [], None
    x = y = sx = sy = 0.0

    def num():
        nonlocal i
        i += 1
        return float(toks[i - 1])

    def add(fn, length):
        n = max(4, int(length / step))
        cur.extend(fn(t) for t in np.linspace(0, 1, n + 1)[1:])

    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]
            i += 1
            if cmd == "Z":
                out.append((np.array(cur), True))
                cur, x, y = [], sx, sy
                continue
        if cmd == "M":
            if cur:
                out.append((np.array(cur), False))
            x, y = num(), num()
            sx, sy, cur, cmd = x, y, [(x, y)], "L"
        elif cmd in "LHV":
            nx = num() if cmd != "V" else x
            ny = num() if cmd == "L" else (num() if cmd == "V" else y)
            p0 = (x, y)
            add(lambda t, p0=p0, nx=nx, ny=ny: (p0[0] + (nx - p0[0]) * t, p0[1] + (ny - p0[1]) * t), math.hypot(nx - x, ny - y))
            x, y = nx, ny
        elif cmd == "C":
            c1, c2, p = (num(), num()), (num(), num()), (num(), num())
            p0 = (x, y)
            f = lambda t, p0=p0, c1=c1, c2=c2, p=p: tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * e
                                                         for a, b, c, e in zip(p0, c1, c2, p))
            add(f, math.dist(p0, c1) + math.dist(c1, c2) + math.dist(c2, p))
            x, y = p
        elif cmd == "Q":
            c, p = (num(), num()), (num(), num())
            p0 = (x, y)
            f = lambda t, p0=p0, c=c, p=p: tuple((1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * e for a, b, e in zip(p0, c, p))
            add(f, math.dist(p0, c) + math.dist(c, p))
            x, y = p
    if cur:
        out.append((np.array(cur), False))
    return out


def ellipse(cx, cy, rx, ry, m=None, n=160):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    p = np.c_[cx + rx * np.cos(t), cy + ry * np.sin(t)]
    if m:
        a, b, c, d, e, f = m
        p = np.c_[a * p[:, 0] + c * p[:, 1] + e, b * p[:, 0] + d * p[:, 1] + f]
    return p


def rrect(x, y, w, h, r, n=12):
    pts = []
    for cx, cy, a0 in ((x + w - r, y + r, -90), (x + w - r, y + h - r, 0), (x + r, y + h - r, 90), (x + r, y + r, 180)):
        for t in np.linspace(a0, a0 + 90, n):
            pts.append((cx + r * math.cos(math.radians(t)), cy + r * math.sin(math.radians(t))))
    return np.array(pts)


def region(pts, shrink=0.55):
    g = Polygon(pts).buffer(0).buffer(-shrink)
    if g.geom_type == "MultiPolygon":
        g = max(g.geoms, key=lambda q: q.area)
    return MPath(np.array(g.exterior.coords))


# ---- light and tone (0 = lit paper, 1 = deepest shadow); light from the upper left, mostly from the front so the
#      body stays white and only a crescent along its right and lower edge is hatched, like the KV tower's spheres ----
LIGHT = np.array([-0.42, -0.5, 0.76])
LIGHT /= np.linalg.norm(LIGHT)


def ellipsoid(cx, cy, rx, ry, rot=0.0):
    c, s = math.cos(rot), math.sin(rot)

    def f(x, y):
        X, Y = x - cx, y - cy
        u, v = (c * X + s * Y) / rx, (-s * X + c * Y) / ry
        w = np.sqrt(1 - np.clip(u * u + v * v, 0, .999))
        return 1 - np.clip((c * u - s * v) * LIGHT[0] + (s * u + c * v) * LIGHT[1] + w * LIGHT[2], 0, 1)
    return f


def clip01(v):
    return np.clip(v, 0, 1)


def brim_low(x):  # lower edge of the brim: Q from (174,90) via (100,79) to (26,90) is linear in x
    t = clip01((174 - x) / 148)
    return 90 - 22 * t * (1 - t)


_sb = flatten("M151 141 C128 154 72 154 49 141")[0][0]
_st = flatten("M50 125 C72 138 128 138 150 125")[0][0]


def scarf_bot(x):
    return np.interp(x, _sb[::-1, 0], _sb[::-1, 1])


def scarf_mid(x):
    return (scarf_bot(x) + np.interp(x, _st[:, 0], _st[:, 1])) / 2


_body_shade = ellipsoid(100, 140, 60, 66)


def tone_body(x, y):
    t = _body_shade(x, y)
    db = y - brim_low(x)
    t = np.where((db >= 0) & (db <= 8), np.maximum(t, .92 - .42 * db / 8), t)       # hat brim's shadow on the face
    ds = y - scarf_bot(x)
    t = np.where((ds >= 0) & (ds <= 6), np.maximum(t, .88 - .4 * ds / 6), t)        # scarf's shadow on the body
    face = ((x - 100) / 40) ** 2 + ((y - 117) / 21) ** 2 < 1
    return np.where(face & (db > 8), np.minimum(t, .3), t)                            # keep the face clean


def tone_brim(x, y):
    return .18 + .62 * clip01((x - 96) / 78) ** 1.2 + .4 * clip01(1 - (brim_low(x) - y) / 4.5)


def tone_scarf(x, y):
    return .28 + .55 * clip01(abs(x - 100) / 52) ** 1.6 + .12 * clip01((x - 100) / 52) + .32 * clip01((y - scarf_mid(x)) / 6)


def hatch(reg, tone, angle, spacing, thr, step=.3, minlen=1.5, jit=.05):
    v = reg.vertices
    cx, cy = v.mean(0)
    R = np.hypot(v[:, 0] - cx, v[:, 1] - cy).max() + 1
    a = math.radians(angle)
    dx, dy = math.cos(a), -math.sin(a)
    nx, ny = -dy, dx
    t = np.arange(-R, R + step, step)
    segs = []
    for k in range(-int(R / spacing) - 1, int(R / spacing) + 2):
        off = (k + rng.uniform(-.14, .14)) * spacing
        px, py = cx + nx * off + dx * t, cy + ny * off + dy * t
        on = reg.contains_points(np.c_[px, py]) & (tone(px, py) > thr + rng.uniform(-jit, jit))
        edges = np.flatnonzero(np.diff(np.r_[0, on.astype(np.int8), 0]))
        for s, e in zip(edges[::2], edges[1::2]):
            t0, t1 = t[s] + rng.uniform(0, .7), t[e - 1] - rng.uniform(0, .7)
            if t1 - t0 < minlen:
                continue
            w0, w1 = rng.normal(0, .12, 2)
            segs.append((cx + nx * (off + w0) + dx * t0, cy + ny * (off + w0) + dy * t0,
                         cx + nx * (off + w1) + dx * t1, cy + ny * (off + w1) + dy * t1))
    return segs


def lines(segs, color, width, opacity):
    if not segs:
        return ""
    d = "".join(f"M{a:.2f} {b:.2f}L{c:.2f} {e:.2f}" for a, b, c, e in segs)
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-opacity="{opacity}" stroke-linecap="round"/>'


LAYERS = {  # material -> [(angle, spacing, threshold, width, opacity)]
    "paper": [(52, 2.6, .6, .5, .78), (-36, 3.0, .76, .46, .72), (88, 3.3, .9, .44, .66)],
    "orange": [(52, 2.3, .5, .58, .88), (-36, 2.7, .72, .52, .82)],
    "scarf": [(52, 2.1, .5, .6, .9), (-36, 2.5, .72, .56, .85)],
    "pack": [(52, 2.3, .45, .58, .85), (-36, 2.7, .66, .52, .8)],
}
HCOL = {"paper": GRAPHITE, "orange": ORANGE_HATCH, "scarf": INK, "pack": PACK_HATCH}


def shade(pts, tone, material, shrink=.55):
    reg = region(pts, shrink)
    return "".join(lines(hatch(reg, tone, a, sp, th), HCOL[material], w, op) for a, sp, th, w, op in LAYERS[material])


def sketch(pts, closed, amp=.85, over=.08, shift=1.0, rot=.6):
    """One loose pencil pass along an outline: wobbles, misregisters a little and overshoots its start."""
    if closed and np.hypot(*(pts[0] - pts[-1])) > 1e-6:
        pts = np.vstack([pts, pts[:1]])
    L = np.r_[0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]
    n = max(10, int(L[-1] / .8))
    s = np.linspace(0, L[-1], n)
    P = np.c_[np.interp(s, L, pts[:, 0]), np.interp(s, L, pts[:, 1])]
    if closed:
        P = P[:-1]
        P = P[(rng.integers(0, len(P)) + np.arange(int(len(P) * (1 + over)))) % len(P)]
    else:
        t0 = (P[1] - P[0]) / np.linalg.norm(P[1] - P[0])
        t1 = (P[-1] - P[-2]) / np.linalg.norm(P[-1] - P[-2])
        P = np.vstack([P[0] - t0 * rng.uniform(1, 2.5), P, P[-1] + t1 * rng.uniform(1, 2.5)])
    T = np.gradient(P, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-9
    arc = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
    p1, p2 = rng.uniform(0, 2 * np.pi, 2)
    off = amp * (.6 * np.sin(2 * np.pi * arc / 37 + p1) + .4 * np.sin(2 * np.pi * arc / 13 + p2))
    P = P + np.c_[-T[:, 1], T[:, 0]] * off[:, None]
    c = P.mean(0)
    a = math.radians(rng.uniform(-rot, rot))
    P = (P - c) @ np.array([[math.cos(a), math.sin(a)], [-math.sin(a), math.cos(a)]]) + c + rng.uniform(-shift, shift, 2)
    d = "M" + "L".join(f"{x:.2f} {y:.2f}" for x, y in P)
    return f'<path d="{d}" fill="none" stroke="{GRAPHITE}" stroke-width=".7" stroke-opacity=".7" stroke-linecap="round" stroke-linejoin="round"/>'


def sk(d_or_pts, passes=1, closed=True, **kw):
    subs = flatten(d_or_pts) if isinstance(d_or_pts, str) else [(d_or_pts, closed)]
    return "".join(sketch(p, c, **kw) for p, c in subs for _ in range(passes))


def mat(m):
    return "matrix(" + " ".join(f"{v:.5f}" for v in m) + ")"


def ol(width):
    return f'stroke="{INK}" stroke-width="{width * OL:.2f}" stroke-linejoin="round" stroke-linecap="round"'


parts = []
add = parts.append
# Ground shadow: two crossing pencil-hatched ellipses under the feet.
for rx, ry, ang, sp, w, op in ((57.3, 8.7, -56, 3.3, .74, .42), (36.7, 5.3, 60, 3.0, .68, .5)):
    add(lines(hatch(MPath(ellipse(99, 208.7, rx, ry)), lambda x, y: np.ones_like(x), ang, sp, -1), SHADOW, w, op))

# Backpack (behind the body).
pack = rrect(140, 122, 30, 52, 12)
add(f'<rect x="140" y="122" width="30" height="52" rx="12" fill="{PACK}"/>')
add(shade(pack, lambda x, y: .42 + .3 * clip01((y - 122) / 52) + .25 * clip01((158 - x) / 18), "pack"))
add(sk(pack, amp=.45))
add(f'<rect x="140" y="122" width="30" height="52" rx="12" fill="none" {ol(2.6)}/>')
add(f'<path d="M145 142H165" fill="none" stroke="{INK}" stroke-width="1.8" stroke-opacity=".6" stroke-linecap="round"/>')
add(f'<rect x="152" y="139" width="6" height="7" rx="1.5" fill="{ORANGE}" {ol(1.4)}/>')

# Shoes.
for cx in (80, 120):
    shoe = ellipse(cx, 201, 13.5, 7.5)
    add(f'<ellipse cx="{cx}" cy="201" rx="13.5" ry="7.5" fill="{ORANGE}"/>')
    add(shade(shoe, lambda x, y, cx=cx: .3 + .62 * clip01((y - 199.5) / 8.5) + .12 * clip01((x - cx) / 13.5), "orange"))
    add(sk(shoe, amp=.4))
    add(f'<ellipse cx="{cx}" cy="201" rx="13.5" ry="7.5" fill="none" {ol(2.4)}/>')

# Arms (the right one raised in the wave).
for m, (cx, cy) in ((ARM_L, (37, 152)), (ARM_R, (163, 152))):
    pts = ellipse(cx, cy, 10, 17, m)
    wx, wy = m[0] * cx + m[2] * cy + m[4], m[1] * cx + m[3] * cy + m[5]
    add(f'<ellipse cx="{cx}" cy="{cy}" rx="10" ry="17" transform="{mat(m)}" fill="{PAPER}"/>')
    add(shade(pts, ellipsoid(wx, wy, 10, 17, math.atan2(m[1], m[0])), "paper"))
    add(sk(pts, amp=.4))
    add(f'<ellipse cx="{cx}" cy="{cy}" rx="10" ry="17" transform="{mat(m)}" fill="none" {ol(2.7)}/>')

# Body.
body = flatten(BODY)[0][0]
add(f'<path d="{BODY}" fill="{PAPER}"/>')
add(shade(body, tone_body, "paper", shrink=.7))
add(sk(BODY, passes=2, amp=.7))
add(f'<path d="{BODY}" fill="none" {ol(2.8)}/>')

# Scarf: charcoal knit, ribs across the band, shading toward the wrap-around ends and the lower edge.
scarf = flatten(SCARF_D)[0][0]
add(f'<path d="{SCARF_D}" fill="{SCARF}"/>')
rreg = region(scarf, .6)
ribs = []
for x in np.arange(52, 150, 4.2):
    ys = np.arange(120, 158, .3)
    on = rreg.contains_points(np.c_[np.full_like(ys, x), ys])
    if on.sum() > 4:
        y0, y1 = ys[on][0] + rng.uniform(0, .6), ys[on][-1] - rng.uniform(0, .6)
        tilt = (x - 100) * .035
        ribs.append((x - tilt, y0, x + tilt, y1))
add(lines(ribs, RIB, .7, .6))
add(shade(scarf, tone_scarf, "scarf"))
add(f'<path d="{SCARF_HI}" fill="none" stroke="#E8EAEC" stroke-width="1.2" stroke-opacity=".38" stroke-linecap="round"/>')
add(sk(SCARF_D, amp=.5))
add(f'<path d="{SCARF_D}" fill="none" {ol(2.2)}/>')

# Scarf tails and knot.
for d, fill, base in ((TAIL_BACK, SCARF_BACK, .62), (TAIL_FRONT, SCARF, .4)):
    pts = flatten(d)[0][0]
    add(f'<path d="{d}" fill="{fill}"/>')
    add(shade(pts, lambda x, y, b=base: b + .35 * clip01((y - 146) / 30), "scarf", shrink=.45))
    add(f'<path d="{d}" fill="none" {ol(2.1)}/>')
knot = flatten(KNOT)[0][0]
add(f'<path d="{KNOT}" fill="{SCARF}"/>')
add(shade(knot, ellipsoid(121, 140, 8.5, 9), "scarf", shrink=.45))
add(f'<path d="{KNOT}" fill="none" {ol(2.1)}/>')

# Face: orange pencil blush, ink eyes, ink mouth with a light-orange tongue.
for cx in (69, 131):
    add(f'<ellipse cx="{cx}" cy="121" rx="11" ry="6" fill="{ORANGE}" fill-opacity=".16"/>')
    add(lines([(cx + 4 * i - 2.1, 123.4, cx + 4 * i + 2.1, 118.4) for i in (-1, 0, 1)], ORANGE, 1.35, .95))
for d in EYES:
    add(f'<path d="{d}" fill="none" {ol(3.7)}/>')  # 3.7 x OL keeps the app's eye weight
add(f'<path d="{MOUTH}" fill="{INK}" {ol(2.4)}/>')
add(f'<path d="{TONGUE_D}" fill="{TONGUE}"/>')

# Hat: KV orange crown and brim, white band.
crown = flatten(CROWN)[0][0]
add(f'<path d="{CROWN}" fill="{ORANGE}"/>')
add(shade(crown, ellipsoid(100, 80, 32, 26), "orange"))
add(sk(CROWN, amp=.5))
add(f'<path d="{CROWN}" fill="none" {ol(2.8)}/>')
add(f'<path d="{BAND}" fill="{PAPER}" {ol(1.5)}/>')
brim = flatten(BRIM)[0][0]
add(f'<path d="{BRIM}" fill="{ORANGE}"/>')
add(shade(brim, tone_brim, "orange", shrink=.5))
add(sk(BRIM, passes=2, amp=.6))
add(f'<path d="{BRIM}" fill="none" {ol(2.8)}/>')

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 22 212 200">'
       f'<!-- 小游, pencil-sketch edition for the Along banner; generated by tools/mascot_sketch.py -->'
       + "".join(parts) + "</svg>")
out = ROOT / args.out
out.write_text(svg, encoding="utf8")
print(out.name, f"{len(svg) / 1024:.0f} KB")
