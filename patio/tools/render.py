"""Composite realistic landscape materials into the annotated patio photos.

Zones (from the scribbles):
  pink   -> crushed (decomposed) granite, the whole flagstone patio
  orange -> crushed granite with the old patio flagstones set as stepping stones
  blue   -> river rock (dry creek / drainage / AC pad)
  green  -> hardwood mulch beds
  red    -> french drain markers 0 (catch basin) and 1 (outlet into river rock)
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import zones as Z

# per-photo config: which zones to honour, pixels-per-inch at the bottom edge
CONFIG = {
    '111148': dict(zones=['blue', 'orange'], ppi=11, seed=11),
    # side path: granite with centred steppers and the drain; river rock only at the outlet pocket (1)
    '111207': dict(zones=['orange', 'blue'], ppi=11, seed=12, markers=True,
                   recolor=[('blue', 'orange', [(0, 0), (510, 0), (510, 1361), (0, 1361)])]),
    # shed corner: the left is the path (granite + steppers) run up to the gate; the band is granite
    # except for a pocket of river rock at the foot of the rubble pile in front of the shed
    '111328': dict(zones=['pink', 'orange', 'green', 'blue'], ppi=12, seed=13, rename=[('pink', 'orange'), ('blue', 'pink')],
                   extra={'orange': [(0, 325), (100, 335), (300, 380), (330, 392), (330, 440), (240, 470), (0, 470)]},
                   ceiling=[(0, 322), (100, 333), (300, 378), (330, 390), (420, 402), (520, 402), (700, 470), (850, 520), (1002, 560)],
                   recolor_after=[('pink', 'blue', [(273, 399), (325, 378), (401, 418), (478, 380), (554, 409), (577, 438),
                                                    (573, 475), (543, 500), (496, 515), (439, 521), (382, 518), (334, 509),
                                                    (297, 487), (276, 457)])]),
    '111341': dict(zones=['pink'], ppi=13, seed=14),
    # from the walk: the oleander pot stays; the edged bed at the left edge keeps its mulch
    '111412': dict(zones=['pink', 'green'], ppi=14, seed=15, protect=['pot', ('keep', [(1130, 396), (1388, 378), (1388, 662), (1152, 646)]), ('keep', [(1162, 640), (1185, 618), (1240, 608), (1300, 606), (1345, 618), (1362, 650), (1366, 720),
                                                     (1356, 790), (1335, 815), (1250, 826), (1190, 820), (1168, 795), (1152, 720)])],
                   shape={'green': ([(0, 388), (60, 396), (110, 438), (146, 480), (140, 522), (105, 566), (60, 612), (0, 642)], 'pink')}),
    '111421': dict(zones=['pink'], ppi=14, seed=16, protect=['pot']),
    # off the pad: the canna corner is granite too, packed against the slab edge; the cannas stay
    # off the pad: the cannas come out and the corner is granite packed against the slab edge;
    # the siding behind the plant is patched from the clean wall to its left
    '111436': dict(zones=['pink'], ppi=14, seed=17,
                   patch=[((1112, 160, 1396, 580), 300, 0.045)],
                   extra={'pink': [(1122, 540), (1396, 578), (1396, 1047), (1000, 1047), (1000, 900), (1078, 886)]}),
    # rain barrel: the bed is a D against the house, from the cannas to the shrub, with one clean arc;
    # everything outside the arc (the canna corner by the walk, the rubble by the fence) is granite
    '111447': dict(zones=['pink', 'green'], ppi=12, seed=18,
                   recolor=[('green', 'pink', [(0, 760), (600, 760), (600, 1351), (0, 1351)])],
                   shape={'green': ([(470, 735), (520, 690), (560, 640), (600, 600), (650, 575),
                                     (720, 555), (800, 548), (860, 555), (905, 590), (915, 650), (895, 720), (855, 785),
                                     (790, 835), (712, 850), (640, 830), (580, 790), (530, 750)], 'pink')}),
    # pool equipment: the strip between the pump and the fence, up to the AC, is the side path:
    # granite with the flagstone steppers set in
    '111457': dict(zones=['pink', 'green', 'orange'], ppi=13, seed=19,
                   shape={'orange': ([(1195, 185), (1400, 195), (1400, 445), (1330, 430), (1270, 415), (1215, 395),
                                      (1190, 340), (1190, 250)], None)}),
}


# ---------------------------------------------------------------- helpers
def ppi_at(y, H, ppi_bottom):
    t = np.clip(y / H, 0, 1)
    return ppi_bottom * (0.22 + 0.78 * t ** 1.6)


def flatten_at(y, H):
    return 0.42 + 0.33 * np.clip(y / H, 0, 1)


def value_noise(shape, sigma, rng):
    n = rng.standard_normal(shape).astype(np.float32)
    n = ndi.gaussian_filter(n, sigma)
    return n / (n.std() + 1e-6)


def luma(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def blob_polygon(cx, cy, rx, ry, rng, n=None):
    n = n or int(rng.integers(5, 9))
    angs = np.sort(rng.random(n) * 2 * np.pi)
    angs = angs + (np.arange(n) * 2 * np.pi / n - angs) * 0.65  # spread them out
    pts = []
    for a in angs:
        k = 0.78 + rng.random() * 0.3
        pts.append((cx + np.cos(a) * rx * k, cy + np.sin(a) * ry * k))
    return pts


# ---------------------------------------------------------------- textures
def tex_dg(H, W, rng):
    base = np.array([199, 168, 131], np.float32)
    tex = np.empty((H, W, 3), np.float32)
    tex[:] = base
    tex += value_noise((H, W), 9, rng)[..., None] * np.array([4.5, 4, 3.5], np.float32)
    tex += value_noise((H, W), 45, rng)[..., None] * np.array([5, 4.5, 4], np.float32)
    tex += value_noise((H, W), 0.9, rng)[..., None] * 7
    tex += rng.standard_normal((H, W, 1)).astype(np.float32) * 6
    tex += rng.standard_normal((H, W, 3)).astype(np.float32) * 2
    dots = rng.random((H, W))
    tex[dots > 0.992] += 22
    tex[dots < 0.006] -= 20
    return tex.clip(0, 255)


def tex_limestone(H, W, rng):
    base = np.array([208, 198, 172], np.float32)
    tex = np.empty((H, W, 3), np.float32)
    tex[:] = base
    tex += value_noise((H, W), 9, rng)[..., None] * np.array([12, 11, 9], np.float32)
    tex += value_noise((H, W), 30, rng)[..., None] * np.array([11, 10, 8], np.float32)
    tex += rng.standard_normal((H, W, 1)).astype(np.float32) * 4
    rust = np.clip((value_noise((H, W), 7, rng) - 1.25) * 1.6, 0, 1)[..., None]
    tex = tex * (1 - rust) + np.array([198, 160, 112], np.float32) * rust
    pits = np.clip((value_noise((H, W), 1.4, rng) - 2.1) * 2, 0, 1)[..., None]
    tex = tex * (1 - pits * 0.35)
    return tex.clip(0, 255)


def tex_mulch(H, W, rng, ppi_bottom, bbox):
    img = Image.new('RGB', (W, H), (72, 52, 37))
    d = ImageDraw.Draw(img)
    pal = [(96, 68, 46), (118, 86, 58), (60, 42, 30), (140, 104, 70), (80, 58, 40),
           (50, 36, 26), (105, 78, 52), (128, 92, 60), (66, 46, 32)]
    x0, y0, x1, y1 = bbox
    n = int((x1 - x0) * (y1 - y0) / 30)
    xs = x0 + rng.random(n) * (x1 - x0)
    ys = y0 + rng.random(n) * (y1 - y0)
    for x, y in zip(xs, ys):
        ppi = ppi_at(y, H, ppi_bottom)
        fl = flatten_at(y, H)
        L = (1.2 + rng.random() * 2.8) * ppi
        ang = rng.random() * np.pi
        dx = np.cos(ang) * L / 2
        dy = np.sin(ang) * L / 2 * fl
        w = max(1, int(round(0.3 * ppi * (0.5 + rng.random() * 0.9))))
        d.line((x - dx, y - dy, x + dx, y + dy), fill=pal[int(rng.integers(len(pal)))], width=w)
    tex = np.asarray(img).astype(np.float32)
    tex = tex * 0.85 + np.array([78, 56, 40], np.float32) * 0.15
    tex *= (1 + 0.08 * value_noise((H, W), 40, rng))[..., None]
    tex += rng.standard_normal((H, W, 1)).astype(np.float32) * 5
    return tex.clip(0, 255)


def tex_river(H, W, rng, ppi_bottom, mask):
    img = Image.new('RGB', (W, H), (58, 54, 50))
    d = ImageDraw.Draw(img)
    pal = [(176, 166, 150), (196, 184, 164), (150, 142, 132), (210, 200, 184), (128, 122, 116),
           (188, 170, 146), (166, 156, 146), (204, 190, 170), (140, 132, 124), (180, 174, 164),
           (112, 104, 98), (200, 180, 150), (158, 150, 140)]
    near = ndi.binary_dilation(mask, iterations=25)
    ys, xs = np.nonzero(near)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    y = float(y0)
    while y < y1:
        ppi = ppi_at(y, H, ppi_bottom)
        fl = flatten_at(y, H)
        r_mean = 1.0 * ppi
        step = r_mean * 1.25
        x = x0 + rng.random() * step
        while x < x1:
            px = x + rng.normal(0, step * 0.2)
            py = y + rng.normal(0, step * 0.2 * fl)
            ix, iy = int(np.clip(px, 0, W - 1)), int(np.clip(py, 0, H - 1))
            if near[iy, ix]:
                rx = r_mean * (0.45 + rng.random() * 1.1)
                if rng.random() < 0.07:
                    rx *= 1.6
                ry = rx * fl * (0.7 + rng.random() * 0.55)
                c = np.array(pal[int(rng.integers(len(pal)))], np.float32) * (0.88 + rng.random() * 0.24)
                c = c.clip(0, 255)
                dark = tuple(int(v * 0.45) for v in c)
                mid = tuple(int(v) for v in c)
                hi = tuple(int(min(255, v * 1.13)) for v in c)
                d.ellipse((px - rx + rx * 0.1, py - ry + ry * 0.18, px + rx + rx * 0.1, py + ry + ry * 0.18), fill=dark)
                d.ellipse((px - rx, py - ry, px + rx, py + ry), fill=mid)
                d.ellipse((px - rx * 0.42 - rx * 0.2, py - ry * 0.42 - ry * 0.28,
                           px + rx * 0.42 - rx * 0.2, py + ry * 0.42 - ry * 0.28), fill=hi)
            x += step * (0.75 + rng.random() * 0.5)
        y += step * fl * 0.85
    # a loose bank of larger stones along the edges of the channel
    band = mask & ~ndi.binary_erosion(mask, iterations=10)
    by, bx = np.nonzero(band)
    if len(by):
        n = max(6, len(by) // 260)
        picks = rng.choice(len(by), size=min(n, len(by)), replace=False)
        for i in sorted(picks, key=lambda i: by[i]):
            px, py = float(bx[i]), float(by[i])
            ppi = ppi_at(py, H, ppi_bottom)
            fl = flatten_at(py, H)
            rx = (1.6 + rng.random() * 1.4) * ppi
            ry = rx * fl * (0.7 + rng.random() * 0.4)
            c = np.array(pal[int(rng.integers(len(pal)))], np.float32) * (0.9 + rng.random() * 0.2)
            c = c.clip(0, 255)
            d.ellipse((px - rx + rx * 0.1, py - ry + ry * 0.2, px + rx + rx * 0.1, py + ry + ry * 0.2),
                      fill=tuple(int(v * 0.42) for v in c))
            d.ellipse((px - rx, py - ry, px + rx, py + ry), fill=tuple(int(v) for v in c))
            d.ellipse((px - rx * 0.45 - rx * 0.2, py - ry * 0.45 - ry * 0.3, px + rx * 0.45 - rx * 0.2,
                       py + ry * 0.45 - ry * 0.3), fill=tuple(int(min(255, v * 1.12)) for v in c))
    img = img.filter(ImageFilter.GaussianBlur(0.9))
    tex = np.asarray(img).astype(np.float32)
    tex += rng.standard_normal((H, W, 1)).astype(np.float32) * 4
    return tex.clip(0, 255)


def stepping_stones(zone, H, W, rng, ppi_bottom):
    """Lay repurposed flagstones over the zone on a staggered, perspective-scaled grid.
    Returns (mask, list of (polygon, bbox))."""
    ys, xs = np.nonzero(zone)
    y0, y1 = ys.min(), ys.max()
    stones = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(stones)
    polys = []
    y = float(y1) + 4
    row = 0
    while y > y0:
        ppi = ppi_at(y, H, ppi_bottom)
        fl = flatten_at(y, H)
        sh, gap = 19 * ppi * fl, 2.6 * ppi
        x = rng.random() * 26 * ppi - 20 * ppi
        while x < W + 30 * ppi:
            sw = (16 + rng.random() * 13) * ppi
            if rng.random() < 0.08:  # breathing room: an occasional skipped stone
                x += sw + gap
                continue
            cx = x + sw / 2 + rng.normal(0, 0.03 * sw)
            cy = y - sh / 2 + rng.normal(0, 0.07 * sh)
            poly = blob_polygon(cx, cy, sw / 2 - gap / 2, sh / 2 - gap * fl / 2, rng)
            zrow = zone[int(np.clip(cy, 0, H - 1))]
            xs_row = np.nonzero(zrow)[0]
            centred = len(xs_row) > 0 and (xs_row.min() + 0.2 * (xs_row.max() - xs_row.min()) <= cx <=
                                           xs_row.max() - 0.2 * (xs_row.max() - xs_row.min()))
            tmp = Image.new('L', (W, H), 0)
            ImageDraw.Draw(tmp).polygon(poly, fill=255)
            tm = np.asarray(tmp) > 0
            area = tm.sum()
            if centred and area > 0 and (tm & zone).sum() / area >= 0.72:
                d.polygon(poly, fill=255)
                px = [p[0] for p in poly]; py = [p[1] for p in poly]
                polys.append((poly, (int(min(px)), int(min(py)), int(max(px)) + 1, int(max(py)) + 1)))
            x += sw + gap * (0.9 + rng.random() * 0.6)
        y -= sh + gap * fl
        row += 1
    return (np.asarray(stones) > 0) & zone, polys


_ATLAS = {}


def stone_atlas(src_dir):
    """Real limestone faces sampled from the flagstone patio photo (pool-side view)."""
    if 'atlas' in _ATLAS:
        return _ATLAS['atlas']
    f = 'IMG_20261107_111421.jpg'
    og, mk, zones, _ = Z.extract(os.path.join(src_dir, 'Original', f), os.path.join(src_dir, 'Markup', f))
    a = np.asarray(og).astype(np.float32)
    bright = ndi.binary_closing((luma(a) > 125) & zones['pink'], iterations=3)
    dist = ndi.distance_transform_edt(bright)
    ys, xs = np.nonzero(dist >= 18)
    _ATLAS['atlas'] = (a, np.stack([xs, ys], 1), dist)
    return _ATLAS['atlas']


def paste_stone_faces(tex, polys, H, W, rng, src_dir):
    atlas, centers, dist = stone_atlas(src_dir)
    AH, AW = atlas.shape[:2]
    for poly, (bx0, by0, bx1, by1) in polys:
        bx0, by0 = max(bx0, 0), max(by0, 0)
        bx1, by1 = min(bx1, W), min(by1, H)
        bw, bh = bx1 - bx0, by1 - by0
        if bw < 2 or bh < 2:
            continue
        need = min(bw * 0.3, dist.max() * 0.85)
        good = centers[dist[centers[:, 1], centers[:, 0]] >= need]
        cx, cy = good[int(rng.integers(len(good)))]
        # keep the sampled face inside one real stone: crop no wider than the
        # distance to the nearest joint
        lim = 1.9 * dist[cy, cx]
        cw, ch = int(min(max(24, bw * 0.55), lim)), int(min(max(16, bh * 0.55), lim * 0.8))
        sx0 = int(np.clip(cx - cw // 2, 0, AW - cw)); sy0 = int(np.clip(cy - ch // 2, 0, AH - ch))
        patch = Image.fromarray(atlas[sy0:sy0 + ch, sx0:sx0 + cw].astype(np.uint8))
        if rng.random() < 0.5:
            patch = patch.transpose(Image.FLIP_LEFT_RIGHT)
        patch = patch.resize((bw, bh), Image.BICUBIC)
        p = np.asarray(patch).astype(np.float32) * (0.94 + rng.random() * 0.12)
        p += rng.standard_normal((bh, bw, 1)).astype(np.float32) * 5
        p += ndi.gaussian_filter(rng.standard_normal((bh, bw)).astype(np.float32), 1.2)[..., None] * 9
        m = Image.new('L', (bw, bh), 0)
        ImageDraw.Draw(m).polygon([(x - bx0, y - by0) for x, y in poly], fill=255)
        mm = np.asarray(m) > 0
        sub = tex[by0:by1, bx0:bx1]
        sub[mm] = p[mm].clip(0, 255)
    return tex


def draw_catch_basin(canvas, x, y, H, ppi_bottom):
    ppi = ppi_at(y, H, ppi_bottom)
    fl = flatten_at(y, H)
    w, h = 9 * ppi, 9 * ppi * fl
    d = ImageDraw.Draw(canvas)
    d.rectangle((x - w / 2, y - h / 2, x + w / 2, y + h / 2), fill=(48, 50, 52), outline=(30, 32, 34), width=2)
    n = 6
    for i in range(1, n):
        gx = x - w / 2 + w * i / n
        d.line((gx, y - h / 2 + 2, gx, y + h / 2 - 2), fill=(82, 86, 90), width=1)
        gy = y - h / 2 + h * i / n
        d.line((x - w / 2 + 2, gy, x + w / 2 - 2, gy), fill=(82, 86, 90), width=1)
    d.rectangle((x - w / 2, y - h / 2, x + w / 2, y + h / 2), outline=(150, 150, 150), width=1)


# ---------------------------------------------------------------- keep-outs
def _big(m, min_area, open_iters=3):
    m = ndi.binary_opening(m, iterations=open_iters)
    lab, n = ndi.label(m)
    if n == 0:
        return m
    sizes = ndi.sum(m, lab, range(1, n + 1))
    return np.isin(lab, [i + 1 for i, sz in enumerate(sizes) if sz >= min_area])


def bright_flat(og):
    """Siding, cinder block, white pipe: bright, unsaturated, big. A drawn shape never paints these."""
    a = np.asarray(og).astype(np.float32)
    L = luma(a)
    mx = a.max(2); mn = a.min(2)
    sat = (mx - mn) / (mx + 1e-3)
    m1 = ndi.uniform_filter(L, 41); m2 = ndi.uniform_filter(L * L, 41)
    flat = np.sqrt(np.clip(m2 - m1 * m1, 0, None)) < 16  # flagstone and gravel are textured, walls are not
    return ndi.binary_dilation(_big((L > 150) & (sat < 0.3) & flat, 3000, 4), iterations=2)


def protect_mask(og, kinds):
    """Things that stay in the photo whatever zone they sit on."""
    H, W = og.size[1], og.size[0]
    keep = np.zeros((H, W), bool)
    if not kinds:
        return keep
    h, s, v = Z.hsv_arrays(og)
    a = np.asarray(og).astype(np.float32)
    L = luma(a)
    for kind in kinds:
        arg = None
        if isinstance(kind, tuple):
            kind, arg = kind
        if kind == 'plants':  # a tall plant (cannas): green and dark-red leaves of components that reach above y=arg
            g = ((h >= 60) & (h < 170) & (s > 0.28) & (v > 0.12)) | \
                (((h < 16) | (h > 330)) & (s > 0.3) & (v > 0.15) & (v < 0.7))
            g = ndi.binary_opening(g, iterations=2)
            lab, n = ndi.label(ndi.binary_closing(g, iterations=3))
            tall = np.unique(lab[:int(arg or H // 2)])
            m = np.isin(lab, tall[tall > 0]) & g
            keep |= ndi.binary_dilation(ndi.binary_fill_holes(_big(m, 1500, 1)), iterations=6)
        elif kind == 'pot':  # terracotta
            r = ((h < 28) | (h > 340)) & (s > 0.3) & (v > 0.15)
            keep |= ndi.binary_dilation(ndi.binary_fill_holes(_big(r, 4000, 3)), iterations=3)
        elif kind == 'keep':  # an object outlined by hand (the bucket under the oleander pot)
            pm = Image.new('L', (W, H), 0)
            ImageDraw.Draw(pm).polygon(arg, fill=255)
            keep |= np.asarray(pm) > 0
    return keep


def patch_from_left(og, box, dx, shear):
    """Cover an object standing against a wall with the wall from dx pixels to its left,
    sheared so the lap lines line up; feathered along the top and left."""
    a = np.asarray(og).astype(np.float32)
    H, W = a.shape[:2]
    x0, y0, x1, y1 = box
    out = a.copy()
    yy, xx = np.mgrid[y0:y1, x0:x1]
    sx = np.clip(xx - dx, 0, W - 1)
    sy = np.clip(yy - int(round(shear * dx)), 0, H - 1)
    src = a[sy, sx]
    f = 28.0
    wx = np.clip((xx - x0) / f, 0, 1); wy = np.clip((yy - y0) / f, 0, 1)
    w = (wx * wy)[..., None]
    out[y0:y1, x0:x1] = a[y0:y1, x0:x1] * (1 - w) + src * w
    return Image.fromarray(out.clip(0, 255).astype(np.uint8))


# ---------------------------------------------------------------- composite
def render_one(key, orig_path, mark_path, out_dir, src_dir, long=Z.LONG):
    cfg = CONFIG[key]
    rng = np.random.default_rng(cfg['seed'])
    og, mk, zones, markers = Z.extract(orig_path, mark_path)
    W, H = og.size
    for box, dx, shear in cfg.get('patch', []):
        og = patch_from_left(og, box, dx, shear)
    for src, dst in cfg.get('rename', []):
        zones[dst] = zones.get(dst, np.zeros((H, W), bool)) | zones[src]
        zones[src] = np.zeros((H, W), bool)
    for src, dst, poly in cfg.get('recolor', []):
        pm = Image.new('L', (W, H), 0)
        ImageDraw.Draw(pm).polygon(poly, fill=255)
        pm = np.asarray(pm) > 0
        zones[dst] = zones.get(dst, np.zeros((H, W), bool)) | (zones[src] & pm)
        zones[src] = zones[src] & ~pm
    zones = Z.expand_zones(og, zones, cfg['zones'], extra=cfg.get('extra'), ceiling=cfg.get('ceiling'))
    # a drawn shape replaces the doodle+flood for that zone; what it vacates goes to the named zone
    for name, (poly, fill) in cfg.get('shape', {}).items():
        pm = Image.new('L', (W, H), 0)
        ImageDraw.Draw(pm).polygon(poly, fill=255)
        pm = (np.asarray(pm) > 0) & ~bright_flat(og)
        old = zones.get(name, np.zeros((H, W), bool))
        if fill:
            # what the shape vacates goes to the fill zone, except behind the shape (the wall side)
            front = np.ones((H, W), bool)
            xs = [p[0] for p in poly]
            lo, hi = min(xs), max(xs)
            full = Image.new('L', (W, H), 0)
            ImageDraw.Draw(full).polygon(poly, fill=255)
            full = np.asarray(full) > 0
            bottom = np.where(full.any(0), H - 1 - full[::-1].argmax(0), -1)
            yy = np.arange(H)[:, None]
            front[:, lo:hi + 1] = yy > bottom[None, lo:hi + 1]
            zones[fill] = zones.get(fill, np.zeros((H, W), bool)) | (old & ~pm & front)
        for k in list(zones):
            zones[k] &= ~pm
        zones[name] = pm
    for src, dst, poly in cfg.get('recolor_after', []):
        pm = Image.new('L', (W, H), 0)
        ImageDraw.Draw(pm).polygon(poly, fill=255)
        pm = np.asarray(pm) > 0
        zones[dst] = zones.get(dst, np.zeros((H, W), bool)) | (zones[src] & pm)
        zones[src] = zones[src] & ~pm
    keep = protect_mask(og, cfg.get('protect', []))
    for k in list(zones):
        zones[k] &= ~keep
    base = np.asarray(og).astype(np.float32)
    out = base.copy()

    # lighting map from the original: large-scale shading only
    L = ndi.gaussian_filter(luma(base), 28)

    ppi_b = cfg['ppi']
    for name in ['pink', 'green', 'orange', 'blue']:
        if name not in cfg['zones']:
            continue
        zone = zones[name]
        if zone.sum() < 2000:
            continue
        ys, xs = np.nonzero(zone)
        bbox = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)

        if name == 'pink':
            tex = tex_dg(H, W, rng)
        elif name == 'green':
            tex = tex_mulch(H, W, rng, ppi_b, bbox)
        elif name == 'blue':
            tex = tex_river(H, W, rng, ppi_b, zone)
        else:  # orange: DG with flagstone steppers
            tex = tex_dg(H, W, rng)
        if name in cfg.get('steppers', ['orange']):
            stones, polys = stepping_stones(zone, H, W, rng, ppi_b)
            tex = paste_stone_faces(tex, polys, H, W, rng, src_dir)
            # joint shadow and stone rim
            rim = stones & ~ndi.binary_erosion(stones, iterations=2)
            joint = ndi.binary_dilation(stones, iterations=3) & ~stones
            tex[joint] *= 0.86
            tex[rim] *= 0.84

        # keep the photo's shadows on the new surface
        lref = np.percentile(L[zone], 65)
        factor = np.clip(0.62 + 0.38 * L / max(lref, 1), 0.62, 1.12)[..., None]
        shaded = tex * factor

        alpha = ndi.gaussian_filter(zone.astype(np.float32), 4.0 if name == 'blue' else 2.5)[..., None]
        out = out * (1 - alpha) + shaded * alpha

    img = Image.fromarray(out.clip(0, 255).astype(np.uint8))
    if cfg.get('markers') and markers:
        x, y, _ = markers[0]
        draw_catch_basin(img, x, y, H, ppi_b)

    os.makedirs(out_dir, exist_ok=True)
    img.save(os.path.join(out_dir, f'{key}_after.jpg'), quality=84)
    og.save(os.path.join(out_dir, f'{key}_before.jpg'), quality=84)
    return img, og, markers


if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    keys = sys.argv[3:] or list(CONFIG)
    for key in keys:
        f = f'IMG_20261107_{key}.jpg'
        img, og, markers = render_one(key, os.path.join(src, 'Original', f), os.path.join(src, 'Markup', f), out, src)
        print(key, img.size, markers)
