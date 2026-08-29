"""Slice the character spritesheets into per-level animation strips.

Two sheets, two very different jobs:

* sheet-cloud.jpg — the cloud buddy. Magenta chroma key, 6 rows (one per
  comfort band) x 6 frames. The key lifts cleanly; the only care needed is
  eroding the JPEG fringe so no purple halo survives the downscale.
* sheet-boy.jpg — the alternate buddy. Painted scenes on a black grid, 6 rows
  x 4 frames, kept whole (the scene is the background).

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
# Cloud buddy: magenta chroma key
# --------------------------------------------------------------------------
CLOUD_FRAMES = 6
CELL_W, CELL_H = 300, 310          # output size per frame
PAD = 18                           # breathing room inside the cell (source px)

src = Image.open('sheet-cloud.jpg').convert('RGB')
a = np.asarray(src).astype(int)
R, G, B = a[..., 0], a[..., 1], a[..., 2]

# The key is ~(244, 8, 240). Requiring BOTH red and blue to sit far above green
# is what keeps the pink "oppressive" and red "miserable" bodies out of the
# mask — they are red-dominant but nothing like as blue as the background.
bg = (R > 140) & (B > 140) & (G < 120) & ((R - G) > 60) & ((B - G) > 60)
fg = ~bg

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
        # Centred horizontally, sitting on the floor of the cell: feet stay put
        # across the walk cycle while hats and wind lines overhang upward.
        cell.paste(frame, ((src_w - frame.width) // 2, src_h - PAD - frame.height), frame)
        cell = cell.resize((CELL_W, CELL_H), Image.LANCZOS)
        strip.paste(cell, (ci * CELL_W, 0))
        if ci == 0:
            cell.save(f'{DES}/cloud-{level}.png', optimize=True)
            cell.resize((96, 99), Image.LANCZOS).save(f'{OUT}/icon-{level}.png', optimize=True)
    strip.save(f'{OUT}/cloud-{level}.webp', quality=90, method=6)

# --------------------------------------------------------------------------
# Boy buddy: painted scenes, black gridlines, kept whole
# --------------------------------------------------------------------------
BOY_FRAMES = 4
BW, BH = 300, 262

boy = Image.open('sheet-boy.jpg').convert('RGB')
g = np.asarray(boy.convert('L')).astype(float)
seps = [(s + 398, e + 398) for s, e in runs(g[:, 398:].mean(axis=0) < 90)]
xs = [398] + [e + 1 for s, e in seps if s < 1900]
xe = [s - 1 for s, e in seps]
bcols = list(zip(xs, xe))
pitch = 329.0
brows = [(int(25 + i * pitch + (13 if i else 0)), int(25 + (i + 1) * pitch)) for i in range(6)]
brows[-1] = (brows[-1][0], 1996)

meta['boy'] = {'frames': BOY_FRAMES, 'w': BW, 'h': BH, 'fps': 6}
for ri, (y0, y1) in enumerate(brows):
    strip = Image.new('RGB', (BW * BOY_FRAMES, BH))
    for ci, (x0, x1) in enumerate(bcols):
        fr = boy.crop((x0 + 4, y0 + 4, x1 - 4, y1 - 4)).resize((BW, BH), Image.LANCZOS)
        strip.paste(fr, (ci * BW, 0))
        if ci == 0:
            fr.save(f'{DES}/boy-{LEVELS[ri]}.jpg', quality=80)
    strip.save(f'{OUT}/boy-{LEVELS[ri]}.webp', quality=82, method=6)

json.dump(meta, open(f'{OUT}/meta.json', 'w'), indent=2)
print(f'cloud cell {src_w}x{src_h} src -> {CELL_W}x{CELL_H}, {CLOUD_FRAMES} frames')
print('wrote', len(LEVELS) * 2, 'strips')
