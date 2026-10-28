"""Ad posters and signage for the sets, drawn in code (no credits). Writes art/scenes/posters/*.png"""
import math, os, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont
OUT = 'art/scenes/posters'; os.makedirs(OUT, exist_ok=True)
FONT = 'node_modules/@fontsource-variable/archivo/files'
def font(size):
    for f in sorted(os.listdir(FONT)):
        if 'latin-wdth-italic' in f and f.endswith('.woff2'): pass
    try: return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', size)
    except OSError: return ImageFont.load_default()
R = random.Random(3)
def grad(w, h, a, b):
    im = Image.new('RGB', (w, h)); d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / h; d.line([(0, y), (w, y)], fill=tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)))
    return im
def wear(im):
    """Scuffs and a little fade, so posters don't look freshly printed."""
    d = ImageDraw.Draw(im, 'RGBA')
    for _ in range(40):
        x, y = R.randrange(im.width), R.randrange(im.height)
        d.ellipse([x, y, x + R.randint(4, 30), y + R.randint(2, 10)], fill=(255, 255, 255, R.randint(10, 40)))
    return Image.blend(im, Image.new('RGB', im.size, (200, 190, 180)), 0.08)

# 1. Hop & Skip live: red and blue halves, big type.
im = grad(600, 900, (25, 10, 40), (60, 10, 50)); d = ImageDraw.Draw(im)
d.polygon([(0, 0), (600, 0), (0, 900)], fill=(200, 40, 60)); d.polygon([(600, 0), (600, 900), (0, 900)], fill=(40, 90, 220))
d.text((300, 300), 'HOP', font=font(150), fill='white', anchor='mm'); d.text((300, 460), '&', font=font(90), fill=(255, 220, 60), anchor='mm')
d.text((300, 610), 'SKIP', font=font(150), fill='white', anchor='mm'); d.text((300, 800), 'LIVE  ON THE COURT', font=font(34), fill='white', anchor='mm')
wear(im).save(f'{OUT}/hopskip.png')
# 2. Soda ad.
im = grad(600, 900, (255, 120, 40), (255, 40, 120)); d = ImageDraw.Draw(im)
d.ellipse([150, 160, 450, 460], fill=(255, 230, 120)); d.rounded_rectangle([230, 380, 370, 760], 30, fill=(30, 20, 40))
d.rounded_rectangle([245, 470, 355, 600], 10, fill=(255, 80, 120))
d.text((300, 100), 'DUTCH COLA', font=font(70), fill='white', anchor='mm'); d.text((300, 830), 'KEEP THE BEAT', font=font(44), fill='white', anchor='mm')
wear(im).save(f'{OUT}/cola.png')
# 3. Route map: coloured lines on cream.
im = Image.new('RGB', (900, 600), (235, 230, 215)); d = ImageDraw.Draw(im)
for i, col in enumerate([(230, 60, 60), (50, 120, 230), (250, 190, 30), (60, 180, 100)]):
    pts = [(60, 120 + i * 110)] + [(150 + k * 120, 120 + i * 110 + R.randint(-60, 60)) for k in range(6)]
    d.line(pts, fill=col, width=14, joint='curve')
    for p in pts[1:]: d.ellipse([p[0] - 12, p[1] - 12, p[0] + 12, p[1] + 12], fill='white', outline=(30, 30, 30), width=4)
d.text((450, 40), 'NEON CITY TRANSIT', font=font(44), fill=(30, 30, 30), anchor='mm')
wear(im).save(f'{OUT}/map.png')
# 4. Station name band (white on deep green, like old tile mosaics).
im = Image.new('RGB', (1600, 200), (20, 70, 55)); d = ImageDraw.Draw(im)
d.rectangle([10, 10, 1590, 190], outline=(230, 200, 120), width=8)
d.text((800, 100), 'DOUBLE DUTCH  ST', font=font(120), fill=(240, 235, 220), anchor='mm')
im.save(f'{OUT}/station.png')
print('posters ok')
