"""Render a non-humanoid enemy clip from its static Meshy model, animated by transform recipes.
args: name clip out_dir   (reads art/<name>/model/<name>.glb)
Enemies face screen-right (toward the rabbits). Cell 256x256, pivot (128, 248). Sized so a
scale-1 enemy stands 140 px tall (70 world units: the gameplay box in src/game/sprites.ts)."""
import bpy, sys, math, os
from mathutils import Vector, Matrix
name, clip, out = sys.argv[sys.argv.index('--') + 1:][:3]
FLYERS = {'bat', 'moth', 'crow', 'glitch_pigeon'}
BASES = {'rat': 0.13, 'pigeon': 0.075}  # display bases baked into the model: cut below this share of height
FRAMES = {'idle': 16, 'telegraph': 12, 'attack': 10, 'hurt': 6, 'defeat': 16}
AZ = -45                            # mirror of the rabbits' 45: front faces screen-right

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=f'art/{name}/model/{name}.glb')
sc = bpy.context.scene
meshes = [o for o in sc.objects if o.type == 'MESH']
bpy.context.view_layer.update()

def bbox(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])

if name in BASES:
    import bmesh
    lo, hi = bbox(meshes); cut = lo.z + (hi.z - lo.z) * BASES[name]
    for o in meshes:
        bm = bmesh.new(); bm.from_mesh(o.data); mw = o.matrix_world
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if (mw @ v.co).z < cut], context='VERTS')
        bm.to_mesh(o.data); bm.free()
    bpy.context.view_layer.update()

lo, hi = bbox(meshes); h = hi.z - lo.z; w = max(hi.x - lo.x, hi.y - lo.y)
# A pivot empty at the ground under the centre: every recipe moves this.
root = bpy.data.objects.new('root', None); sc.collection.objects.link(root)
root.location = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
bpy.context.view_layer.update()  # the root's matrix must be current before re-parenting
for o in meshes:
    mw = o.matrix_world.copy(); o.parent = root; o.matrix_world = mw

hexrgb = lambda hx: tuple(int(hx[i:i + 2], 16) / 255 for i in (0, 2, 4))
def sun(rot, e, col=(1, 1, 1)):
    l = bpy.data.objects.new('l', bpy.data.lights.new('l', 'SUN')); l.data.energy = e; l.data.color = col
    l.rotation_euler = [math.radians(v) for v in rot]; sc.collection.objects.link(l)
sun((50, 0, 40), 4.5, (1, 0.96, 0.92)); sun((70, 0, -60), 0.9, (0.75, 0.8, 1)); sun((75, 0, 160), 3.5, (1, 0.35, 0.45))
wd = bpy.data.worlds.new('w'); wd.use_nodes = True
bg = wd.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.35, 0.3, 0.55, 1); bg.inputs[1].default_value = 0.8; sc.world = wd

# Fit: 140 px tall, or narrower than 236 px for wide shapes (wings, crab claws).
ortho = max(h * 256 / 140, w * 0.85 * 256 / 236)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
t = math.radians(AZ); d = Vector((math.sin(t), -math.cos(t), 0))
target = root.location + Vector((0, 0, ortho * (0.5 - 8 / 256)))
cam.location = target + d * 20 * max(1, h); cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.clip_end = 1000 * max(1, h)
sc.render.engine = 'BLENDER_EEVEE'; sc.eevee.taa_render_samples = 16
sc.render.resolution_x = sc.render.resolution_y = 256; sc.render.film_transparent = True
sc.view_settings.view_transform = 'Standard'

fwd = Vector((0, -1, 0))                 # model front (toward the rabbits)
side = Vector((1, 0, 0))                 # tilt axis
fly = name in FLYERS
ease = lambda x: x * x * (3 - 2 * x)
def pose(clip, u):
    """u in [0,1): returns (offset, tilt degrees toward target, (sx, sy, sz))."""
    off, tilt, sx, sz = Vector((0, 0, 0)), 0.0, 1.0, 1.0
    beat = math.pow(1 - u, 3) if clip in ('idle', 'telegraph') else 0  # 1 on the downbeat
    if clip == 'idle':
        if fly:
            off.z = h * 0.06 * math.sin(2 * math.pi * u); sx = 1 + 0.1 * math.sin(4 * math.pi * u)
        else:
            sz = 1 - 0.08 * beat; sx = 1 + 0.05 * beat
    elif clip == 'telegraph':  # crouch back and tremble: "something's coming"
        tilt = -10 - 5 * math.sin(2 * math.pi * u); sz = 0.9 - 0.04 * beat; sx = 1.06
        off += side * h * 0.015 * math.sin(14 * math.pi * u)
        if fly: off.z = h * 0.1
    elif clip == 'attack':
        if u < 0.3: k = ease(u / 0.3); tilt = -14 * k; sz = 1 - 0.12 * k; sx = 1 + 0.08 * k
        elif u < 0.5: k = ease((u - 0.3) / 0.2); tilt = -14 + 32 * k; off += fwd * h * 0.4 * k; sz = 0.88 + 0.3 * k; sx = 1.08 - 0.15 * k
        else: k = ease((u - 0.5) / 0.5); tilt = 18 * (1 - k); off += fwd * h * 0.4 * (1 - k); sz = 1.18 - 0.18 * k; sx = 0.93 + 0.07 * k
    elif clip == 'hurt':
        k = math.sin(math.pi * min(1, u * 1.4)); tilt = -18 * k; off -= fwd * h * 0.08 * k; sz = 1 - 0.1 * k; sx = 1 + 0.06 * k
    elif clip == 'defeat':
        k = ease(min(1, u * 1.3)); tilt = -80 * k; off -= fwd * h * 0.15 * k; sz = 1 - 0.35 * k; sx = 1 + 0.2 * k
        if fly: off.z = -h * 0.0 * k
    return off, tilt, (sx, sx, sz)

base = root.location.copy()
n = FRAMES[clip]; loop = clip in ('idle', 'telegraph')
os.makedirs(out, exist_ok=True)
for i in range(n):
    u = i / n if loop else i / (n - 1)
    off, tilt, s = pose(clip, u)
    root.location = base + off; root.scale = s
    root.rotation_euler = (math.radians(-tilt), 0, 0)   # +tilt leans toward the rabbits (-Y)
    sc.render.filepath = os.path.join(out, f'f{i:03d}.png')
    if os.path.exists(sc.render.filepath): continue
    bpy.ops.render.render(write_still=True)
print('DONE', name, clip, n, 'h', round(h, 3), 'ortho', round(ortho, 3))
