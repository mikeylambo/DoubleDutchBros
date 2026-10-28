"""Bloom for scene renders: blur what's bright, add it back. args: in.png out.png [strength]"""
import sys
from PIL import Image, ImageChops, ImageFilter
src, dst = sys.argv[1], sys.argv[2]; k = float(sys.argv[3]) if len(sys.argv) > 3 else 0.9
im = Image.open(src).convert('RGB')
bright = im.point(lambda v: max(0, v - 150) * 255 // 105)   # keep only highlights
glow = Image.new('RGB', im.size)
for r, wgt in ((4, 0.5), (14, 0.35), (40, 0.25)):
    g = bright.filter(ImageFilter.GaussianBlur(r * im.width / 3200)).point(lambda v, w=wgt: int(v * w * k))
    glow = ImageChops.add(glow, g)
ImageChops.add(im, glow).save(dst, quality=88)
