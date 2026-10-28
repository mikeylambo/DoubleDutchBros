"""The Subway set, high-fidelity pass: Cycles lighting, perspective camera, worn materials, dense
set dressing. args: out.png [scale] [samples]
The camera's frame matches the backdrop region (world x -400..1200 above the court) on the action
plane (y = 0), with the horizon low so the platform floor recedes and the tunnel vanishes into depth."""
import bpy, sys, math, random, os
a = sys.argv[sys.argv.index('--') + 1:]
out = a[0]; scale = float(a[1]) if len(a) > 1 else 1.0; samples = int(a[2]) if len(a) > 2 else 96
R = random.Random(23)
POST = os.path.abspath('art/scenes/posters')
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def node_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    return m, nt, nt.nodes.new('ShaderNodeOutputMaterial')

def link(nt, a_, b_): nt.links.new(a_, b_)

def grime(nt, base_col, rough, z_dirt=6.0, streaks=True, scale_=0.6):
    """A colour with dirt that collects low, noise blotches and vertical streaks. Returns BSDF."""
    p = nt.nodes.new('ShaderNodeBsdfPrincipled'); p.inputs['Roughness'].default_value = rough
    geo = nt.nodes.new('ShaderNodeNewGeometry'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); link(nt, geo.outputs['Position'], sep.inputs[0])
    low = nt.nodes.new('ShaderNodeMapRange'); low.inputs['From Min'].default_value = 0; low.inputs['From Max'].default_value = z_dirt
    low.inputs['To Min'].default_value = 0.55; low.inputs['To Max'].default_value = 0; link(nt, sep.outputs['Z'], low.inputs['Value'])
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale_; n.inputs['Detail'].default_value = 8
    link(nt, geo.outputs['Position'], n.inputs['Vector'])
    blot = nt.nodes.new('ShaderNodeMapRange'); blot.inputs['From Min'].default_value = 0.5; blot.inputs['From Max'].default_value = 0.75
    blot.inputs['To Max'].default_value = 0.35; link(nt, n.outputs['Fac'], blot.inputs['Value'])
    dirt = nt.nodes.new('ShaderNodeMath'); dirt.operation = 'ADD'; link(nt, low.outputs['Result'], dirt.inputs[0]); link(nt, blot.outputs['Result'], dirt.inputs[1])
    if streaks:
        mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (6, 6, 0.15); link(nt, geo.outputs['Position'], mp.inputs[0])
        sn = nt.nodes.new('ShaderNodeTexNoise'); sn.inputs['Scale'].default_value = 1.5; link(nt, mp.outputs[0], sn.inputs['Vector'])
        st = nt.nodes.new('ShaderNodeMapRange'); st.inputs['From Min'].default_value = 0.55; st.inputs['From Max'].default_value = 0.8
        st.inputs['To Max'].default_value = 0.3; link(nt, sn.outputs['Fac'], st.inputs['Value'])
        d2 = nt.nodes.new('ShaderNodeMath'); d2.operation = 'ADD'; link(nt, dirt.outputs[0], d2.inputs[0]); link(nt, st.outputs['Result'], d2.inputs[1]); dirt = d2
    cl = nt.nodes.new('ShaderNodeClamp'); link(nt, dirt.outputs[0], cl.inputs['Value'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    link(nt, cl.outputs[0], mix.inputs[0])
    if isinstance(base_col, tuple): mix.inputs[6].default_value = (*base_col, 1)
    else: link(nt, base_col, mix.inputs[6])
    mix.inputs[7].default_value = (0.05, 0.04, 0.035, 1)
    link(nt, mix.outputs[2], p.inputs['Base Color'])
    rr = nt.nodes.new('ShaderNodeMapRange'); rr.inputs['To Min'].default_value = rough; rr.inputs['To Max'].default_value = min(1, rough + 0.35)
    link(nt, cl.outputs[0], rr.inputs['Value']); link(nt, rr.outputs['Result'], p.inputs['Roughness'])
    return p

def mat_simple(name, col, rough=0.6, metal=0.0, dirty=True, z_dirt=4.0):
    m, nt, o = node_mat(name)
    p = grime(nt, col, rough, z_dirt=z_dirt, streaks=False) if dirty else nt.nodes.new('ShaderNodeBsdfPrincipled')
    if not dirty: p.inputs['Base Color'].default_value = (*col, 1); p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal; link(nt, p.outputs[0], o.inputs[0]); return m

def mat_emit(name, col, strength):
    m, nt, o = node_mat(name); e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (*col, 1); e.inputs['Strength'].default_value = strength; link(nt, e.outputs[0], o.inputs[0]); return m

def mat_tiles(name, c1, grout, size=(0.6, 0.3)):
    """Subway tile: offset bricks with bevelled grout (bump), then grime."""
    m, nt, o = node_mat(name)
    geo = nt.nodes.new('ShaderNodeNewGeometry'); mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Rotation'].default_value = (math.pi / 2, 0, 0); link(nt, geo.outputs['Position'], mp.inputs[0])
    b = nt.nodes.new('ShaderNodeTexBrick'); b.inputs['Scale'].default_value = 1.0
    b.inputs['Brick Width'].default_value = size[0]; b.inputs['Row Height'].default_value = size[1]; b.inputs['Mortar Size'].default_value = 0.025
    b.inputs['Mortar Smooth'].default_value = 0.6
    b.inputs['Color1'].default_value = (*c1, 1); b.inputs['Color2'].default_value = (*[c * 0.93 for c in c1], 1); b.inputs['Mortar'].default_value = (*grout, 1)
    link(nt, mp.outputs[0], b.inputs['Vector'])
    p = grime(nt, b.outputs['Color'], 0.18, z_dirt=4, streaks=False, scale_=0.35)
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.5; link(nt, b.outputs['Fac'], bump.inputs['Height'])
    link(nt, bump.outputs['Normal'], p.inputs['Normal']); link(nt, p.outputs[0], o.inputs[0]); return m

def mat_image(name, path, emit=0.0, rough=0.4):
    m, nt, o = node_mat(name); p = nt.nodes.new('ShaderNodeBsdfPrincipled'); p.inputs['Roughness'].default_value = rough
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(path); link(nt, t.outputs['Color'], p.inputs['Base Color'])
    if emit: link(nt, t.outputs['Color'], p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = emit
    link(nt, p.outputs[0], o.inputs[0]); return m

def box(x, y, w, h, d, mat, z=0.0, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x + w / 2, y + d / 2, z + h / 2))
    ob = bpy.context.object; ob.scale = (w, d, h); ob.data.materials.append(mat)
    if bevel:
        bpy.ops.object.transform_apply(scale=True)
        mo = ob.modifiers.new('bv', 'BEVEL'); mo.width = bevel; mo.segments = 2
    return ob

def plane(x, y, z, w, h, mat, face='-Y'):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x + w / 2, y, z + h / 2)); ob = bpy.context.object
    ob.rotation_euler = (math.pi / 2, 0, 0); ob.scale = (w, h, 1); ob.data.materials.append(mat)
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    # UVs fill the plane, image upright as seen from the platform.
    return ob

def cyl(x, y, z, r, h, mat, verts=24, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=(x, y, z), rotation=rot)
    ob = bpy.context.object; ob.data.materials.append(mat); return ob

XL, XR = -120, 200          # the set runs well past the frame: perspective shows more far away
TOP = 34
# ---------- materials ----------
tile = mat_tiles('tile', (0.92, 0.93, 0.88), (0.3, 0.3, 0.27))
tile_band = mat_tiles('tileband', (0.12, 0.42, 0.33), (0.1, 0.1, 0.08), (0.3, 0.3))
concrete = mat_simple('concrete', (0.32, 0.31, 0.3), 0.85, z_dirt=2)
platform = mat_simple('platform', (0.42, 0.4, 0.38), 0.35, z_dirt=0.5)    # polished, a little wet
steel = mat_simple('steel', (0.10, 0.22, 0.17), 0.45, metal=0.6, z_dirt=10)   # green-painted I-beams
dark = mat_simple('dark', (0.03, 0.03, 0.035), 0.8, dirty=False)
yellow = mat_simple('edge', (0.95, 0.72, 0.08), 0.55, z_dirt=0.3)
rail = mat_simple('rail', (0.5, 0.48, 0.45), 0.25, metal=1.0, dirty=False)
fluo = mat_emit('fluo', (0.85, 1.0, 0.92), 40)
fixture = mat_simple('fixture', (0.75, 0.75, 0.72), 0.5, dirty=False)

# ---------- architecture ----------
# Platform floor (in front of the edge) and the track pit beyond it.
box(XL, -60, XR - XL, 0.6, 96, platform, z=-0.6)
box(XL, 35.5, XR - XL, 0.2, 1.4, yellow, z=-0.05)                    # yellow safety edge
for xx in range(XL, XR, 2): box(xx, 35.6, 1.2, 0.08, 1.1, mat_simple('tact', (0.85, 0.65, 0.05), 0.7, dirty=False), z=0.15)
box(XL, 36, XR - XL, 4, 0.4, concrete, z=-4)                          # pit wall
box(XL, 36, XR - XL, 0.4, 30, concrete, z=-4)                         # pit floor
for ry in (44, 49, 55, 60): box(XL, ry, XR - XL, 0.5, 0.35, rail, z=-3.6)
for xx in range(XL, XR, 3): box(xx, 41, 1.2, 0.3, 22, mat_simple('tie', (0.2, 0.15, 0.1), 0.9, dirty=False), z=-3.6)
# Far wall beyond the tracks: white tile, a green tile band with the station name, posters.
box(XL, 66, XR - XL, TOP + 6, 2, tile, z=-4)
box(XL, 65.9, XR - XL, 2.2, 0.2, tile_band, z=22)
for xx in range(-80, 190, 70):
    plane(xx, 65.8, 23.0, 26, 3.2, mat_image('station', f'{POST}/station.png'))
posters = ['hopskip', 'cola', 'map', 'hopskip', 'cola']
for i, xx in enumerate(range(-60, 200, 34)):
    p = posters[i % len(posters)]
    w_, h_ = (12, 8) if p == 'map' else (7, 10.5)
    box(xx - 0.6, 65.8, w_ + 1.2, h_ + 1.2, 0.15, dark, z=8.4)
    plane(xx, 65.6, 9, w_, h_, mat_image(f'p{i}', f'{POST}/{p}.png', emit=0.15))
# Ceiling: concrete slab, receding beams, cable trays, fluorescent fixtures.
box(XL, -60, XR - XL, 2, 130, concrete, z=TOP)
for yy in range(-40, 70, 10): box(XL, yy, XR - XL, 1.4, 0.8, steel, z=TOP - 1.4)
box(XL, 30, XR - XL, 0.25, 2.5, dark, z=TOP - 3.2); box(XL, 34, XR - XL, 0.25, 2.5, dark, z=TOP - 3.2)
for yy in (-20, 0, 18):
    for xx in range(-60, 190, 18):
        box(xx, yy, 9, 0.5, 1.2, fixture, z=TOP - 2.4); box(xx + 0.4, yy + 0.25, 8.2, 0.12, 0.7, fluo, z=TOP - 2.5)
# I-beam columns along the platform edge (with rivets).
for xx in range(-90, 200, 26):
    box(xx, 32, 1.6, TOP, 0.25, steel); box(xx, 33.6, 1.6, TOP, 0.25, steel); box(xx + 0.65, 32, 0.3, TOP, 1.85, steel)
    for zz in range(2, TOP, 3): cyl(xx + 0.1, 31.9, zz, 0.08, 0.1, steel, 6, (math.pi / 2, 0, 0))
# Benches, a trash can, a turnstile row at the far left.
for xx in (-30, 52, 120):
    box(xx, 24, 10, 0.5, 2.2, mat_simple('wood', (0.35, 0.2, 0.1), 0.6), z=2.2); box(xx, 25.6, 10, 2.2, 0.4, mat_simple('wood2', (0.35, 0.2, 0.1), 0.6), z=2.6)
    for lx in (xx + 0.5, xx + 9): box(lx, 24.2, 0.4, 2.2, 1.8, dark)
cyl(80, 26, 1.6, 1.1, 3.2, mat_simple('can', (0.15, 0.3, 0.2), 0.5, metal=0.4))
for k in range(4): box(-75 + k * 4, 20, 0.8, 4, 4, rail); box(-74 + k * 4, 21.5, 2.5, 0.2, 0.2, rail, z=3.2)

# ---------- the train ----------
body = mat_simple('train', (0.62, 0.64, 0.66), 0.3, metal=0.85, z_dirt=3)
interior = mat_emit('interior', (1.0, 0.82, 0.55), 1.3)  # warm, not blown out
for cx in (-70, -16, 38, 92, 146):
    box(cx, 46, 52, 13, 8, body, z=-2, bevel=0.4)
    for k in range(16): box(cx + 0.5 + k * 3.2, 45.85, 0.25, 9, 0.2, body, z=-1)    # ribbing
    for wx in range(0, 48, 8): box(cx + 2 + wx, 45.8, 5.5, 3.6, 0.1, interior, z=4.5)
    box(cx + 1, 45.7, 50, 0.5, 0.1, mat_emit('stripe', (1.0, 0.45, 0.1), 2.5), z=2.6)
    box(cx + 22, 45.8, 7, 9.5, 0.1, mat_simple('door', (0.5, 0.52, 0.55), 0.35, metal=0.8, dirty=False), z=-1)
box(-14, 45.6, 6, 1.4, 0.1, mat_emit('route', (1.0, 0.55, 0.1), 6), z=9.6)        # route LED sign

# The station ends in tunnel mouths at both sides: dark arches the tracks vanish into.
for (x0, sgn) in ((-62, -1), (142, 1)):
    wx = x0 if sgn > 0 else x0 - 30
    box(wx, 36, 30, TOP, 32, concrete)                       # end wall
    bpy.ops.mesh.primitive_cylinder_add(radius=9, depth=34, vertices=40, location=(x0 + sgn * 15, 52, 6), rotation=(math.pi / 2, 0, 0))
    hole = bpy.context.object; hole.scale = (1.15, 1, 1)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x0 + sgn * 15, 52, -2)); low = bpy.context.object; low.scale = (20.7, 34, 16)
    for cut in (hole, low):
        mo = bpy.context.scene.objects[-1] if False else None
    end = [o for o in bpy.context.scene.objects if o.type == 'MESH'][-3]
    for cut in (hole, low):
        bo = end.modifiers.new('cut', 'BOOLEAN'); bo.object = cut; bo.operation = 'DIFFERENCE'; cut.hide_render = True
    box(x0 + sgn * 15 - 12, 70, 24, 20, 1, mat_emit('void', (0, 0, 0), 0), z=-4)   # darkness inside
    cyl(x0 + sgn * 3, 36.5, 13, 0.55, 0.4, mat_emit(f'signal{sgn}', (1, 0.12, 0.08) if sgn > 0 else (0.1, 1, 0.3), 60), 16, (math.pi / 2, 0, 0))
# A vending machine glowing on the platform, and a token booth with a pink neon sign.
box(100, 22, 5, 9, 3.5, mat_simple('vend', (0.05, 0.25, 0.45), 0.4, metal=0.3), z=0, bevel=0.2)
box(100.5, 21.9, 3.2, 6.5, 0.1, mat_emit('vendfront', (0.4, 0.85, 1.0), 4), z=1.8)
vl = bpy.data.objects.new('vl', bpy.data.lights.new('vl', 'POINT')); vl.data.energy = 4000; vl.data.color = (0.4, 0.85, 1.0)
vl.location = (102.5, 19, 5); sc.collection.objects.link(vl)
box(-52, 18, 12, 9, 6, mat_simple('booth', (0.25, 0.08, 0.12), 0.5), z=0, bevel=0.2)
box(-51, 17.9, 10, 1.6, 0.15, mat_emit('tokens', (1.0, 0.2, 0.6), 12), z=10.2)
tl = bpy.data.objects.new('tl', bpy.data.lights.new('tl', 'POINT')); tl.data.energy = 5000; tl.data.color = (1.0, 0.25, 0.6)
tl.location = (-46, 14, 9); sc.collection.objects.link(tl)

# ---------- light ----------
w = bpy.data.worlds.new('w'); w.use_nodes = True; sc.world = w
w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.01, 0.012, 0.015, 1)
fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'AREA')); fill.data.energy = 90000; fill.data.size = 200
fill.data.color = (0.85, 1.0, 0.92); fill.location = (40, 10, TOP - 4); sc.collection.objects.link(fill)
# Each fluorescent row also casts real light down onto the wall and platform.
for yy in (-20, 0, 18):
    l = bpy.data.objects.new('row', bpy.data.lights.new('row', 'AREA')); l.data.shape = 'RECTANGLE'
    l.data.size = 260; l.data.size_y = 2; l.data.energy = 40000; l.data.color = (0.88, 1.0, 0.93)
    l.location = (40, yy, TOP - 2.6); sc.collection.objects.link(l)
wl = bpy.data.objects.new('wall', bpy.data.lights.new('wall', 'AREA')); wl.data.shape = 'RECTANGLE'; wl.data.size = 260; wl.data.size_y = 3
wl.data.energy = 50000; wl.data.color = (0.95, 1.0, 0.95); wl.location = (40, 58, TOP - 4); wl.rotation_euler = (math.radians(-35), 0, 0); sc.collection.objects.link(wl)
# Faint haze through the station so the fluorescents bloom into the air.
bpy.ops.mesh.primitive_cube_add(size=1, location=(40, 10, TOP / 2)); vol = bpy.context.object; vol.scale = (320, 130, TOP)
vm, vnt, vo = node_mat('haze'); vs = vnt.nodes.new('ShaderNodeVolumeScatter'); vs.inputs['Density'].default_value = 0.0018
link(vnt, vs.outputs[0], vo.inputs['Volume']); vol.data.materials.append(vm)

# ---------- camera: perspective, framing the action plane like the old orthographic view ----------
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
D, H, EYE = 90.0, 48.0, 6.0             # distance to the action plane, frame height there, eye height
cam.data.lens = 36 * D / 160            # 160 BU wide at the action plane
cam.data.sensor_fit = 'HORIZONTAL'
cam.location = (40, -D, EYE); cam.rotation_euler = (math.pi / 2, 0, 0)
cam.data.shift_y = (H / 2 - EYE) / 160  # the court line (z = 0 at the action plane) lands on the bottom edge
cam.data.clip_end = 2000
sc.render.resolution_x = int(3200 * scale); sc.render.resolution_y = int(960 * scale)
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples
sc.cycles.use_denoising = True
sc.cycles.max_bounces = 6
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Punchy'
sc.render.filepath = out; bpy.ops.render.render(write_still=True); print('DONE subway')
