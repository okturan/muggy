"""Build looping character animations from the animated spritesheet video.

The video is the whole 6x6 grid animating at once: rows are comfort bands,
columns are intensity variants of that band. Two things make it usable:

* it loops every 24 frames (1s at 24fps), verified by frame similarity, so a
  24-frame slice is seamless;
* the background settles to a constant washed pink after a magenta lead-in, and
  the characters do NOT shift colour with it — so a distance key against that
  one measured colour separates cleanly, including the pink `oppressive` body,
  which sits ~130 away from the plate.

Output is one animated WebP per band, which the CSS can use as a plain
background-image: no sprite-strip stepping, and 24fps instead of 6 poses.
"""
from PIL import Image, ImageFilter
import numpy as np
import json
import subprocess
import tempfile
import os
import sys
import glob

VIDEO = sys.argv[1] if len(sys.argv) > 1 else 'sheet-cloud-anim.mp4'
OUT = 'public/sprites'
DES = 'design'
LEVELS = ['dry', 'comfortable', 'humid', 'muggy', 'oppressive', 'miserable']

# The most expressive variant per band. Columns 0-2 are the plain pose; 3-5 add
# the accessories (sun hat, water bottle, sweat, heat shimmer). `miserable` uses
# the melted blob rather than the sign or the broken air conditioner, since those
# two have no character in them.
COLUMN = {'dry': 1, 'comfortable': 4, 'humid': 4, 'muggy': 4, 'oppressive': 4, 'miserable': 3}

LOOP_START, LOOP_LEN = 40, 24      # inside the stable stretch; 24 frames == one cycle
STEP = 2                           # every 2nd frame: 12fps, still a 1s loop, half the bytes
GRID = 6
OUT_W = 300                        # display is ~240 CSS px, so this covers 2x
KEY_TOL = 55                       # bimodal valley sits around 30-80
PAD = 14

os.makedirs(OUT, exist_ok=True)

with tempfile.TemporaryDirectory() as tmp:
    subprocess.run([
        'ffmpeg', '-v', 'error', '-i', VIDEO,
        '-vf', f'select=between(n\\,{LOOP_START}\\,{LOOP_START + LOOP_LEN - 1})',
        '-fps_mode', 'passthrough', f'{tmp}/%03d.png',
    ], check=True)
    files = sorted(glob.glob(f'{tmp}/*.png'))
    assert len(files) == LOOP_LEN, f'expected {LOOP_LEN} frames, got {len(files)}'

    frames = [np.asarray(Image.open(f).convert('RGB')).astype(float) for f in files]
    H, W, _ = frames[0].shape

    # The plate colour, measured rather than assumed (it is not the magenta the
    # still sheet uses — the video washes it out and then holds it steady).
    edge = np.concatenate([frames[0][0:6].reshape(-1, 3), frames[0][-6:].reshape(-1, 3)])
    BG = np.median(edge, axis=0)

    # Cell edges are found, not assumed. Even sixths cut into the neighbours:
    # the `oppressive` and `miserable` rows touch outright, with no empty gutter
    # between the drips of one and the heat shimmer of the other. Each boundary
    # is placed at its emptiest line within a search window instead.
    union = np.zeros((H, W), bool)
    for f in frames:
        union |= np.linalg.norm(f - BG, axis=2) > KEY_TOL

    def splits(proj, n, span):
        edges = [0]
        for i in range(1, n):
            nominal = round(i * len(proj) / n)
            lo, hi = max(1, nominal - span), min(len(proj) - 1, nominal + span)
            edges.append(lo + int(np.argmin(proj[lo:hi])))
        edges.append(len(proj))
        return edges

    ys = splits(union.sum(axis=1), GRID, 90)
    xs = splits(union.sum(axis=0), GRID, 90)
    print(f'plate {tuple(int(v) for v in BG)}')
    print(f'row edges {ys}')
    print(f'col edges {xs}')

    # Pass 1: key every band and measure its box, so all six can share one frame
    # size — otherwise the hero would resize as the weather changed.
    prepared = {}
    for ri, level in enumerate(LEVELS):
        ci = COLUMN[level]
        x0, x1 = xs[ci], xs[ci + 1]
        y0, y1 = ys[ri], ys[ri + 1]

        rgbs, alphas = [], []
        for f in frames[::STEP]:
            cell = f[y0:y1, x0:x1]
            keep = np.linalg.norm(cell - BG, axis=2) > KEY_TOL
            al = Image.fromarray((keep * 255).astype(np.uint8), 'L')
            al = al.filter(ImageFilter.MinFilter(3))     # shave the compression fringe
            alphas.append(al)
            rgbs.append(Image.fromarray(cell.astype(np.uint8), 'RGB'))

        # One window for the whole loop. Cropping each frame to its own bounding
        # box would re-centre the character every frame and cancel the motion.
        ubox = None
        for al in alphas:
            bb = al.getbbox()
            if bb is None:
                continue
            ubox = bb if ubox is None else (
                min(ubox[0], bb[0]), min(ubox[1], bb[1]),
                max(ubox[2], bb[2]), max(ubox[3], bb[3]))
        bx0 = max(0, ubox[0] - PAD); by0 = max(0, ubox[1] - PAD)
        bx1 = min(x1 - x0, ubox[2] + PAD); by1 = min(y1 - y0, ubox[3] + PAD)
        prepared[level] = (ci, rgbs, alphas, (bx0, by0, bx1, by1))

    box_w = max(b[3][2] - b[3][0] for b in prepared.values())
    box_h = max(b[3][3] - b[3][1] for b in prepared.values())
    out_h = round(OUT_W * box_h / box_w)
    print(f'common box {box_w}x{box_h} -> {OUT_W}x{out_h}')

    for level, (ci, rgbs, alphas, (bx0, by0, bx1, by1)) in prepared.items():
        seq = []
        for rgb, al in zip(rgbs, alphas):
            im = rgb.copy()
            im.putalpha(al)
            cell = Image.new('RGBA', (box_w, box_h), (0, 0, 0, 0))
            # Centred, and standing on the floor of the shared box, so the
            # characters do not bob about as the band changes.
            cell.paste(im.crop((bx0, by0, bx1, by1)),
                       ((box_w - (bx1 - bx0)) // 2, box_h - (by1 - by0)))
            seq.append(cell.resize((OUT_W, out_h), Image.LANCZOS))

        seq[0].save(f'{OUT}/cloud-{level}.webp', save_all=True, append_images=seq[1:],
                    duration=round(1000 * STEP / LOOP_LEN), loop=0, quality=82, method=4)
        seq[0].save(f'{DES}/cloud-{level}.png', optimize=True)
        seq[0].resize((96, round(96 * out_h / OUT_W))).save(f'{OUT}/icon-{level}.png', optimize=True)
        kb = os.path.getsize(f'{OUT}/cloud-{level}.webp') // 1024
        print(f'  {level:12s} col{ci}  {kb} KB')

    meta_path = f'{OUT}/meta.json'
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    meta['cloud'] = {'animated': True, 'frames': LOOP_LEN // STEP, 'w': OUT_W, 'h': out_h,
                     'fps': round(LOOP_LEN / STEP), 'loopMs': 1000}
    json.dump(meta, open(meta_path, 'w'), indent=2)

print(f'\nanimated {len(LEVELS)} bands, {LOOP_LEN // STEP} frames each')
