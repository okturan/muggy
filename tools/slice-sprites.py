"""Slice the two spritesheets into per-level strips + small previews."""
from PIL import Image, ImageDraw
import numpy as np, os, json
from collections import deque

LEVELS = ['dry','comfortable','humid','muggy','oppressive','miserable']
OUT = 'public/sprites'; DES = 'design'
os.makedirs(OUT, exist_ok=True); os.makedirs(DES, exist_ok=True)
meta = {}

def runs(mask):
    idx = np.where(mask)[0]; out = []
    if len(idx) == 0: return out
    s = p = idx[0]
    for i in idx[1:]:
        if i != p + 1: out.append((s, p)); s = i
        p = i
    out.append((s, p)); return out

# ---------- boy sheet: black gridlines, painted scenes ----------
boy = Image.open('sheet-boy.jpg').convert('RGB')
g = np.asarray(boy.convert('L')).astype(float)
col_sep = [r for r in runs(g[:, 398:].mean(axis=0) < 90)]
col_sep = [(a+398, b+398) for a, b in col_sep]
# separators: 775-791, 1171-1186, 1567-1583, 1962-1999 -> cells
xs = [398] + [b+1 for a, b in col_sep if a < 1900] 
xe = [a-1 for a, b in col_sep]
cols = list(zip(xs, xe))
row_pitch = 329.0
rows = [(int(25 + i*row_pitch + (13 if i else 0)), int(25 + (i+1)*row_pitch)) for i in range(6)]
rows[-1] = (rows[-1][0], 1996)
print('boy cols', cols, 'rows', rows)
FW, FH = 300, 262  # display size per frame
meta['boy'] = {'frames': 4, 'w': FW, 'h': FH, 'fps': 6}
for li, (y0, y1) in enumerate(rows):
    strip = Image.new('RGB', (FW*4, FH))
    for ci, (x0, x1) in enumerate(cols):
        fr = boy.crop((x0+4, y0+4, x1-4, y1-4)).resize((FW, FH), Image.LANCZOS)
        strip.paste(fr, (ci*FW, 0))
        if ci == 0:
            fr.save(f'{DES}/boy-{LEVELS[li]}.jpg', quality=80)
    strip.save(f'{OUT}/boy-{LEVELS[li]}.webp', quality=82, method=6)

# ---------- cloud sheet: cream bg, faint grey grid, coloured label column ----------
cl = Image.open('sheet-cloud.jpg').convert('RGB')
a = np.asarray(cl).astype(float)
inner = a[25:1980, 25:1975]
L = inner.mean(axis=2)
LX0, LX1, IY0, IY1 = 396, 1975, 25, 1980
cw = (LX1-LX0)/5; ch = (IY1-IY0)/6
ccols = [(int(LX0+i*cw), int(LX0+(i+1)*cw)) for i in range(5)]
crows = [(int(IY0+i*ch), int(IY0+(i+1)*ch)) for i in range(6)]
print('cloud cols', ccols, 'rows', crows)

def key_bg(img, tol=48):
    """Flood-fill transparent from the border through cream/grey pixels."""
    arr = np.asarray(img.convert('RGB')).astype(int)
    h, w, _ = arr.shape
    def bgish(p):
        r, g, b = p
        return (r+g+b)/3 > 135 and (max(p) - min(p)) < tol
    mask = np.zeros((h, w), bool); q = deque()
    for x in range(w):
        for y in (0, h-1):
            if bgish(arr[y, x]) and not mask[y, x]: mask[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w-1):
            if bgish(arr[y, x]) and not mask[y, x]: mask[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
            if 0 <= ny < h and 0 <= nx < w and not mask[ny, nx] and bgish(arr[ny, nx]):
                mask[ny, nx] = True; q.append((ny, nx))
    rgba = np.dstack([arr.astype(np.uint8), np.where(mask, 0, 255).astype(np.uint8)])
    return Image.fromarray(rgba, 'RGBA')

CW, CH = 240, 248
meta['cloud'] = {'frames': 5, 'w': CW, 'h': CH, 'fps': 4}
for li, (y0, y1) in enumerate(crows):
    strip = Image.new('RGBA', (CW*5, CH), (0,0,0,0))
    for ci, (x0, x1) in enumerate(ccols):
        fr = key_bg(cl.crop((x0+9, y0+8, x1-7, y1-7)))
        fr = fr.resize((CW, CH), Image.LANCZOS)
        strip.paste(fr, (ci*CW, 0), fr)
        if ci == 0:
            fr.save(f'{DES}/cloud-{LEVELS[li]}.png', optimize=True)
            fr.resize((96, 99), Image.LANCZOS).save(f'{OUT}/icon-{LEVELS[li]}.png', optimize=True)
    strip.save(f'{OUT}/cloud-{LEVELS[li]}.png', optimize=True)

json.dump(meta, open(f'{OUT}/meta.json', 'w'), indent=2)
# contact sheet for eyeballing
cs = Image.new('RGB', (FW*4 + CW*5, (max(FH, CH))*6), 'white')
for li, lv in enumerate(LEVELS):
    cs.paste(Image.open(f'{OUT}/boy-{lv}.webp'), (0, li*max(FH,CH)))
    c = Image.open(f'{OUT}/cloud-{lv}.png'); cs.paste(c, (FW*4, li*max(FH,CH)), c)
cs.resize((cs.width//2, cs.height//2)).save('/private/tmp/claude-501/-Users-okan-code-weather-app/4d23f21a-ed56-4056-bb53-a91c1a3039b6/scratchpad/contact.jpg', quality=85)
