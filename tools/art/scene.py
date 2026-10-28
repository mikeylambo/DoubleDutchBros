"""Scenery for a zone: a scripted 3D set rendered to the game's backdrop.
args: zone out.png [scale]
Maps 1:1 onto the backdrop region above the court: world x -400..1200, y -100..380 (ground),
1 Blender unit = 10 world units, rendered at 2 px per world unit (3200 x 960)."""
import bpy, sys, math, random
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
zone, out = a[0], a[1]; scale = float(a[2]) if len(a) > 2 else 1.0
R = random.Random({'alley': 7, 'rooftop': 11, 'subway': 23}.get(zone, 1))

ZONES = {
  # sky top, sky horizon, building base colour, haze colour, neon colours, window colours
  'alley':   dict(top=(0.02, 0.01, 0.06), hor=(0.30, 0.06, 0.28), body=(0.05, 0.035, 0.11), haze=(0.30, 0.10, 0.38),
                  neon=[(1.0, 0.25, 0.65), (0.1, 0.85, 1.0), (1.0, 0.75, 0.2)], win=[(1.0, 0.72, 0.4), (0.45, 0.85, 1.0)]),
  'rooftop': dict(top=(0.01, 0.02, 0.08), hor=(0.10, 0.18, 0.40), body=(0.04, 0.05, 0.12), haze=(0.12, 0.20, 0.45),
                  neon=[(0.1, 0.85, 1.0), (0.7, 0.3, 1.0), (1.0, 0.3, 0.5)], win=[(0.5, 0.85, 1.0), (1.0, 0.8, 0.5)]),
  'subway':  dict(top=(0.02, 0.02, 0.03), hor=(0.20, 0.12, 0.05), body=(0.06, 0.05, 0.05), haze=(0.30, 0.18, 0.08),
                  neon=[(1.0, 0.6, 0.1), (0.2, 1.0, 0.5), (1.0, 0.2, 0.3)], win=[(1.0, 0.8, 0.45), (0.6, 1.0, 0.7)]),
}
Z = ZONES[zone]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
X0, X1, TOP = -40.0, 120.0, 48.0          # Blender units: x range and height above the court

# ---------- materials ----------
def node_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    return m, nt, nt.nodes.new('ShaderNodeOutputMaterial')

def hazed(name, base, rough=0.8, emit=None, emit_strength=0.0, windows=None):
    """Principled surface faded toward the zone's haze with distance from camera (atmosphere)."""
    m, nt, out = node_mat(name)
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); p.inputs['Base Color'].default_value = (*base, 1); p.inputs['Roughness'].default_value = rough
    shader = p.outputs[0]
    if windows:
        # Lit windows: a brick pattern used as a window grid; random cells light up warm or cool.
        # World-space grid (object coords stretch with each building's scale): cells 1.0 x 1.3 BU,
        # i.e. 10 x 13 world units, like the old backdrop's windows.
        geo = nt.nodes.new('ShaderNodeNewGeometry'); cw, ch = windows['cell']
        sxz = nt.nodes.new('ShaderNodeMapping'); sxz.inputs['Scale'].default_value = (1 / cw, 1, 1 / ch)
        nt.links.new(geo.outputs['Position'], sxz.inputs[0])
        sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(sxz.outputs[0], sp.inputs[0])
        fx = nt.nodes.new('ShaderNodeMath'); fx.operation = 'FRACT'; nt.links.new(sp.outputs['X'], fx.inputs[0])
        fz = nt.nodes.new('ShaderNodeMath'); fz.operation = 'FRACT'; nt.links.new(sp.outputs['Z'], fz.inputs[0])
        # Window = inner part of each cell (0.25..0.7 across, 0.25..0.75 up).
        def band(n, lo, hi):
            g1 = nt.nodes.new('ShaderNodeMath'); g1.operation = 'GREATER_THAN'; g1.inputs[1].default_value = lo; nt.links.new(n.outputs[0], g1.inputs[0])
            l1 = nt.nodes.new('ShaderNodeMath'); l1.operation = 'LESS_THAN'; l1.inputs[1].default_value = hi; nt.links.new(n.outputs[0], l1.inputs[0])
            m = nt.nodes.new('ShaderNodeMath'); m.operation = 'MULTIPLY'; nt.links.new(g1.outputs[0], m.inputs[0]); nt.links.new(l1.outputs[0], m.inputs[1]); return m
        bx, bz = band(fx, 0.25, 0.7), band(fz, 0.25, 0.75)
        win = nt.nodes.new('ShaderNodeMath'); win.operation = 'MULTIPLY'; nt.links.new(bx.outputs[0], win.inputs[0]); nt.links.new(bz.outputs[0], win.inputs[1])
        fl = nt.nodes.new('ShaderNodeVectorMath'); fl.operation = 'FLOOR'; nt.links.new(sxz.outputs[0], fl.inputs[0])
        wn = nt.nodes.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; nt.links.new(fl.outputs[0], wn.inputs['Vector'])
        lit = nt.nodes.new('ShaderNodeMath'); lit.operation = 'LESS_THAN'; lit.inputs[1].default_value = windows['lit']
        nt.links.new(wn.outputs['Value'], lit.inputs[0])
        mask = nt.nodes.new('ShaderNodeMath'); mask.operation = 'MULTIPLY'
        nt.links.new(win.outputs[0], mask.inputs[0]); nt.links.new(lit.outputs[0], mask.inputs[1])
        hue = nt.nodes.new('ShaderNodeMix'); hue.data_type = 'RGBA'
        hue.inputs[6].default_value = (*Z['win'][0], 1); hue.inputs[7].default_value = (*Z['win'][1], 1)
        pick = nt.nodes.new('ShaderNodeMath'); pick.operation = 'GREATER_THAN'; pick.inputs[1].default_value = 0.6
        nt.links.new(wn.outputs['Color'], pick.inputs[0]); nt.links.new(pick.outputs[0], hue.inputs[0])
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = windows['strength']
        nt.links.new(hue.outputs[2], em.inputs['Color'])
        mx = nt.nodes.new('ShaderNodeMixShader'); nt.links.new(mask.outputs[0], mx.inputs[0])
        nt.links.new(shader, mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2]); shader = mx.outputs[0]
    if emit:
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*emit, 1); em.inputs['Strength'].default_value = emit_strength
        shader = em.outputs[0]
    # Atmosphere: blend toward haze by camera depth.
    cd = nt.nodes.new('ShaderNodeCameraData'); mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = 40; mr.inputs['From Max'].default_value = 420; mr.inputs['To Max'].default_value = 0.82
    nt.links.new(cd.outputs['View Z Depth'], mr.inputs['Value'])
    hz = nt.nodes.new('ShaderNodeEmission'); hz.inputs['Color'].default_value = (*Z['haze'], 1); hz.inputs['Strength'].default_value = 0.55
    mix = nt.nodes.new('ShaderNodeMixShader'); nt.links.new(mr.outputs['Result'], mix.inputs[0])
    nt.links.new(shader, mix.inputs[1]); nt.links.new(hz.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    return m

def box(x, y, w, h, d, mat, z=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x + w / 2, y + d / 2, z + h / 2))
    o = bpy.context.object; o.scale = (w, d, h); o.data.materials.append(mat); return o

def cyl(x, y, z, r, h, mat, verts=16):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=(x, y, z + h / 2))
    o = bpy.context.object; o.data.materials.append(mat); return o

# ---------- sky ----------
w = bpy.data.worlds.new('w'); w.use_nodes = True; sc.world = w
nt = w.node_tree; bg = nt.nodes['Background']
tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB')
nt.links.new(tc.outputs['Window'], sep.inputs[0]); nt.links.new(sep.outputs['Y'], ramp.inputs[0])
ramp.color_ramp.elements[0].color = (*Z['hor'], 1); ramp.color_ramp.elements[1].color = (*Z['top'], 1)
ramp.color_ramp.elements[0].position = 0.12; ramp.color_ramp.elements[1].position = 0.85
nt.links.new(ramp.outputs[0], bg.inputs['Color']); bg.inputs['Strength'].default_value = 1.0

# Moon with halo (top right, where the game's moon pulse expects it: world (620, 90)).
mx, mz = 62.0, (380 - 90) / 10
moon = hazed('moon', (1, 0.9, 0.95), emit=(1.0, 0.86, 0.94), emit_strength=6)
bpy.ops.mesh.primitive_uv_sphere_add(radius=3.0, location=(mx, 900, mz)); bpy.context.object.data.materials.append(moon)
bpy.context.object.scale = (1, 1, 1)
halo = hazed('halo', (1, 0.5, 0.8), emit=(0.9, 0.3, 0.6), emit_strength=0.5)

# ---------- skyline rows, far to near ----------
def row(depth, hmin, hmax, wmin, wmax, lit, wscale, props, gap=None):
    body = tuple(c * (1 + depth / 600) for c in Z['body'])
    mat = hazed(f'b{depth}', body, windows=dict(cell=(wscale, wscale * 1.3), lit=lit, strength=1.1 + 0.4 * R.random()))
    edge = hazed(f'e{depth}', (0.12, 0.08, 0.2))
    red = hazed(f'r{depth}', (1, 0.2, 0.2), emit=(1, 0.15, 0.15), emit_strength=8)
    x = X0 - 10 - R.random() * 8
    while x < X1 + 10:
        bw = wmin + R.random() * (wmax - wmin); bh = hmin + R.random() * (hmax - hmin)
        if gap and gap[0] < x + bw / 2 < gap[1]: x += bw; continue
        box(x, depth, bw - 0.4, bh, 8, mat)
        if R.random() < 0.35: box(x + bw * 0.2, depth, bw * 0.55, 2.5, 7, mat, z=bh)  # stepped crown
        if props:
            roll = R.random()
            if roll < 0.3:  # water tower
                tx = x + 2 + R.random() * (bw - 6)
                for lx in (0, 2.4): box(tx + lx, depth + 2, 0.3, 2.2, 0.3, edge, z=bh)
                cyl(tx + 1.35, depth + 3, bh + 2.2, 1.6, 3.2, edge, 12)
                bpy.ops.mesh.primitive_cone_add(radius1=1.75, depth=1.2, vertices=12, location=(tx + 1.35, depth + 3, bh + 6.0))
                bpy.context.object.data.materials.append(edge)
            elif roll < 0.6:  # antenna with warning light
                ax = x + bw * (0.3 + R.random() * 0.4); ah = 4 + R.random() * 6
                box(ax, depth + 3, 0.25, ah, 0.25, edge, z=bh)
                bpy.ops.mesh.primitive_uv_sphere_add(radius=0.45, location=(ax + 0.12, depth + 3, bh + ah)); bpy.context.object.data.materials.append(red)
            elif roll < 0.8:  # AC units
                box(x + 1, depth + 1, 2.2, 1.2, 1.8, edge, z=bh); box(x + bw - 4, depth + 2, 2.6, 1.4, 2, edge, z=bh)
        x += bw

row(420, 18, 40, 4, 9, 0.16, 0.8, True)
row(260, 12, 30, 5, 11, 0.2, 0.9, True)
row(150, 8, 22, 6, 12, 0.24, 1.0, True)
# Near row frames the court; the middle stays open so the fight reads against the haze.
row(70, 5, 14, 8, 13, 0.1, 1.1, False, gap=(14, 70))  # behind the fighters: dim, so they pop

# ---------- near alley set ----------
brick_m, bnt, bout = node_mat('brick')
bp = bnt.nodes.new('ShaderNodeBsdfPrincipled'); bb = bnt.nodes.new('ShaderNodeTexBrick'); bc = bnt.nodes.new('ShaderNodeTexCoord')
bb.inputs['Scale'].default_value = 1.2; bb.inputs['Color1'].default_value = (0.16, 0.06, 0.12, 1); bb.inputs['Color2'].default_value = (0.11, 0.05, 0.1, 1)
bb.inputs['Mortar'].default_value = (0.04, 0.02, 0.05, 1); bb.inputs['Mortar Size'].default_value = 0.02
bnt.links.new(bc.outputs['Object'], bb.inputs['Vector']); bnt.links.new(bb.outputs['Color'], bp.inputs['Base Color'])
bnt.links.new(bb.outputs['Fac'], bp.inputs['Roughness']); bnt.links.new(bp.outputs[0], bout.inputs[0])
metal = hazed('metal', (0.06, 0.05, 0.09), rough=0.4)
# Left wall (behind the crew's sign) and right tower, as in the old backdrop.
box(-40, 30, 24, 40, 6, brick_m); box(100, 30, 22, 44, 6, brick_m)
# Fire escape on the left wall.
for k in range(4):
    zz = 8 + k * 8; box(-38, 28.5, 16, 0.3, 1.6, metal, z=zz)
    for xx in (-38, -22.3): box(xx, 28.5, 0.25, 2.2, 0.25, metal, z=zz)
    box(-37 + (k % 2) * 6, 28.8, 8, 0.25, 0.25, metal, z=zz + 2.2)
# Chain-link fence across the back of the court, between the walls.
fence_m, fnt, fout = node_mat('fence')
fw = fnt.nodes.new('ShaderNodeTexWave'); fw.wave_type = 'BANDS'; fw.bands_direction = 'DIAGONAL'; fw.inputs['Scale'].default_value = 9
fw2 = fnt.nodes.new('ShaderNodeTexWave'); fw2.wave_type = 'BANDS'; fw2.bands_direction = 'DIAGONAL'; fw2.inputs['Scale'].default_value = 9
fc = fnt.nodes.new('ShaderNodeTexCoord'); fmp = fnt.nodes.new('ShaderNodeMapping'); fmp.inputs['Scale'].default_value = (-1, 1, 1)
fnt.links.new(fc.outputs['Generated'], fw.inputs['Vector']); fnt.links.new(fc.outputs['Generated'], fmp.inputs[0]); fnt.links.new(fmp.outputs[0], fw2.inputs['Vector'])
fmax = fnt.nodes.new('ShaderNodeMath'); fmax.operation = 'MAXIMUM'
fnt.links.new(fw.outputs['Fac'], fmax.inputs[0]); fnt.links.new(fw2.outputs['Fac'], fmax.inputs[1])
fth = fnt.nodes.new('ShaderNodeMath'); fth.operation = 'GREATER_THAN'; fth.inputs[1].default_value = 0.86
fnt.links.new(fmax.outputs[0], fth.inputs[0])
fpr = fnt.nodes.new('ShaderNodeBsdfPrincipled'); fpr.inputs['Base Color'].default_value = (0.35, 0.33, 0.45, 1); fpr.inputs['Metallic'].default_value = 0.9
ftr = fnt.nodes.new('ShaderNodeBsdfTransparent'); fmix = fnt.nodes.new('ShaderNodeMixShader')
fnt.links.new(fth.outputs[0], fmix.inputs[0]); fnt.links.new(ftr.outputs[0], fmix.inputs[1]); fnt.links.new(fpr.outputs[0], fmix.inputs[2])
fnt.links.new(fmix.outputs[0], fout.inputs[0])
bpy.ops.mesh.primitive_plane_add(size=1, location=(42, 40, 5)); fo = bpy.context.object
fo.rotation_euler = (math.pi / 2, 0, 0); fo.scale = (130, 10, 1); fo.data.materials.append(fence_m)
for xx in range(-20, 100, 12): box(xx, 39.8, 0.35, 10.5, 0.35, metal)
box(-22, 39.8, 124, 0.3, 0.3, metal, z=10.2)

# Neon: tubes as torus/curve-free strips (emissive boxes) on the walls; a vertical blade sign.
for i, col in enumerate(Z['neon']):
    nm = hazed(f'neon{i}', col, emit=col, emit_strength=14)
    if i == 0: box(-36, 29.6, 14, 0.35, 0.35, nm, z=33); box(-36, 29.6, 14, 0.35, 0.35, nm, z=36.5)  # stripes over the crew sign
    if i == 1: box(103, 29.6, 3, 14, 0.4, nm, z=20); box(103.4, 29.4, 2.2, 13.2, 0.2, hazed('blade', (0.02, 0.02, 0.05)), z=20.4)
    if i == 2: box(108, 29.6, 8, 0.4, 0.4, nm, z=12)

# The crew's sign: a dark board with a pink neon tube border on two posts. The game draws the
# lettering live on the beat at world (70, 248) (sprites.ts SIGN), so the board sits right there.
board = hazed('board', (0.03, 0.02, 0.06), rough=0.5)
pink = hazed('signtube', Z['neon'][0], emit=Z['neon'][0], emit_strength=16)
bx0, bz0, bw, bh = 5.6, (380 - 260) / 10, 16.0, 4.0
box(bx0, 45, bw, bh, 0.4, board, z=bz0)
for (x, z, w, h) in ((bx0, bz0, bw, 0.25), (bx0, bz0 + bh - 0.25, bw, 0.25), (bx0, bz0, 0.25, bh), (bx0 + bw - 0.25, bz0, 0.25, bh)):
    box(x, 44.7, w, h, 0.2, pink, z=z)
for px in (bx0 + 2, bx0 + bw - 2.3): box(px, 45.2, 0.3, bz0, 0.3, metal)
p2 = bpy.data.objects.new('signglow', bpy.data.lights.new('signglow', 'POINT')); p2.data.energy = 3000; p2.data.color = Z['neon'][0]
p2.location = (bx0 + bw / 2, 40, bz0 + bh / 2); sc.collection.objects.link(p2)

# Street lamps with warm light pools on the court.
lamp_m = hazed('lamp', (1, 0.9, 0.7), emit=(1, 0.85, 0.6), emit_strength=20)
for lx in (-6, 88):
    box(lx, 26, 0.3, 15, 0.3, metal); box(lx, 26, 2.4, 0.3, 0.3, metal, z=15)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.55, location=(lx + 2.3, 26.1, 14.6)); bpy.context.object.data.materials.append(lamp_m)
    l = bpy.data.objects.new('lamp', bpy.data.lights.new('lamp', 'SPOT')); l.data.energy = 4000; l.data.spot_size = 1.1
    l.data.color = (1, 0.8, 0.55); l.location = (lx + 2.3, 22, 14.3); l.rotation_euler = (0, 0, 0); sc.collection.objects.link(l)

# Moonlight and neon fill on the near set.
s = bpy.data.objects.new('moon', bpy.data.lights.new('moon', 'SUN')); s.data.energy = 0.6; s.data.color = (0.8, 0.6, 1.0)
s.rotation_euler = (math.radians(60), 0, math.radians(20)); sc.collection.objects.link(s)
for (px, col) in ((-30, Z['neon'][0]), (104, Z['neon'][1])):
    p = bpy.data.objects.new('nf', bpy.data.lights.new('nf', 'POINT')); p.data.energy = 9000; p.data.color = col
    p.location = (px, 24, 30); sc.collection.objects.link(p)

# ---------- camera + render ----------
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = X1 - X0; cam.data.clip_end = 2000
cam.location = ((X0 + X1) / 2, -20, TOP / 2); cam.rotation_euler = (math.pi / 2, 0, 0)
sc.render.resolution_x = int(3200 * scale); sc.render.resolution_y = int(960 * scale)
sc.render.engine = 'BLENDER_EEVEE'; sc.eevee.taa_render_samples = 32
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Punchy'
# Glow is added after rendering (tools/art/glow.py), where it can be tuned without re-rendering.
sc.render.filepath = out; bpy.ops.render.render(write_still=True); print('DONE', zone)
