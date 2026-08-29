"""Slice the boy spritesheet into per-level walk strips.

Painted scenes on a black grid, 6 rows (one per comfort band) x 4 frames, kept
whole because the scene *is* the background — nothing is keyed out.

The cloud buddy is not built here. It comes from the animated video, via
tools/build-animations.py.
"""
from PIL import Image
import numpy as np
import json
import os

LEVELS = ['dry', 'comfortable', 'humid', 'muggy', 'oppressive', 'miserable']
OUT = 'public/sprites'
DES = 'design'
os.makedirs(OUT, exist_ok=True)
os.makedirs(DES, exist_ok=True)
meta = {}
if os.path.exists(f'{OUT}/meta.json'):
    meta = json.load(open(f'{OUT}/meta.json'))   # keep the cloud entry the video wrote


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
print(f'wrote {len(LEVELS)} boy strips, {BOY_FRAMES} frames each')
