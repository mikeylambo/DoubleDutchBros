"""Paint-over pass for a rendered scene layer, the finish background artists add over a 3D block-out.
args: in.png out.png tod [layer]
  - rim light: upward-facing silhouette edges catch the sky's colour (mid and near layers)
  - painterly smoothing: a soft median that melts render noise into flat strokes
  - grade: shadows lifted toward the time of day's haze, so layers sit in one atmosphere
  - paper: a faint large-scale wash so flat areas don't read as digital fills
Alpha is preserved; bloom runs separately (glow.py)."""
import sys, random
from PIL import Image, ImageChops, ImageFilter
src, dst, tod = sys.argv[1], sys.argv[2], sys.argv[3]; layer = sys.argv[4] if len(sys.argv) > 4 else 'far'
RIM = {'subway': (215, 255, 230), 'day': (255, 244, 220), 'dusk': (255, 150, 100), 'night': (220, 130, 255)}[tod]
HAZE = {'subway': (60, 80, 72), 'day': (150, 170, 205), 'dusk': (150, 75, 100), 'night': (70, 30, 95)}[tod]
RIM_K = {'subway': 0.3, 'day': 0.5, 'dusk': 0.8, 'night': 0.7}[tod]

im = Image.open(src).convert('RGBA'); s = im.width / 3200
rgb, a = im.convert('RGB'), im.getchannel('A')

# Painterly: median on colour only, so silhouettes stay crisp.
rgb = rgb.filter(ImageFilter.MedianFilter(3 if s < 0.6 else 5))

# Grade: lift the darks toward the haze (screen blend, weaker on bright pixels).
lift = Image.new('RGB', rgb.size, HAZE)
dark = rgb.convert('L').point(lambda v: int(max(0, 110 - v) * 0.35))
rgb = Image.composite(ImageChops.screen(rgb, lift), rgb, dark)

# Rim light on top edges: alpha minus itself shifted down a few px, softened.
if layer != 'far':
    r = max(2, int(6 * s))
    edge = ImageChops.subtract(a, ImageChops.offset(a, 0, r)).filter(ImageFilter.GaussianBlur(max(1, r * 0.6)))
    edge = edge.point(lambda v: int(v * RIM_K))
    rgb = Image.composite(Image.new('RGB', rgb.size, RIM), rgb, edge)

# Paper wash: low-frequency noise, a few percent.
R = random.Random(5); n = Image.new('L', (max(2, im.width // 64), max(2, im.height // 64)))
n.putdata([R.randint(0, 255) for _ in range(n.width * n.height)])
n = n.resize(im.size, Image.BICUBIC).filter(ImageFilter.GaussianBlur(8 * s))
rgb = Image.blend(rgb, ImageChops.multiply(rgb, Image.merge('RGB', [n.point(lambda v: 225 + v // 9)] * 3)), 0.35)
# A touch more colour, the way painted backgrounds push saturation over a render.
from PIL import ImageEnhance
rgb = ImageEnhance.Color(rgb).enhance(1.15)

out = rgb.convert('RGBA'); out.putalpha(a); out.save(dst)
