"""Bloom for scene renders: blur what's bright, add it back. args: in.png out.png [strength]"""
import sys
from PIL import Image, ImageChops, ImageFilter
src, dst = sys.argv[1], sys.argv[2]; k = float(sys.argv[3]) if len(sys.argv) > 3 else 0.9
src_im = Image.open(src); alpha = src_im.getchannel('A') if src_im.mode == 'RGBA' else None
im = src_im.convert('RGB')
bright = im.point(lambda v: max(0, v - 150) * 255 // 105)   # keep only highlights
glow = Image.new('RGB', im.size)
for r, wgt in ((4, 0.5), (14, 0.35), (40, 0.25)):
    g = bright.filter(ImageFilter.GaussianBlur(r * im.width / 3200)).point(lambda v, w=wgt: int(v * w * k))
    glow = ImageChops.add(glow, g)
res = ImageChops.add(im, glow)
if alpha: res = res.convert('RGBA'); res.putalpha(alpha)   # parallax layers keep their cut-out
res.save(dst, quality=88)
