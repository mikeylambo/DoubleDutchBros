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
        # The blue-violet swoosh beside the "2" sits in its own texture island, so diffusion can't
        # reach it: widen it over its light rim and fill it flat with the jersey's own blue.
        swoosh = (r > g + 0.05) & (b > r + 0.12) & (b > 0.4)
        for _ in range(7):
            swoosh = swoosh | np.roll(swoosh, 1, 0) | np.roll(swoosh, -1, 0) | np.roll(swoosh, 1, 1) | np.roll(swoosh, -1, 1)
        jersey = (b > 0.75) & (g > 0.35) & (g < 0.6) & (r < 0.35)
        px[swoosh, :3] = np.median(px[jersey, :3], axis=0)
        r, g, b = px[..., 0], px[..., 1], px[..., 2]
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
        # Second pass: specks that aren't red but sit inside a red area (the headband "jewels").
        r, g, b = fill[..., 0], fill[..., 1], fill[..., 2]
        red = ((r > 0.45) & (g < 0.3) & (b < 0.3)).astype(np.float32)
        R = 12; cs = np.pad(red, ((R + 1, R), (R + 1, R))).cumsum(0).cumsum(1)
        frac = (cs[2 * R + 1:, 2 * R + 1:] - cs[:-2 * R - 1, 2 * R + 1:] - cs[2 * R + 1:, :-2 * R - 1] + cs[:-2 * R - 1, :-2 * R - 1]) / (2 * R + 1) ** 2
        speck = (red < 0.5) & (frac > 0.62)
        for _ in range(2):
            speck = speck | np.roll(speck, 1, 0) | np.roll(speck, -1, 0) | np.roll(speck, 1, 1) | np.roll(speck, -1, 1)
        known = ~speck
        for _ in range(40):
            if known.all(): break
            acc = np.zeros_like(fill); cnt = np.zeros((h, w, 1), np.float32)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                kk = np.roll(known, (dy, dx), (0, 1))[..., None]
                acc += np.roll(fill, (dy, dx), (0, 1)) * kk; cnt += kk
            new = (~known) & (cnt[..., 0] > 0)
            fill[new] = acc[new] / cnt[new]; known = known | new
        print('FIX texture: repainted', int(speck.sum()), 'px of specks in the headband')
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

# Shades, tuned against the concept (art/skip/concept/image_1.png): small round lenses perched
# low on the muzzle, eyes peeking over the top, thin dark frames, blue-violet mirror lenses.
SHADES = dict(height=0.115, radius=0.095, spread=1.15, frame=0.06, standoff=0.03)

def _lens_material():
    m = bpy.data.materials.new('lens'); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes['Principled BSDF']
    # Mirror gradient: violet at the top of the lens to electric blue at the bottom.
    # Mirror lens: deep blue where it faces you, violet toward the rim (by viewing angle).
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.08, 0.14, 0.9, 1); ramp.color_ramp.elements[1].color = (0.65, 0.25, 0.98, 1)
    ramp.color_ramp.elements[1].position = 0.7
    nt.links.new(lw.outputs['Facing'], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], p.inputs['Base Color']); nt.links.new(ramp.outputs[0], p.inputs['Emission Color'])
    p.inputs['Metallic'].default_value = 0.9; p.inputs['Roughness'].default_value = 0.05
    p.inputs['Emission Strength'].default_value = 0.35
    return m

def _shades(arm):
    # Bone heads are reliable landmarks on this rig (tails are not): base of head, top of skull, face front.
    M = arm.matrix_world; B = arm.data.bones
    hp = M @ B['Head'].head_local; top = M @ B['head_end'].head_local; face = M @ B['headfront'].head_local
    up = (top - hp); size = up.length; up.normalize()
    fwd = face - hp; fwd = (fwd - up * fwd.dot(up)).normalized()
    side = fwd.cross(up).normalized()
    k = SHADES; rad = size * k['radius']
    bridge = hp + up * size * k['height']
    frame = _mat('frame', (0.82, 0.83, 0.88, 1), 1.0, 0.2)  # thin silver wire
    lens = _lens_material()
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    def on_face(p):
        """Project a point onto the face surface along -fwd, then stand off a touch."""
        hit, loc, nrm, *_ = bpy.context.scene.ray_cast(dg, p + fwd * size * 3, -fwd)
        return (loc if hit else p + fwd * size * 0.6) + fwd * size * k['standoff']
    parts = []; centres = []
    for sgn in (-1, 1):
        c = on_face(bridge + side * sgn * rad * k['spread'])
        centres.append(c)
        # Each lens turns a little outward, following the curve of the face.
        rot = Matrix((side, up, fwd)).transposed()  # flat to the camera-facing plane, like the concept
        bpy.ops.mesh.primitive_torus_add(major_radius=rad, minor_radius=rad * k['frame'], major_segments=40, minor_segments=10, location=c)
        t = bpy.context.object; t.data.materials.append(frame)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=rad * 0.97, segments=32, ring_count=16, location=c)
        d = bpy.context.object; d.scale = (1, 1, 0.22); d.data.materials.append(lens)  # a shallow domed lens
        for o in (t, d): o.rotation_euler = rot.to_euler()
        parts += [t, d]
    # Temple arms: from each lens's outer edge back along the side of the head.
    for sgn, c in zip((-1, 1), centres):
        start = c + side * sgn * rad
        end = start + side * sgn * rad * 0.6 - fwd * size * 0.35  # back into the side of the head
        mid_t = (start + end) / 2; length = (end - start).length
        bpy.ops.mesh.primitive_cylinder_add(radius=rad * k['frame'] * 0.8, depth=length, vertices=8, location=mid_t)
        tm = bpy.context.object; tm.data.materials.append(frame)
        tm.rotation_euler = (end - start).to_track_quat('Z', 'Y').to_euler(); parts.append(tm)
    # Thin bridge arching between the lenses over the nose.
    mid = (centres[0] + centres[1]) / 2 + up * rad * 0.35 + fwd * size * 0.01
    gap = (centres[1] - centres[0]).length - 2 * rad
    bpy.ops.mesh.primitive_cylinder_add(radius=rad * k['frame'] * 0.9, depth=max(gap, rad * 0.3) * 1.1, vertices=10, location=mid)
    br = bpy.context.object; br.data.materials.append(frame)
    br.rotation_euler = (Matrix((side, up, fwd)).transposed() @ Matrix.Rotation(math.pi / 2, 3, 'Y')).to_euler()
    parts.append(br)
    for o in parts:
        mw = o.matrix_world.copy()
        o.parent = arm; o.parent_type = 'BONE'; o.parent_bone = 'Head'
        o.matrix_world = mw
    print('FIX shades: added', len(parts), 'parts')

def _solid_headband(arm, meshes):
    """The band's leftover specks are separate texture islands, so fix them in 3D: every face in the
    ring of height the red band occupies (near the head) gets a plain red material."""
    im = bpy.data.images.get('texture_0')
    w, h = im.size; px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    M = arm.matrix_world; B = arm.data.bones
    hp = M @ B['Head'].head_local; top = M @ B['head_end'].head_local
    band = _mat('band', (0.86, 0.12, 0.14, 1), 0.0, 0.45)
    for o in meshes:
        me = o.data; uv = me.uv_layers.active.data; mw = o.matrix_world
        info = []
        for poly in me.polygons:
            c = mw @ poly.center
            if not (hp.z < c.z < top.z + 0.05) or (Vector((c.x - hp.x, c.y - hp.y, 0)).length > (top.z - hp.z) * 0.9): continue
            u = sum(uv[i].uv.x for i in poly.loop_indices) / poly.loop_total; v = sum(uv[i].uv.y for i in poly.loop_indices) / poly.loop_total
            r, g, b = px[min(h - 1, int(v * h)), min(w - 1, int(u * w)), :3]
            info.append((poly.index, c.z, r > 0.45 and g < 0.3 and b < 0.3, b - r > 0.15 and max(r, g, b) - min(r, g, b) > 0.25))
        reds = sorted(z for _, z, red, _b in info if red)
        if len(reds) < 20: continue
        lo, hi = reds[int(len(reds) * 0.03)], reds[int(len(reds) * 0.97)]
        me.materials.append(band); slot = len(me.materials) - 1
        n = 0
        for idx, z, red, bluish in info:
            # Only the band itself and the bluish specks on it; grey fur in the same height range stays.
            if lo <= z <= hi and (red or bluish): me.polygons[idx].material_index = slot; n += 1
        print('FIX headband: solid red on', n, 'faces between z', round(lo, 3), round(hi, 3))

def apply(arm, meshes):
    _clean_texture()
    _solid_headband(arm, meshes)
    _shades(arm)
