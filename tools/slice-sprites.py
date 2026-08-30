"""Slice the cloud spritesheet into per-band animation strips.

sheet-cloud.jpg is shot on magenta: 6 rows (one per comfort band) x 6 frames.
The key lifts cleanly; the only care needed is eroding the JPEG fringe so no
magenta halo survives the downscale.

Frames are bottom-aligned on a common ground line and centred on their own
bounding box, so feet stay planted while accessories overhang.
"""
from PIL import Image, ImageFilter
import numpy as np
import json
import os

LEVELS = ['dry', 'comfortable', 'humid', 'muggy', 'oppressive', 'miserable']
OUT = 'public/sprites'
DES = 'design'
os.makedirs(OUT, exist_ok=True)
os.makedirs(DES, exist_ok=True)
meta = {}


def runs(mask):
    idx = np.where(mask)[0]
    out = []
    if len(idx) == 0:
        return out
    s = p = idx[0]
    for i in idx[1:]:
        if i != p + 1:
            out.append((s, p))
            s = i
        p = i
    out.append((s, p))
    return out


# --------------------------------------------------------------------------
# Magenta chroma key
# --------------------------------------------------------------------------
CLOUD_FRAMES = 6
CELL_W, CELL_H = 300, 310          # output size per frame
PAD = 28                           # breathing room, and slack for body-centring (source px)

src = Image.open('sheet-cloud.jpg').convert('RGB')
a = np.asarray(src).astype(int)

# Key on distance from the measured plate colour, NOT on a hue rule.
#
# A hue rule ("red and blue both well above green") looks like it separates the
# plate from the characters, and does not: the saturated pink of the oppressive
# body is (240, 59, 163), which clears every one of those thresholds and gets
# erased along with the background, hollowing the character out. Distance sees
# it correctly — that pink sits ~115 from the plate, while the plate itself
# clusters under 40, with almost nothing in between.
BG = np.median(np.concatenate([a[0:8].reshape(-1, 3), a[-8:].reshape(-1, 3),
                               a[:, 0:8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)]), axis=0)
fg = np.linalg.norm(a - BG, axis=2) > 60
print(f'plate {tuple(int(v) for v in BG)}')

# Cells come from the gutters in the alpha projection rather than a fixed grid:
# accessories (sun hats, wind lines, the heatwave sign) make the columns uneven.
def cells(proj, thr=2):
    gaps = runs(proj <= thr)
    out = []
    for (s0, e0), (s1, _) in zip(gaps, gaps[1:]):
        out.append((e0 + 1, s1 - 1))
    return out

ccols = cells(fg.sum(axis=0))
crows = cells(fg.sum(axis=1))
assert len(ccols) == CLOUD_FRAMES, f'expected {CLOUD_FRAMES} columns, got {len(ccols)}'
assert len(crows) == len(LEVELS), f'expected {len(LEVELS)} rows, got {len(crows)}'

alpha_full = Image.fromarray((fg * 255).astype(np.uint8), 'L')
# Erode the foreground by 2px: JPEG smears the key across sprite edges, and a
# magenta ring is far more visible after downscaling than 2px of lost outline.
for _ in range(2):
    alpha_full = alpha_full.filter(ImageFilter.MinFilter(3))
keyed = src.copy()
keyed.putalpha(alpha_full)
am = np.asarray(alpha_full)

# One cell size for every frame in every row, so the CSS needs a single ratio.
boxes = {}
maxw = maxh = 0
for ri, (y0, y1) in enumerate(crows):
    for ci, (x0, x1) in enumerate(ccols):
        sub = am[y0:y1 + 1, x0:x1 + 1] > 0
        ys, xs = np.where(sub)
        if len(ys) == 0:
            continue
        box = (x0 + xs.min(), y0 + ys.min(), x0 + xs.max(), y0 + ys.max())
        boxes[(ri, ci)] = box
        maxw = max(maxw, box[2] - box[0] + 1)
        maxh = max(maxh, box[3] - box[1] + 1)

src_w, src_h = maxw + PAD * 2, maxh + PAD * 2
meta['cloud'] = {'frames': CLOUD_FRAMES, 'w': CELL_W, 'h': CELL_H, 'fps': 6}

for ri, level in enumerate(LEVELS):
    strip = Image.new('RGBA', (CELL_W * CLOUD_FRAMES, CELL_H), (0, 0, 0, 0))
    for ci in range(CLOUD_FRAMES):
        box = boxes.get((ri, ci))
        if box is None:
            continue
        cell = Image.new('RGBA', (src_w, src_h), (0, 0, 0, 0))
        frame = keyed.crop((box[0], box[1], box[2] + 1, box[3] + 1))
        # Centre on the BODY, not the bounding box. Sun hats, wind puffs and
        # the heatwave sign widen the box on one side and drag the character
        # off-centre; the lower half of the sprite is always just body and
        # feet, so its centre of mass is the honest anchor.
        fa = np.asarray(frame)[..., 3] > 0
        lower = fa[int(fa.shape[0] * 0.55):, :]
        xs_body = np.where(lower)[1]
        cx = xs_body.mean() if len(xs_body) else frame.width / 2
        x = int(round(src_w / 2 - cx))
        x = max(0, min(src_w - frame.width, x))
        cell.paste(frame, (x, src_h - PAD - frame.height), frame)
        cell = cell.resize((CELL_W, CELL_H), Image.LANCZOS)
        strip.paste(cell, (ci * CELL_W, 0))
        if ci == 0:
            cell.save(f'{DES}/cloud-{level}.png', optimize=True)
            cell.resize((96, 99), Image.LANCZOS).save(f'{OUT}/icon-{level}.png', optimize=True)
    strip.save(f'{OUT}/cloud-{level}.webp', quality=90, method=6)

json.dump(meta, open(f'{OUT}/meta.json', 'w'), indent=2)
print(f'cell {src_w}x{src_h} src -> {CELL_W}x{CELL_H}')
print(f'wrote {len(LEVELS)} strips, {CLOUD_FRAMES} frames each')
