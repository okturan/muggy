"""Render the Open Graph banners (1200x630) — one per comfort band + default.

WhatsApp and friends show these next to a shared muggy.fyi link. The worker
picks the banner matching the city's current band, so the preview itself says
what the air is like before anyone taps.
"""
from PIL import Image, ImageDraw, ImageFont
import os
import urllib.request

W, H = 1200, 630
PAPER, GRID, INK, PANEL = (251, 244, 230), (234, 223, 203), (34, 38, 47), (255, 255, 255)
TINT = {
    'dry': (220, 227, 236), 'comfortable': (205, 232, 184), 'humid': (245, 239, 168),
    'muggy': (246, 198, 168), 'oppressive': (247, 154, 192), 'miserable': (240, 117, 91),
}
WORD = {
    'dry': 'CRISP AND DRY', 'comfortable': 'PERFECT AIR', 'humid': 'A LITTLE STICKY',
    'muggy': "IT'S MUGGY OUT", 'oppressive': 'OPPRESSIVE', 'miserable': 'MISERABLE',
}
LEVELS = list(TINT)

os.makedirs('public/og', exist_ok=True)

FONT = '/tmp/SpaceGrotesk[wght].ttf'
if not os.path.exists(FONT):
    urllib.request.urlretrieve(
        'https://github.com/google/fonts/raw/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf', FONT)

def face(size):
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_axes([700])   # variable font: dial the weight to Bold
    return f

big, mid, small, tiny = face(92), face(44), face(36), face(30)


def base(tint):
    im = Image.new('RGB', (W, H), PAPER)
    d = ImageDraw.Draw(im)
    for x in range(0, W, 36):
        d.line([(x, 0), (x, H)], fill=GRID, width=2)
    for y in range(0, H, 36):
        d.line([(0, y), (W, y)], fill=GRID, width=2)
    # band-coloured plate behind the character, hard border + offset shadow
    d.rectangle([742, 96, 1116, 536], fill=INK)
    d.rectangle([730, 84, 1104, 524], fill=tint, outline=INK, width=6)
    return im, d


def wordmark(d):
    d.rectangle([64, 516, 322, 578], fill=INK)
    d.text((84, 524), 'muggy.fyi', font=small, fill=PAPER)


def character(im, level, size=380):
    spr = Image.open(f'design/cloud-{level}.png').convert('RGBA')
    s = spr.resize((size, round(size * spr.height / spr.width)), Image.LANCZOS)
    im.paste(s, (730 + (374 - s.width) // 2, 524 - 24 - s.height), s)


for level in LEVELS:
    im, d = base(TINT[level])
    character(im, level)
    d.text((64, 110), 'RIGHT NOW:', font=mid, fill=(122, 127, 140))
    # headline, wrapped by hand at the widest word
    words = WORD[level].split(' ')
    lines, cur = [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if d.textlength(t, font=big) > 620 and cur:
            lines.append(cur); cur = w
        else:
            cur = t
    lines.append(cur)
    y = 170
    for ln in lines:
        d.text((60, y), ln, font=big, fill=INK)
        y += 104
    d.text((64, y + 18), 'How sticky is it out there?', font=mid, fill=(74, 79, 92))
    wordmark(d)
    im.save(f'public/og/{level}.png', optimize=True)

# default: the muggy character with the app's own question
im, d = base(TINT['muggy'])
character(im, 'muggy')
d.text((60, 140), 'HOW STICKY', font=big, fill=INK)
d.text((60, 244), 'IS IT OUT', font=big, fill=INK)
d.text((60, 348), 'THERE?', font=big, fill=INK)
d.text((64, 474), 'The band, the odds, and when it eases', font=tiny, fill=(74, 79, 92))
wordmark(d)
im.save('public/og/default.png', optimize=True)

for f in sorted(os.listdir('public/og')):
    print(f, os.path.getsize(f'public/og/{f}') // 1024, 'KB')
