"""Hop's clip plan: which action frames become which sprite frames (docs/ART_SPEC.md §7)."""
import json, subprocess, sys, os
from concurrent.futures import ThreadPoolExecutor
def even(a, b, n, loop=False):
    step = (b - a) / (n if loop else n - 1)
    return [round(a + i * step, 2) for i in range(n)]
def contact(a, c, b, n, at=4):
    """n frames from a to b with frame `at` landing exactly on action frame c."""
    return even(a, c, at + 1) + even(c, b, n - at)[1:]
CHAR, RIG = sys.argv[1], sys.argv[2]
PLAN = {
  # clip:     (action glb,  frames,                              lock)
  'idle':     ('idle',      even(78, 108, 32, loop=True),        '1y'),  # the steady stretch, across the loop seam
  'windup':   ('jumprope',  even(15, 40, 16, loop=True),         '1y'),
  'jump':     ('jumprope',  even(3, 17, 16),                     'zy'),
  'land':     ('jumprope',  even(12, 18, 6),                     '1y'),
  'trip':     ('trip',      even(1, 140, 18),                    '1'),
  'launch':   ('launch',    even(1, 49, 12),                     'zy'),
  'attack':   ('attack',    contact(9, 21, 64, 14),              '1'),
  'tag':      ('tag',       contact(35, 53, 100, 12),            '1'),
  'hurt':     ('hurt',      even(1, 40, 10),                     '1y'),
  'ko':       ('ko',        even(1, 112, 20),                    '1'),
  'victory':  ('victory',   even(1, 36.8, 24, loop=True),        '1y'),
}
cfg = json.loads(RIG)  # {"az":45,"rim":"EF4444","ortho":1.08,"refz":0.33}
S = os.path.dirname(os.path.abspath(__file__))
def render(item):
    clip, (act, frames, lock) = item
    out = f"{sys.argv[3]}/{CHAR}/{clip}"
    r = subprocess.run(['/home/user/blender-venv/bin/python', f'{S}/sprite.py', '--', f'art/{CHAR}/anim/{act}.glb', out,
        ','.join(map(str, frames)), str(cfg['az']), cfg['rim'], str(cfg['ortho']), '0', lock, str(cfg['refz'])], capture_output=True, text=True)
    return clip, 'DONE' in r.stdout, len(frames)
with ThreadPoolExecutor(int(sys.argv[4]) if len(sys.argv) > 4 else 4) as ex:
    for res in ex.map(render, PLAN.items()): print(*res, flush=True)
