"""Frames -> outlined horizontal strips in public/assets/sprites/<char>/, plus manifest entries."""
import json, os, sys
from PIL import Image, ImageFilter
char, src = sys.argv[1], sys.argv[2]
out = f'public/assets/sprites/{char}'; os.makedirs(out, exist_ok=True)
INK = (14, 8, 30)
def outline(im, px=2):
    a = im.getchannel('A').point(lambda v: 255 if v > 40 else 0).filter(ImageFilter.MaxFilter(px * 2 + 1))
    ink = Image.new('RGBA', im.size, INK + (0,)); ink.putalpha(a)
    ink.alpha_composite(im); return ink
mpath = 'public/assets/sprites/manifest.json'
manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}
clips = manifest.setdefault(char, {})
for clip in sorted(os.listdir(f'{src}/{char}')):
    fs = sorted(f for f in os.listdir(f'{src}/{char}/{clip}') if f.endswith('.png'))
    if not fs: continue
    strip = Image.new('RGBA', (256 * len(fs), 256), (0, 0, 0, 0))
    for i, f in enumerate(fs): strip.alpha_composite(outline(Image.open(f'{src}/{char}/{clip}/{f}').convert('RGBA')), (i * 256, 0))
    strip.save(f'{out}/{clip}.png', optimize=True)
    clips[clip] = {'frames': len(fs)}
    print(clip, len(fs), os.path.getsize(f'{out}/{clip}.png') // 1024, 'KB')
json.dump(manifest, open(mpath, 'w'), indent=2)
