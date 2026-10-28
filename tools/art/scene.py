"""Scenery: a scripted 3D set per zone and time of day, rendered to the game's backdrop.
args: zone tod out.png [scale]      zone: alley | rooftop | subway     tod: day | dusk | night
Maps onto the backdrop region above the court: world x -400..1200, y -500..380 (ground),
1 Blender unit = 10 world units, rendered at 2 px per world unit (3200 x 1760). Open-air zones
are framed tall so phones in portrait see sky, not a smeared edge; the game reads the height."""
import bpy, sys, math, random, os
a = sys.argv[sys.argv.index('--') + 1:]
zone, tod, out = a[0], a[1], a[2]; scale = float(a[3]) if len(a) > 3 else 1.0
R = random.Random({'alley': 7, 'rooftop': 11, 'subway': 23}[zone])

# Time of day: sky, haze, sun, how many windows are lit, how bright the neon runs.
TOD = {
  'day':   dict(top=(0.25, 0.48, 0.85), hor=(0.75, 0.82, 0.92), haze=(0.62, 0.70, 0.85), haze_k=0.55, body=(0.30, 0.30, 0.38),
               sun=(4.0, (1.0, 0.96, 0.9), 50), lit=0.03, win_k=0.4, neon_k=0.12, moon=False, ambient=1.0),
  'dusk':  dict(top=(0.10, 0.08, 0.30), hor=(0.95, 0.42, 0.30), haze=(0.62, 0.30, 0.40), haze_k=0.6, body=(0.10, 0.06, 0.16),
               sun=(2.0, (1.0, 0.55, 0.35), 8), lit=0.6, win_k=0.8, neon_k=0.6, moon=False, ambient=0.6),
  'night': dict(top=(0.02, 0.01, 0.06), hor=(0.30, 0.06, 0.28), haze=(0.30, 0.10, 0.38), haze_k=0.55, body=(0.05, 0.035, 0.11),
               sun=(0.6, (0.8, 0.6, 1.0), 60), lit=1.0, win_k=1.0, neon_k=1.0, moon=True, ambient=1.0),
}[tod]
# Each zone's accent: neon colours and window tints.
ZN = {
  'alley':   dict(neon=[(1.0, 0.25, 0.65), (0.1, 0.85, 1.0), (1.0, 0.75, 0.2)], win=[(1.0, 0.72, 0.4), (0.45, 0.85, 1.0)]),
  'rooftop': dict(neon=[(0.1, 0.85, 1.0), (0.7, 0.3, 1.0), (1.0, 0.3, 0.5)], win=[(0.5, 0.85, 1.0), (1.0, 0.8, 0.5)]),
  'subway':  dict(neon=[(1.0, 0.6, 0.1), (0.2, 1.0, 0.5), (1.0, 0.2, 0.3)], win=[(1.0, 0.85, 0.55), (0.7, 1.0, 0.8)]),
}[zone]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
X0, X1, TOP = -40.0, 120.0, 48.0
FRAME = TOP + 40.0   # rendered height in BU: the set plus open sky above it
mats = {}

# ---------- materials ----------
def node_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    return m, nt, nt.nodes.new('ShaderNodeOutputMaterial')

def hazed(name, base, rough=0.8, emit=None, emit_strength=0.0, windows=None, haze=True):
    """Principled surface faded toward the haze with camera depth (atmosphere)."""
    m, nt, out = node_mat(name)
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); p.inputs['Base Color'].default_value = (*base, 1); p.inputs['Roughness'].default_value = rough
    shader = p.outputs[0]
    if windows:
        # World-space window grid (cells cw x ch BU); random cells light up, warm or cool.
        geo = nt.nodes.new('ShaderNodeNewGeometry'); cw, ch = windows['cell']
        sxz = nt.nodes.new('ShaderNodeMapping'); sxz.inputs['Scale'].default_value = (1 / cw, 1, 1 / ch)
        nt.links.new(geo.outputs['Position'], sxz.inputs[0])
        sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(sxz.outputs[0], sp.inputs[0])
        def frac(o):
            f = nt.nodes.new('ShaderNodeMath'); f.operation = 'FRACT'; nt.links.new(o, f.inputs[0]); return f
        def band(n, lo, hi):
            g1 = nt.nodes.new('ShaderNodeMath'); g1.operation = 'GREATER_THAN'; g1.inputs[1].default_value = lo; nt.links.new(n.outputs[0], g1.inputs[0])
            l1 = nt.nodes.new('ShaderNodeMath'); l1.operation = 'LESS_THAN'; l1.inputs[1].default_value = hi; nt.links.new(n.outputs[0], l1.inputs[0])
            mm = nt.nodes.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; nt.links.new(g1.outputs[0], mm.inputs[0]); nt.links.new(l1.outputs[0], mm.inputs[1]); return mm
        bx, bz = band(frac(sp.outputs['X']), 0.25, 0.7), band(frac(sp.outputs['Z']), 0.25, 0.75)
        win = nt.nodes.new('ShaderNodeMath'); win.operation = 'MULTIPLY'; nt.links.new(bx.outputs[0], win.inputs[0]); nt.links.new(bz.outputs[0], win.inputs[1])
        fl = nt.nodes.new('ShaderNodeVectorMath'); fl.operation = 'FLOOR'; nt.links.new(sxz.outputs[0], fl.inputs[0])
        wn = nt.nodes.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; nt.links.new(fl.outputs[0], wn.inputs['Vector'])
        lit = nt.nodes.new('ShaderNodeMath'); lit.operation = 'LESS_THAN'; lit.inputs[1].default_value = windows['lit']
        nt.links.new(wn.outputs['Value'], lit.inputs[0])
        mask = nt.nodes.new('ShaderNodeMath'); mask.operation = 'MULTIPLY'
        nt.links.new(win.outputs[0], mask.inputs[0]); nt.links.new(lit.outputs[0], mask.inputs[1])
        hue = nt.nodes.new('ShaderNodeMix'); hue.data_type = 'RGBA'
        hue.inputs[6].default_value = (*ZN['win'][0], 1); hue.inputs[7].default_value = (*ZN['win'][1], 1)
        pick = nt.nodes.new('ShaderNodeMath'); pick.operation = 'GREATER_THAN'; pick.inputs[1].default_value = 0.6
        nt.links.new(wn.outputs['Color'], pick.inputs[0]); nt.links.new(pick.outputs[0], hue.inputs[0])
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = windows['strength']
        nt.links.new(hue.outputs[2], em.inputs['Color'])
        # Unlit windows by day: darker glass that reads as windows, not blank walls.
        glass = nt.nodes.new('ShaderNodeBsdfPrincipled'); glass.inputs['Base Color'].default_value = (0.08, 0.12, 0.2, 1)
        glass.inputs['Roughness'].default_value = 0.15; glass.inputs['Metallic'].default_value = 0.6
        gm = nt.nodes.new('ShaderNodeMixShader'); nt.links.new(win.outputs[0], gm.inputs[0])
        nt.links.new(shader, gm.inputs[1]); nt.links.new(glass.outputs[0], gm.inputs[2])
        mx = nt.nodes.new('ShaderNodeMixShader'); nt.links.new(mask.outputs[0], mx.inputs[0])
        nt.links.new(gm.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2]); shader = mx.outputs[0]
    if emit:
        em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*emit, 1); em.inputs['Strength'].default_value = emit_strength
        shader = em.outputs[0]
    if haze:
        cd = nt.nodes.new('ShaderNodeCameraData'); mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = 40; mr.inputs['From Max'].default_value = 420; mr.inputs['To Max'].default_value = 0.82
        nt.links.new(cd.outputs['View Z Depth'], mr.inputs['Value'])
        hz = nt.nodes.new('ShaderNodeEmission'); hz.inputs['Color'].default_value = (*TOD['haze'], 1); hz.inputs['Strength'].default_value = TOD['haze_k']
        mix = nt.nodes.new('ShaderNodeMixShader'); nt.links.new(mr.outputs['Result'], mix.inputs[0])
        nt.links.new(shader, mix.inputs[1]); nt.links.new(hz.outputs[0], mix.inputs[2]); shader = mix.outputs[0]
    nt.links.new(shader, out.inputs[0])
    return m

def neon(i, k=1.0):
    col = ZN['neon'][i % len(ZN['neon'])]
    return hazed(f'neon{i}_{k}', col, emit=col, emit_strength=14 * TOD['neon_k'] * k + 0.6)

def box(x, y, w, h, d, mat, z=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x + w / 2, y + d / 2, z + h / 2))
    o = bpy.context.object; o.scale = (w, d, h); o.data.materials.append(mat); return o

def cyl(x, y, z, r, h, mat, verts=16, axis='Z'):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=(x, y, z))
    o = bpy.context.object; o.data.materials.append(mat)
    if axis == 'Y': o.rotation_euler = (math.pi / 2, 0, 0)
    return o

metal = hazed('metal', tuple(c * (3 if tod == 'day' else 1) for c in (0.06, 0.05, 0.09)), rough=0.4)
red_light = hazed('red', (1, 0.2, 0.2), emit=(1, 0.15, 0.15), emit_strength=8 * max(0.3, TOD['neon_k']))

def brick(name, c1, c2, scale_=1.2):
    m, nt, out = node_mat(name)
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); b = nt.nodes.new('ShaderNodeTexBrick'); tc = nt.nodes.new('ShaderNodeTexCoord')
    k = 3.0 if tod == 'day' else (1.6 if tod == 'dusk' else 1.0)
    b.inputs['Scale'].default_value = scale_
    b.inputs['Color1'].default_value = (*[min(1, c * k) for c in c1], 1); b.inputs['Color2'].default_value = (*[min(1, c * k) for c in c2], 1)
    b.inputs['Mortar'].default_value = (0.04 * k, 0.02 * k, 0.05 * k, 1); b.inputs['Mortar Size'].default_value = 0.02
    nt.links.new(tc.outputs['Object'], b.inputs['Vector'])
    # Grime: soot that collects low on the wall plus noise blotches; bump from the mortar lines.
    geo = nt.nodes.new('ShaderNodeNewGeometry'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['Position'], sp.inputs[0])
    low = nt.nodes.new('ShaderNodeMapRange'); low.inputs['From Max'].default_value = 8; low.inputs['To Min'].default_value = 0.6; low.inputs['To Max'].default_value = 0
    nt.links.new(sp.outputs['Z'], low.inputs['Value'])
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 0.5; n.inputs['Detail'].default_value = 8; nt.links.new(geo.outputs['Position'], n.inputs['Vector'])
    bl = nt.nodes.new('ShaderNodeMapRange'); bl.inputs['From Min'].default_value = 0.5; bl.inputs['From Max'].default_value = 0.8; bl.inputs['To Max'].default_value = 0.4
    nt.links.new(n.outputs['Fac'], bl.inputs['Value'])
    ad = nt.nodes.new('ShaderNodeMath'); ad.operation = 'ADD'; ad.use_clamp = True; nt.links.new(low.outputs['Result'], ad.inputs[0]); nt.links.new(bl.outputs['Result'], ad.inputs[1])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; nt.links.new(ad.outputs[0], mx.inputs[0])
    nt.links.new(b.outputs['Color'], mx.inputs[6]); mx.inputs[7].default_value = (0.02, 0.015, 0.02, 1)
    nt.links.new(mx.outputs[2], p.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.6; nt.links.new(b.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    p.inputs['Roughness'].default_value = 0.85; nt.links.new(p.outputs[0], out.inputs[0]); return m

def graffiti(name):
    """Bold blobs of spray colour over brick: noise bands through a hot palette."""
    m, nt, out = node_mat(name)
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); tc = nt.nodes.new('ShaderNodeTexCoord')
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 0.9; n.inputs['Detail'].default_value = 2; n.inputs['Distortion'].default_value = 1.5
    nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); cr = ramp.color_ramp; cr.interpolation = 'CONSTANT'
    k = 1.6 if tod == 'day' else 1.0
    pal = [(0.10, 0.04, 0.10), (0.95, 0.25, 0.6), (0.1, 0.8, 1.0), (1.0, 0.8, 0.15), (0.10, 0.04, 0.10), (0.6, 0.25, 1.0), (0.1, 0.04, 0.1)]
    cr.elements[0].color = (*[c * k for c in pal[0]], 1); cr.elements[1].position = 1.0
    for i, c in enumerate(pal[1:], 1):
        e = cr.elements.new(0.3 + i * 0.07); e.color = (*[min(1, v * k) for v in c], 1)
    nt.links.new(n.outputs['Fac'], ramp.inputs[0]); nt.links.new(ramp.outputs[0], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.6; nt.links.new(p.outputs[0], out.inputs[0]); return m

# ---------- sky, sun, moon ----------
w = bpy.data.worlds.new('w'); w.use_nodes = True; sc.world = w
nt = w.node_tree; bg = nt.nodes['Background']
tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB')
nt.links.new(tc.outputs['Window'], sep.inputs[0]); nt.links.new(sep.outputs['Y'], ramp.inputs[0])
ramp.color_ramp.elements[0].color = (*TOD['hor'], 1); ramp.color_ramp.elements[1].color = (*TOD['top'], 1)
ramp.color_ramp.elements[0].position = 0.12; ramp.color_ramp.elements[1].position = 0.85
nt.links.new(ramp.outputs[0], bg.inputs['Color']); bg.inputs['Strength'].default_value = TOD['ambient']
energy, col, elev = TOD['sun']
s = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); s.data.energy = energy; s.data.color = col
s.rotation_euler = (math.radians(90 - elev), 0, math.radians(25)); sc.collection.objects.link(s)
if TOD['moon'] and zone != 'subway':
    moon = hazed('moon', (1, 0.9, 0.95), emit=(1.0, 0.86, 0.94), emit_strength=6)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=3.0, location=(62.0, 900, 52.0)); bpy.context.object.data.materials.append(moon)
if tod == 'dusk' and zone != 'subway':
    sunm = hazed('sundisc', (1, 0.6, 0.3), emit=(1.0, 0.55, 0.25), emit_strength=8, haze=False)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=4.5, location=(20.0, 950, 6.0)); bpy.context.object.data.materials.append(sunm)

def clouds(n=9):
    """Soft, flattened puffs far back, lit by the time of day: they fill the tall sky."""
    # Self-lit in the sky's own palette: the sun sits behind the set, so a lit surface would read as grey.
    tint = {'day': (0.95, 0.97, 1.0), 'dusk': (1.0, 0.5, 0.45), 'night': (0.16, 0.07, 0.24)}[tod]
    cm, nt, out = node_mat('cloud'); em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*tint, 1); em.inputs['Strength'].default_value = {'day': 1.1, 'dusk': 0.7, 'night': 0.9}[tod]
    nt.links.new(em.outputs[0], out.inputs[0])
    for _ in range(n):
        cx, cz = R.uniform(X0 - 10, X1 + 10), R.uniform(TOP + 4, FRAME - 6)
        for _ in range(R.randint(3, 6)):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(cx + R.uniform(-9, 9), 800, cz + R.uniform(-1.2, 1.2)))
            o = bpy.context.object; o.scale = (R.uniform(5, 10), 1, R.uniform(1.4, 2.6)); o.data.materials.append(cm)

def landmark(x, y=650, h=62):
    """A broadcast tower on the far skyline: tapering lattice legs, an antenna, a blinking red light."""
    body = hazed('tower', tuple(c * 1.3 for c in TOD['body']))
    for k in range(5):
        w = 6 - k * 1.1; box(x - w / 2, y, w, h / 5, w, body, z=k * h / 5)
    box(x - 2.4, y, 4.8, 1.6, 4.8, hazed('deck', tuple(c * 1.6 for c in TOD['body']), emit=ZN['win'][0], emit_strength=0.6 * TOD['win_k']), z=h * 0.62)
    box(x - 0.15, y, 0.3, 14, 0.3, body, z=h)
    cyl(x, y, h + 14.4, 0.5, 0.6, hazed('beacon', (1, 0.1, 0.1), emit=(1.0, 0.1, 0.08), emit_strength=20, haze=False), 12)

def image_mat(name, path, emit=0.0):
    m, nt, out = node_mat(name)
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.abspath(path))
    nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    if emit: nt.links.new(t.outputs['Color'], p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = emit
    nt.links.new(p.outputs[0], out.inputs[0]); return m

# ---------- shared pieces ----------
def row(depth, hmin, hmax, wmin, wmax, lit, cell, props, gap=None, z0=0.0):
    body = tuple(c * (1 + depth / 600) for c in TOD['body'])
    mat = hazed(f'b{depth}', body, windows=dict(cell=(cell, cell * 1.3), lit=lit * TOD['lit'], strength=(1.1 + 0.4 * R.random()) * TOD['win_k'] + 0.2))
    edge = hazed(f'e{depth}', tuple(c * 1.5 for c in TOD['body']))
    x = X0 - 10 - R.random() * 8
    while x < X1 + 10:
        bw = wmin + R.random() * (wmax - wmin); bh = hmin + R.random() * (hmax - hmin)
        if gap and gap[0] < x + bw / 2 < gap[1]: x += bw; continue
        box(x, depth, bw - 0.4, bh, 8, mat, z=z0)
        top = z0 + bh
        if R.random() < 0.35: box(x + bw * 0.2, depth, bw * 0.55, 2.5, 7, mat, z=top)  # stepped crown
        if props:
            roll = R.random()
            if roll < 0.3:  # water tower
                tx = x + 2 + R.random() * max(1, bw - 6)
                for lx in (0, 2.4): box(tx + lx, depth + 2, 0.3, 2.2, 0.3, edge, z=top)
                cyl(tx + 1.35, depth + 3, top + 3.8, 1.6, 3.2, edge, 12)
                bpy.ops.mesh.primitive_cone_add(radius1=1.75, depth=1.2, vertices=12, location=(tx + 1.35, depth + 3, top + 6.0))
                bpy.context.object.data.materials.append(edge)
            elif roll < 0.6:  # antenna with a warning light
                ax = x + bw * (0.3 + R.random() * 0.4); ah = 4 + R.random() * 6
                box(ax, depth + 3, 0.25, ah, 0.25, edge, z=top)
                bpy.ops.mesh.primitive_uv_sphere_add(radius=0.45, location=(ax + 0.12, depth + 3, top + ah)); bpy.context.object.data.materials.append(red_light)
            elif roll < 0.8:  # AC units
                box(x + 1, depth + 1, 2.2, 1.2, 1.8, edge, z=top); box(x + bw - 4, depth + 2, 2.6, 1.4, 2, edge, z=top)
        x += bw

def fence(y, z0=0.0, h=10.0):
    m, nt, out = node_mat('fence')
    fw = nt.nodes.new('ShaderNodeTexWave'); fw.wave_type = 'BANDS'; fw.bands_direction = 'DIAGONAL'; fw.inputs['Scale'].default_value = 9
    fw2 = nt.nodes.new('ShaderNodeTexWave'); fw2.wave_type = 'BANDS'; fw2.bands_direction = 'DIAGONAL'; fw2.inputs['Scale'].default_value = 9
    fc = nt.nodes.new('ShaderNodeTexCoord'); fmp = nt.nodes.new('ShaderNodeMapping'); fmp.inputs['Scale'].default_value = (-1, 1, 1)
    nt.links.new(fc.outputs['Generated'], fw.inputs['Vector']); nt.links.new(fc.outputs['Generated'], fmp.inputs[0]); nt.links.new(fmp.outputs[0], fw2.inputs['Vector'])
    fmax = nt.nodes.new('ShaderNodeMath'); fmax.operation = 'MAXIMUM'
    nt.links.new(fw.outputs['Fac'], fmax.inputs[0]); nt.links.new(fw2.outputs['Fac'], fmax.inputs[1])
    fth = nt.nodes.new('ShaderNodeMath'); fth.operation = 'GREATER_THAN'; fth.inputs[1].default_value = 0.86
    nt.links.new(fmax.outputs[0], fth.inputs[0])
    fpr = nt.nodes.new('ShaderNodeBsdfPrincipled'); fpr.inputs['Base Color'].default_value = (0.35, 0.33, 0.45, 1); fpr.inputs['Metallic'].default_value = 0.9
    ftr = nt.nodes.new('ShaderNodeBsdfTransparent'); fmix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(fth.outputs[0], fmix.inputs[0]); nt.links.new(ftr.outputs[0], fmix.inputs[1]); nt.links.new(fpr.outputs[0], fmix.inputs[2])
    nt.links.new(fmix.outputs[0], out.inputs[0])
    bpy.ops.mesh.primitive_plane_add(size=1, location=(42, y, z0 + h / 2)); fo = bpy.context.object
    fo.rotation_euler = (math.pi / 2, 0, 0); fo.scale = (130, h, 1); fo.data.materials.append(m)
    for xx in range(-20, 100, 12): box(xx, y - 0.2, 0.35, h + 0.5, 0.35, metal, z=z0)
    box(-22, y - 0.2, 124, 0.3, 0.3, metal, z=z0 + h + 0.2)

def speakers(x, y, z0=0.0):
    """A stack of boombox speakers: dark cabinets with glowing cone rims."""
    cab = hazed('cab', (0.04, 0.03, 0.06), rough=0.5)
    cone = hazed('cone', (0.12, 0.1, 0.16), rough=0.3)
    rim = neon(1, 0.5)
    for (dx, dz, w_, h_) in ((0, 0, 5, 5), (5.2, 0, 4, 4), (0.6, 5, 4, 4), (4.8, 4, 3.6, 3.4)):
        box(x + dx, y, w_, h_, 2.5, cab, z=z0 + dz)
        cx, cz, r = x + dx + w_ / 2, z0 + dz + h_ / 2, min(w_, h_) * 0.34
        cyl(cx, y - 0.15, cz, r, 0.3, cone, 24, 'Y')
        bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=0.12, location=(cx, y - 0.3, cz))
        t = bpy.context.object; t.rotation_euler = (math.pi / 2, 0, 0); t.data.materials.append(rim)

def street_lamp(lx, y=26.0):
    lamp_m = hazed('lamp', (1, 0.9, 0.7), emit=(1, 0.85, 0.6), emit_strength=20 * max(0.1, TOD['neon_k']))
    box(lx, y, 0.3, 15, 0.3, metal); box(lx, y, 2.4, 0.3, 0.3, metal, z=15)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.55, location=(lx + 2.3, y + 0.1, 14.6)); bpy.context.object.data.materials.append(lamp_m)

def neon_fill(points):
    for (px, py, pz, i, e) in points:
        p = bpy.data.objects.new('nf', bpy.data.lights.new('nf', 'POINT')); p.data.energy = e * TOD['neon_k']; p.data.color = ZN['neon'][i]
        p.location = (px, py, pz); sc.collection.objects.link(p)

def alley_clutter():
    """Street-level dressing at the court's edges: dumpster, bags, crates, drainpipes, power lines."""
    k = 2.5 if tod == 'day' else 1.0
    green = hazed('dumpster', (0.06 * k, 0.16 * k, 0.1 * k), rough=0.5)
    box(-16, 22, 12, 7, 6, green); box(-16.3, 21.8, 12.6, 0.8, 6.4, green, z=7)          # dumpster and lid
    bag = hazed('bag', (0.02 * k, 0.02 * k, 0.025 * k), rough=0.25)
    for (bx, bz, r) in ((-2.5, 2.0, 2.4), (1.0, 1.6, 1.9), (-0.8, 4.0, 1.7), (91.5, 1.8, 2.2)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(bx, 24, bz)); o = bpy.context.object; o.scale = (1, 0.8, 0.85); o.data.materials.append(bag)
    wood = hazed('crate', (0.22 * k, 0.13 * k, 0.07 * k), rough=0.8)
    for (cx, cz, cs) in ((94, 0, 4.6), (99, 0, 3.8), (95.5, 4.6, 3.4)): box(cx, 25, cs, cs, cs, wood, z=cz)
    pipe = hazed('pipe', (0.1 * k, 0.09 * k, 0.1 * k), rough=0.35)
    for px in (-17.5, 99.2): cyl(px, 29.6, 20, 0.35, 40, pipe, 10)
    # Power lines sagging across the sky between the walls.
    for i, z_ in enumerate((38, 40.5)):
        pts = 24
        for j in range(pts):
            x_ = -16 + j * (116 / pts); sag = 3.5 * math.sin(math.pi * j / pts)
            cyl(x_ + 116 / pts / 2, 31 + i, z_ - sag, 0.14, 116 / pts * 1.02, metal, 6).rotation_euler = (0, math.pi / 2, 0)
    # Warm light pools from the street lamps fall on the clutter so it reads at night.
    for lx in (-8, 94):
        l = bpy.data.objects.new('pool', bpy.data.lights.new('pool', 'SPOT')); l.data.energy = 9000 * max(0.15, TOD['neon_k'])
        l.data.spot_size = 1.3; l.data.color = (1, 0.78, 0.5); l.location = (lx, 18, 14); sc.collection.objects.link(l)

def rooftop_clutter():
    k = 1.3 if tod == 'day' else 1.0
    vent = hazed('vent', (0.3 * k, 0.3 * k, 0.32 * k), rough=0.35)
    for vx in (8, 14, 76): cyl(vx, 33, 4.5, 0.8, 3, vent, 16); cyl(vx, 33, 6.2, 1.1, 0.4, vent, 16)
    for (x_, w_) in ((-6, 30), (70, 26)): box(x_, 31.5, w_, 1.2, 1.2, vent, z=3.4)            # ducting along the parapet
    hut = hazed('hut', (0.16 * k, 0.12 * k, 0.14 * k), rough=0.7)
    box(108, 34, 10, 9, 8, hut, z=0); box(110.5, 33.9, 3.2, 6, 0.2, hazed('door', (0.08 * k, 0.07 * k, 0.09 * k)), z=0)
    box(109.5, 33.8, 1.6, 0.6, 0.2, neon(2, 0.6), z=7)                                        # exit light
    sky_m = hazed('skylight', (0.3, 0.45, 0.6), rough=0.1); box(40, 36, 12, 2, 6, sky_m, z=3)

# ---------- zones ----------
if zone == 'alley':
    row(420, 18, 40, 4, 9, 0.16, 0.8, True)
    row(260, 12, 30, 5, 11, 0.2, 0.9, True)
    row(150, 8, 22, 6, 12, 0.14, 1.0, True)
    row(70, 5, 14, 8, 13, 0.06, 1.1, False, gap=(14, 70))   # behind the fighters: dim, so they pop
    wall = brick('brick', (0.16, 0.06, 0.12), (0.11, 0.05, 0.1))
    box(-40, 30, 24, 40, 6, wall); box(100, 30, 22, 44, 6, wall)
    # A graffiti piece across the lower left wall, a fire escape above it.
    bpy.ops.mesh.primitive_plane_add(size=1, location=(-28, 29.9, 7)); g = bpy.context.object
    g.rotation_euler = (math.pi / 2, 0, 0); g.scale = (22, 10, 1); g.data.materials.append(graffiti('graffiti'))
    for k in range(3):
        zz = 16 + k * 8; box(-38, 28.5, 16, 0.3, 1.6, metal, z=zz)
        for xx in (-38, -22.3): box(xx, 28.5, 0.25, 2.2, 0.25, metal, z=zz)
        box(-37 + (k % 2) * 6, 28.8, 8, 0.25, 0.25, metal, z=zz + 2.2)
    clouds(6)
    fence(40)
    speakers(104, 24)                       # a speaker stack at the right tower's foot
    box(103, 29.6, 3, 14, 0.4, neon(1), z=20)  # blade sign on the right tower
    for lx in (-6, 88): street_lamp(lx)
    alley_clutter()
    neon_fill([(-30, 24, 30, 0, 9000), (104, 24, 30, 1, 9000), (106, 18, 6, 1, 2500)])

elif zone == 'rooftop':
    # Up high: the skyline sits lower against a big sky, the court is a rooftop with a parapet.
    row(500, 10, 26, 5, 10, 0.16, 0.8, True, z0=-6)
    row(320, 8, 20, 6, 12, 0.2, 0.9, True, z0=-8)
    row(200, 4, 14, 7, 14, 0.12, 1.0, True, z0=-10)
    # Daylight's body colour is already pale: lifting it as much as at night blew the parapet out to white.
    roof = hazed('roof', tuple(c * (1.15 if tod == 'day' else 2.2) for c in TOD['body']), rough=0.7)
    clouds(); landmark(88)
    box(X0 - 10, 30, X1 - X0 + 20, 3.0, 4, roof)                     # parapet behind the court
    for xx in range(-36, 120, 9): box(xx, 29.6, 0.6, 3.4, 0.6, roof)  # parapet caps
    # Rooftop furniture: a water tower, AC units, a satellite dish, a billboard frame.
    cyl(-24, 50, 14, 4.5, 8, roof, 16); box(-27, 49, 0.4, 10, 0.4, metal); box(-21, 49, 0.4, 10, 0.4, metal)
    bpy.ops.mesh.primitive_cone_add(radius1=4.8, depth=2.5, vertices=16, location=(-24, 50, 19.2)); bpy.context.object.data.materials.append(roof)
    for xx in (60, 66, 84): box(xx, 34, 4, 3, 3, metal, z=3)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=2.5, location=(98, 36, 8)); d = bpy.context.object; d.scale = (1, 0.3, 1); d.data.materials.append(metal)
    box(30, 60, 30, 0.6, 0.6, metal, z=16); box(30, 60, 0.6, 16, 0.6, metal); box(59.4, 60, 0.6, 16, 0.6, metal)
    box(30.5, 60.4, 29, 9, 0.3, hazed('board', (0.06, 0.04, 0.1)), z=17)
    # The board's face is left blank for later art.
    for i, (x_, z_) in enumerate(((31, 17.2), (31, 25.6))): box(x_, 60.1, 28, 0.35, 0.3, neon(i), z=z_)   # billboard tubes
    speakers(96, 30, 3)
    rooftop_clutter()
    neon_fill([(45, 50, 22, 0, 9000), (104, 26, 12, 1, 4000)])

elif zone == 'subway':
    # Underground platform: tiled back wall, pillars, a train waiting on the far track.
    tiles = brick('tiles', (0.55, 0.62, 0.6), (0.5, 0.58, 0.56), 2.6)
    box(X0 - 10, 80, X1 - X0 + 20, TOP + 5, 2, tiles)
    # The train: a long car with lit windows and doors.
    # The train: a dark car body with one band of softly lit windows.
    car = hazed('car', (0.22, 0.24, 0.28), rough=0.35)
    box(-20, 60, 140, 13, 6, car, z=3)
    glow = hazed('carwin', (0.9, 0.95, 0.85), emit=(0.85, 0.95, 0.8), emit_strength=1.4)
    for xx in range(-18, 120, 7): box(xx, 59.7, 4.2, 3.2, 0.2, glow, z=9)
    stripe = neon(0, 0.4); box(-20, 59.8, 140, 0.6, 0.2, stripe, z=7)
    # Pillars and the ceiling with fluorescent strips.
    pil = hazed('pillar', (0.25, 0.25, 0.28), rough=0.6)
    for xx in range(-34, 126, 22): box(xx, 34, 2.2, TOP, 2.2, pil)
    ceil = hazed('ceil', (0.08, 0.08, 0.09)); box(X0 - 10, 20, X1 - X0 + 20, 2, 80, ceil, z=TOP - 6)
    tube = hazed('fluo', (0.9, 1.0, 0.95), emit=(0.85, 1.0, 0.95), emit_strength=6)
    for xx in range(-30, 120, 16): box(xx, 30, 8, 0.4, 0.6, tube, z=TOP - 6.4)
    # Station name board and yellow platform-edge stripe.
    box(20, 33.5, 26, 3.4, 0.3, hazed('sign', (0.05, 0.08, 0.1)), z=20)
    box(21, 33.3, 24, 0.3, 0.2, neon(1, 0.5), z=21.5)
    box(X0 - 10, 30, X1 - X0 + 20, 0.4, 1, hazed('edge', (0.9, 0.75, 0.1)), z=0)
    graff = graffiti('graffiti'); bpy.ops.mesh.primitive_plane_add(size=1, location=(85, 33.8, 6)); g = bpy.context.object
    g.rotation_euler = (math.pi / 2, 0, 0); g.scale = (16, 8, 1); g.data.materials.append(graff)
    l = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'AREA')); l.data.energy = 60000; l.data.size = 120
    l.data.color = (0.9, 1.0, 0.95); l.location = (40, 10, TOP - 8); sc.collection.objects.link(l)

# ---------- camera + render ----------
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = X1 - X0; cam.data.clip_end = 2000
if zone == 'subway': FRAME = TOP
cam.location = ((X0 + X1) / 2, -20, FRAME / 2); cam.rotation_euler = (math.pi / 2, 0, 0)
sc.render.resolution_x = int(3200 * scale); sc.render.resolution_y = int(960 * FRAME / TOP * scale)
if os.environ.get('HQ') == '1':
    # Path traced: bounce light from neon onto brick, soft shadows. Lights tuned for EEVEE run a bit
    # hot in Cycles, so point/area energy comes down.
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = int(os.environ.get('SAMPLES', '64'))
    sc.cycles.use_denoising = True; sc.cycles.max_bounces = 6
    for l in bpy.data.lights:
        if l.type in ('POINT', 'AREA', 'SPOT'): l.energy *= 0.5
else:
    sc.render.engine = 'BLENDER_EEVEE'; sc.eevee.taa_render_samples = 32
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Punchy'
# Parallax: LAYER=far|mid|near renders one depth band on its own (the others hidden, transparent
# film for mid and near), so the game can slide the bands at different rates. Bands split on depth.
LAYER = os.environ.get('LAYER')
if LAYER and zone != 'subway':
    lo, hi = {'far': (600, 1e9), 'mid': (240, 600), 'near': (-1e9, 240)}[LAYER]
    for ob in sc.objects:
        if ob.type == 'MESH': ob.hide_render = not (lo <= ob.matrix_world.translation.y < hi)
    sc.render.film_transparent = LAYER != 'far'
# Glow is added after rendering (tools/art/glow.py), where it can be tuned without re-rendering.
sc.render.filepath = out; bpy.ops.render.render(write_still=True); print('DONE', zone, tod)
