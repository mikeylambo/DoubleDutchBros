"""Frames -> outlined horizontal strips in public/assets/sprites/<char>/, plus manifest entries."""
import json, os, subprocess, sys
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
    for i, f in enumerate(fs):
        im = Image.open(f'{src}/{char}/{clip}/{f}').convert('RGBA')
        if im.size != (256, 256): im = im.resize((256, 256), Image.LANCZOS)  # supersampled renders
        strip.alpha_composite(outline(im), (i * 256, 0))
    strip.save(f'{out}/{clip}.png', optimize=True)
    # 256-color palette with alpha: ~70% smaller, visually identical at sprite size.
    subprocess.run(['pngquant', '--force', '--skip-if-larger', '--quality', '75-95', '--speed', '1',
                    '--output', f'{out}/{clip}.png', f'{out}/{clip}.png'], check=False)
    clips[clip] = {'frames': len(fs)}
    a = f'{src}/{char}/{clip}/anchors.json'
    if os.path.exists(a): clips[clip]['hands'] = json.load(open(a))  # [lx, ly, rx, ry] px per frame
    print(clip, len(fs), os.path.getsize(f'{out}/{clip}.png') // 1024, 'KB')
json.dump(manifest, open(mpath, 'w'), indent=2)
