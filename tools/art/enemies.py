"""Render every clip for the non-humanoid enemies (tools/art/enemy.py), then stitch each."""
import subprocess, sys
from concurrent.futures import ThreadPoolExecutor
NAMES = sys.argv[2].split(',') if len(sys.argv) > 2 else \
    'slime,bat,shell,moth,pigeon,rat,crab,crow,mimic,giga_slime,glitch_pigeon,giga_glitch'.split(',')
OUT = sys.argv[1]
def job(nc):
    n, c = nc
    r = subprocess.run(['/home/user/blender-venv/bin/python', 'tools/art/enemy.py', '--', n, c, f'{OUT}/{n}/{c}'], capture_output=True, text=True)
    return n, c, 'DONE' in r.stdout
jobs = [(n, c) for n in NAMES for c in ('idle', 'telegraph', 'attack', 'hurt', 'defeat')]
with ThreadPoolExecutor(2) as ex:
    for res in ex.map(job, jobs): print(*res, flush=True)
