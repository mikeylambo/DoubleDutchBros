"""Hop's clip plan: which action frames become which sprite frames (docs/ART_SPEC.md §7)."""
import json, subprocess, sys, os
from concurrent.futures import ThreadPoolExecutor
def even(a, b, n, loop=False):
    step = (b - a) / (n if loop else n - 1)
    return [round(a + i * step, 2) for i in range(n)]
def pingpong(a, b, n):
    """n frames a→b→a, seamless when looped (n even)."""
    half = even(a, b, n // 2 + 1)
    return half + half[-2:0:-1]
def contact(a, c, b, n, at=4):
    """n frames from a to b with frame `at` landing exactly on action frame c."""
    return even(a, c, at + 1) + even(c, b, n - at)[1:]
CHAR, RIG = sys.argv[1], sys.argv[2]
PLAN = {
  # clip:     (action glb,  frames,                              lock)
  'idle':     ('idle',      even(78, 108, 32, loop=True),        '1y'),  # the steady stretch, across the loop seam
  'windup':   ('jumprope',  even(33, 58, 16, loop=True),         '1y'),  # apex on frame 0 = the beat, when the rope passes under
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
# Per-character differences: Skip's idle is steady end to end; his spin kick connects on 18 of 40.
# Hop's idle: the guard-and-bounce from Boxing Practice (before the first jab), played there and back.
if CHAR == 'hop':
    PLAN['idle'] = ('idle_bounce', pingpong(1, 13, 32), '1y')
if CHAR == 'skip':
    PLAN['idle'] = ('idle', even(1, 45.6, 32, loop=True), '1y')
    PLAN['attack'] = ('attack', contact(6, 18, 40, 14), '1')
# The humanoid gorillas use the enemy clip set (docs/ART_SPEC.md §7), facing the rabbits.
if CHAR in ('bouncer', 'king'):
    PLAN = {
      'idle':      ('idle',      pingpong(1, 40, 16),                 '1'),
      'telegraph': ('telegraph', pingpong(30, 70, 12),                '1'),  # the chest pound
      'attack':    ('attack',    even(1, 24.8 if CHAR == 'bouncer' else 72, 10), '1'),
      'hurt':      ('hurt',      even(1, 40, 6),                      '1'),
      'defeat':    ('defeat',    even(1, 112, 16),                    '1'),
    }
cfg = json.loads(RIG)  # {"az":45,"rim":"EF4444","ortho":1.08,"refz":0.33}
S = os.path.dirname(os.path.abspath(__file__))
HANDS = ('windup', 'jump', 'land', 'trip')   # clips where the rabbit holds the rope
def render(item):
    clip, (act, frames, lock) = item
    out = f"{sys.argv[3]}/{CHAR}/{clip}"
    env = dict(os.environ)
    if os.environ.get('ANCHORS') == '1' and clip not in HANDS: return clip, True, 0
    r = subprocess.run(['/home/user/blender-venv/bin/python', f'{S}/sprite.py', '--', f'art/{CHAR}/anim/{act}.glb', out,
        ','.join(map(str, frames)), str(cfg['az']), cfg['rim'], str(cfg['ortho']), str(cfg.get('ground', 0)), lock, str(cfg['refz'])], capture_output=True, text=True, env=env)
    return clip, 'DONE' in r.stdout, len(frames)
with ThreadPoolExecutor(int(sys.argv[4]) if len(sys.argv) > 4 else 4) as ex:
    for res in ex.map(render, PLAN.items()): print(*res, flush=True)
