"""Zone extraction from annotated patio photos.

Markup photos carry colored scribbles over the original photo (with a white
frame added). This module aligns the original to the markup, classifies the
scribble colours and turns the strokes into clean filled regions.
"""
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.spatial import ConvexHull

LONG = 1400

# hue ranges in degrees, (lo, hi, smin, vmin)
COLORS = {
    'pink':   (265, 325, 0.45, 0.45),   # crushed granite (patio)
    'green':  (80, 140, 0.60, 0.55),    # mulch
    'orange': (12, 40, 0.60, 0.55),     # crushed granite + stepping stones
    'blue':   (215, 255, 0.55, 0.45),   # river rock
    'red':    (345, 361, 0.55, 0.55),   # drain markers 0 / 1
}
PRIORITY = ['pink', 'green', 'orange', 'blue']


def load(path, long=LONG):
    im = Image.open(path).convert('RGB')
    im.thumbnail((long, long), Image.LANCZOS)
    return im


def photo_bbox(mk):
    a = np.asarray(mk).astype(int)
    nonwhite = a.sum(2) < 735
    rows = np.where(nonwhite.mean(1) > 0.6)[0]
    cols = np.where(nonwhite.mean(0) > 0.6)[0]
    return cols[0], rows[0], cols[-1] + 1, rows[-1] + 1


def align(orig_path, mark_path):
    mk = load(mark_path)
    x0, y0, x1, y1 = photo_bbox(mk)
    mk = mk.crop((x0, y0, x1, y1))
    og = Image.open(orig_path).convert('RGB').resize(mk.size, Image.LANCZOS)
    return og, mk


def hsv_arrays(im):
    hsv = np.asarray(im.convert('HSV')).astype(np.float32)
    h = hsv[..., 0] / 255.0 * 360.0
    s = hsv[..., 1] / 255.0
    v = hsv[..., 2] / 255.0
    return h, s, v


def raw_masks(mk):
    h, s, v = hsv_arrays(mk)
    out = {}
    for name, (lo, hi, smin, vmin) in COLORS.items():
        hm = (h >= lo) & (h < hi)
        if name == 'red':
            hm = hm | (h < 8)
        out[name] = hm & (s > smin) & (v > vmin)
    return out


def hull_polygon(mask):
    ys, xs = np.nonzero(mask)
    pts = np.stack([xs, ys], 1)
    if len(pts) < 10:
        return None
    try:
        hull = ConvexHull(pts)
    except Exception:
        return None
    return [tuple(pts[i]) for i in hull.vertices]


def region_from_strokes(m, close_r=28, min_area=350, hull=True):
    """Strokes -> solid region. Opening kills thin photo noise, then components
    are closed, hole-filled and (optionally) replaced by their convex hull."""
    m = ndi.binary_opening(m, iterations=2)
    lab, n = ndi.label(m)
    if n == 0:
        return np.zeros_like(m)
    sizes = ndi.sum(m, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, sz in enumerate(sizes) if sz >= min_area])
    if not keep.any():
        return np.zeros_like(m)
    yy, xx = np.ogrid[-close_r:close_r + 1, -close_r:close_r + 1]
    disk = (xx * xx + yy * yy) <= close_r * close_r
    closed = ndi.binary_closing(keep, structure=disk, border_value=0)
    closed = fill_holes_to_edge(closed) | keep
    if not hull:
        return closed
    lab, n = ndi.label(closed)
    out = Image.new('L', (m.shape[1], m.shape[0]), 0)
    d = ImageDraw.Draw(out)
    for i in range(1, n + 1):
        comp = lab == i
        if comp.sum() < min_area * 2:
            continue
        poly = hull_polygon(comp)
        if poly:
            d.polygon([(int(x), int(y)) for x, y in poly], fill=255)
    hulls = np.asarray(out) > 0
    # the hull is only needed where the strokes were too sparse to close;
    # an outlined-and-hatched zone keeps its drawn (possibly concave) shape
    if closed.sum() >= 0.72 * hulls.sum():
        return ndi.binary_dilation(closed, iterations=3)
    return hulls


def fill_holes_to_edge(m):
    """Fill holes, treating a gap along an image edge between two touching
    points of the region as closed (a zone cut off by the photo border)."""
    m2 = m.copy()
    for edge in range(4):
        line = {0: m[:, 0], 1: m[:, -1], 2: m[0, :], 3: m[-1, :]}[edge]
        idx = np.nonzero(line)[0]
        if len(idx) < 2:
            continue
        lo, hi = idx.min(), idx.max() + 1
        if edge == 0:
            m2[lo:hi, 0] = True
        elif edge == 1:
            m2[lo:hi, -1] = True
        elif edge == 2:
            m2[0, lo:hi] = True
        else:
            m2[-1, lo:hi] = True
    return ndi.binary_fill_holes(m2)


def expand_zones(og, zones, order, max_dist=110, std_thr=13, sat_max=0.32, extra=None, ceiling=None):
    """Grow the doodled zones out to the real edges of the surface they sit on.

    1. flood each zone into neighbouring ground-like pixels (bright-ish, low
       saturation, textured: flagstone, gravel, rubble, soil) within max_dist,
       never above the top of the doodles in that column (walls, fences);
    2. fill gaps between zones and give them to the nearest zone;
    3. run a zone out to the photo edge where it already comes close to it.
    """
    a = np.asarray(og).astype(np.float32)
    H, W = a.shape[:2]
    L = a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114
    mx = a.max(2); mn = a.min(2)
    sat = (mx - mn) / (mx + 1e-3)
    m1 = ndi.uniform_filter(L, 15); m2 = ndi.uniform_filter(L * L, 15)
    std = np.sqrt(np.clip(m2 - m1 * m1, 0, None))
    m1b = ndi.uniform_filter(L, 41); m2b = ndi.uniform_filter(L * L, 41)
    std_wide = np.sqrt(np.clip(m2b - m1b * m1b, 0, None))
    # stone, gravel and rubble are textured at both scales; a concrete slab is not
    groundlike = (L > 70) & (sat < sat_max) & (std > std_thr) & (std_wide > 16)
    # mulch beds grow into soil and leaf litter, never over bright stone or boulders
    soil_like = (L > 40) & (L < 150) & (sat < 0.5) & (std > 7)
    glike = lambda k: soil_like if k == 'green' else groundlike

    zones = {k: v.copy() for k, v in zones.items()}
    if extra:
        for name, poly in extra.items():
            im = Image.new('L', (W, H), 0)
            ImageDraw.Draw(im).polygon(poly, fill=255)
            zones[name] = zones.get(name, np.zeros((H, W), bool)) | (np.asarray(im) > 0)
    active = [k for k in order if k in zones and zones[k].any()]
    # an explicit ground line: nothing above it is ground (shed footing, fence, wheels)
    above = np.zeros((H, W), bool)
    if ceiling:
        cx = np.array([p[0] for p in ceiling], float); cy = np.array([p[1] for p in ceiling], float)
        line = np.interp(np.arange(W), cx, cy)
        above = np.arange(H)[:, None] < line[None, :]
        groundlike &= ~above; soil_like &= ~above
        for k in active:
            zones[k] &= ~above
    union = np.zeros((H, W), bool)
    for k in active:
        union |= zones[k]
    # column-wise top limit: nothing grows more than a little above the doodles
    col_top = np.where(union.any(0), union.argmax(0), H)
    col_top = ndi.minimum_filter1d(col_top, 161)  # a wide envelope over a zigzag doodle
    yy = np.arange(H)[:, None]
    below_top = yy >= (col_top[None, :] - 15)

    # 1. flood
    for k in active:
        others = np.zeros((H, W), bool)
        for j in active:
            if j != k:
                others |= zones[j]
        dist = ndi.distance_transform_edt(~zones[k])
        cand = (glike(k) & ~others & below_top & (dist < max_dist)) | zones[k]
        cand = ndi.binary_closing(cand, iterations=4)
        lab, n = ndi.label(cand)
        keep = np.unique(lab[zones[k]])
        comp = np.isin(lab, keep[keep > 0])
        comp = ndi.binary_closing(comp, structure=np.ones((21, 21), bool)) | zones[k]
        comp = fill_holes_to_edge(comp)
        zones[k] = comp & ~others

    # 2. gaps between zones -> nearest zone
    union = np.zeros((H, W), bool)
    lab = np.zeros((H, W), np.int32)
    for i, k in enumerate(active):
        union |= zones[k]; lab[zones[k]] = i + 1
    yy_, xx_ = np.ogrid[-45:46, -45:46]
    disk = (xx_ ** 2 + yy_ ** 2) <= 45 ** 2
    closed = fill_holes_to_edge(ndi.binary_closing(union, structure=disk))
    near = ndi.distance_transform_edt(~union) < 12
    gaps = closed & ~union & (groundlike | soil_like | near)
    if gaps.any():
        _, idx = ndi.distance_transform_edt(lab == 0, return_indices=True)
        nearest = lab[idx[0], idx[1]]
        for i, k in enumerate(active):
            zones[k] |= gaps & (nearest == i + 1)

    # 3. run out to the photo edges, through ground-like pixels only
    doodle = {k: zones[k].copy() for k in active}
    for k in active:
        z = zones[k]
        ok = glike(k) | (ndi.distance_transform_edt(~z) < 12)
        run = np.zeros_like(z)
        d = 30
        cols = np.nonzero(z[H - d:, :].any(0))[0]
        for x in cols:
            y0 = H - 1 - z[::-1, x].argmax()
            run[y0:, x] = True
        rows = np.nonzero(z[:, :d].any(1))[0]
        for y in rows:
            x0 = z[y].argmax(); run[y, :x0] = True
        rows = np.nonzero(z[:, W - d:].any(1))[0]
        for y in rows:
            x1 = W - 1 - z[y, ::-1].argmax(); run[y, x1:] = True
        z = z | (run & ok)
        # smooth spiky boundaries, never losing what was drawn
        yy9, xx9 = np.ogrid[-9:10, -9:10]
        d9 = (xx9 ** 2 + yy9 ** 2) <= 81
        z = ndi.binary_closing(ndi.binary_opening(z, structure=d9), structure=d9) | doodle[k]
        zones[k] = z
    for k in active:
        zones[k] &= ~above
    # overlaps: later in order wins
    for i, k in enumerate(active):
        for j in active[i + 1:]:
            zones[k] &= ~zones[j]
    return zones


def marker_points(red_mask):
    m = ndi.binary_opening(red_mask, iterations=2)
    lab, n = ndi.label(m)
    pts = []
    for i in range(1, n + 1):
        comp = lab == i
        if comp.sum() < 400:
            continue
        ys, xs = np.nonzero(comp)
        pts.append((float(xs.mean()), float(ys.mean()), int(comp.sum())))
    pts.sort(key=lambda p: p[0])
    return pts


def extract(orig_path, mark_path, close_r=28):
    og, mk = align(orig_path, mark_path)
    raw = raw_masks(mk)
    zones = {}
    for name in PRIORITY:
        zones[name] = region_from_strokes(raw[name], close_r=close_r)
    # resolve overlaps: later in PRIORITY wins
    for i, name in enumerate(PRIORITY):
        for later in PRIORITY[i + 1:]:
            zones[name] &= ~zones[later]
    markers = marker_points(raw['red'])
    # the red marker discs sit on top of zones; make sure the zone under them stays
    return og, mk, zones, markers


ZONE_RGB = {
    'pink': (255, 0, 200), 'green': (0, 230, 0), 'orange': (255, 140, 0), 'blue': (0, 90, 255)
}


def debug_overlay(og, zones, markers):
    base = np.asarray(og).astype(np.float32)
    for name, m in zones.items():
        col = np.array(ZONE_RGB[name], np.float32)
        base[m] = base[m] * 0.45 + col * 0.55
    im = Image.fromarray(base.clip(0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    for k, (x, y, a) in enumerate(markers):
        d.ellipse((x - 14, y - 14, x + 14, y + 14), outline=(255, 0, 0), width=4)
        d.text((x + 16, y - 8), str(k), fill=(255, 0, 0))
    return im


if __name__ == '__main__':
    import sys, os
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    for f in sorted(os.listdir(os.path.join(src, 'Markup'))):
        if not f.lower().endswith('.jpg'):
            continue
        og, mk, zones, markers = extract(os.path.join(src, 'Original', f), os.path.join(src, 'Markup', f))
        dbg = debug_overlay(og, zones, markers)
        dbg.save(os.path.join(out, f.replace('.jpg', '_zones.jpg')), quality=80)
        print(f, og.size, {k: int(v.sum()) for k, v in zones.items()}, markers)
