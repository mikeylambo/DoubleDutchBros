"""Skip's Blender pass, applied at render time to every clip (nothing extra to store).
1. Texture: the model painted his shades as purple marks on the headband and jersey. Purple
   pixels are refilled from their non-purple neighbours, so red stays red and blue stays blue.
2. Shades: small round mirrored glasses, built here and parented to the head bone."""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix

def _clean_texture():
    for im in bpy.data.images:
        if im.name != 'texture_0': continue
        w, h = im.size
        px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
        r, g, b = px[..., 0], px[..., 1], px[..., 2]
        # Purple/violet: blue and red both well above green, and neither the jersey blue nor the band red.
        mask = (b > g + 0.18) & (r > g + 0.12) & (b > 0.35) & (r > 0.2) & ~((r > 0.6) & (b < 0.45))
        mask = np.pad(mask, 1)[1:-1, 1:-1]
        for _ in range(3):  # grow a little to catch anti-aliased edges
            mask = mask | np.roll(mask, 1, 0) | np.roll(mask, -1, 0) | np.roll(mask, 1, 1) | np.roll(mask, -1, 1)
        fill = px.copy(); known = ~mask
        for _ in range(60):  # diffuse colour inward from the edges until every hole is filled
            if known.all(): break
            acc = np.zeros_like(px); cnt = np.zeros((h, w, 1), np.float32)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                k = np.roll(known, (dy, dx), (0, 1))[..., None]
                acc += np.roll(fill, (dy, dx), (0, 1)) * k; cnt += k
            new = (~known) & (cnt[..., 0] > 0)
            fill[new] = acc[new] / cnt[new]; known = known | new
        im.pixels[:] = fill.ravel()
        print('FIX texture: repainted', int(mask.sum()), 'px')

def _mat(name, color, metal, rough, emit=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = color; p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if emit:
        p.inputs['Emission Color'].default_value = color; p.inputs['Emission Strength'].default_value = emit
    return m

def _shades(arm):
    sc = bpy.context.scene
    # Bone heads are reliable landmarks on this rig (tails are not): base of head, top of skull, face front.
    M = arm.matrix_world; B = arm.data.bones
    hp = M @ B['Head'].head_local; top = M @ B['head_end'].head_local; face = M @ B['headfront'].head_local
    up = (top - hp); size = up.length; up.normalize()
    fwd = face - hp; depth = fwd.length; fwd = (fwd - up * fwd.dot(up)).normalized()
    side = fwd.cross(up).normalized()
    # Low on the nose: just in front of the face, a little under eye line.
    eye = hp + up * size * 0.31
    # Find the face surface at that height by casting a ray back at the head, then sit just in front.
    bpy.context.view_layer.update()
    hit, loc, *_ = bpy.context.scene.ray_cast(bpy.context.evaluated_depsgraph_get(), eye + fwd * size * 3, -fwd)
    centre = (loc if hit else eye + fwd * depth * 1.12) + fwd * size * 0.035
    rad = size * 0.135
    frame = _mat('frame', (0.12, 0.1, 0.16, 1), 1.0, 0.25)
    lens = _mat('lens', (0.45, 0.25, 0.95, 1), 1.0, 0.08, 0.6)
    parts = []
    for sgn in (-1, 1):
        c = centre + side * sgn * rad * 1.15
        bpy.ops.mesh.primitive_torus_add(major_radius=rad, minor_radius=rad * 0.13, major_segments=32, minor_segments=8, location=c)
        t = bpy.context.object; t.data.materials.append(frame)
        bpy.ops.mesh.primitive_cylinder_add(radius=rad * 0.95, depth=rad * 0.08, vertices=32, location=c)
        d = bpy.context.object; d.data.materials.append(lens)
        for o in (t, d):
            o.rotation_euler = Matrix((side, up, fwd)).transposed().to_euler()
        parts += [t, d]
    bpy.ops.mesh.primitive_cylinder_add(radius=rad * 0.1, depth=rad * 0.4, vertices=12, location=centre + up * rad * 0.25)
    br = bpy.context.object; br.data.materials.append(frame)
    br.rotation_euler = (Matrix.Rotation(math.pi / 2, 3, fwd) @ Matrix((side, up, fwd)).transposed()).to_euler()
    parts.append(br)
    for o in parts:
        mw = o.matrix_world.copy()
        o.parent = arm; o.parent_type = 'BONE'; o.parent_bone = 'Head'
        o.matrix_world = mw
    print('FIX shades: added', len(parts), 'parts')

def apply(arm, meshes):
    _clean_texture()
    _shades(arm)
