"""Render sprite frames for one character clip.
args: glb out_dir frames(csv of action frames) azimuth_deg rim_hex ortho ground_z [lockxy=1]
Writes out_dir/f000.png ... (256x256, transparent, pivot = (128, 248))."""
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
glb, out, frames, az, rim, ortho, ground = a[0], a[1], [float(x) for x in a[2].split(',')], float(a[3]), a[4], float(a[5]), float(a[6])
# lock: '1' cancels horizontal root travel (the engine moves the character); 'z' also cancels
# vertical travel (airtime clips: the engine supplies the jump arc), '0' keeps everything.
lock = a[7] if len(a) > 7 else '1'
# Standing hips height for this character, so every clip sits on the same ground line.
refz = float(a[8]) if len(a) > 8 else None
# The head direction (degrees) that the base azimuth was framed for; 'y' clips follow the head.
refyaw = float(a[9]) if len(a) > 9 else -94
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene
arm = next(o for o in sc.objects if o.type == 'ARMATURE')
meshes = [o for o in sc.objects if o.type == 'MESH']
hips = arm.pose.bones.get('Hips')

# Outline is added after rendering (stitch step), around the silhouette.

hexrgb = lambda h: tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
def sun(rot, e, col=(1, 1, 1)):
    l = bpy.data.objects.new('l', bpy.data.lights.new('l', 'SUN')); l.data.energy = e; l.data.color = col
    l.rotation_euler = [math.radians(v) for v in rot]; sc.collection.objects.link(l)
sun((50, 0, -40), 4.5, (1, 0.96, 0.92))     # key, front-left
sun((70, 0, 60), 0.9, (0.75, 0.8, 1))       # cool fill
sun((75, 0, 180 + 20), 4.5, hexrgb(rim))    # rim from behind, in the character's color
w = bpy.data.worlds.new('w'); w.use_nodes = True
bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.35, 0.3, 0.55, 1); bg.inputs[1].default_value = 0.8; sc.world = w

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x = sc.render.resolution_y = 256
sc.render.film_transparent = True; sc.render.image_settings.color_mode = 'RGBA'
sc.eevee.taa_render_samples = 16
sc.view_settings.view_transform = 'Standard'

# Reference: the hips at the clip's first rendered frame, standing.
ref = None
os.makedirs(out, exist_ok=True)
for i, f in enumerate(frames):
    end = arm.animation_data.action.frame_range[1]
    if f > end: f -= end
    sc.frame_set(int(f), subframe=f - int(f))
    hp = arm.matrix_world @ hips.head
    if ref is None:
        ref = hp.copy()
        if refz is not None: ref.z = refz
    c = Vector((hp.x, hp.y, 0)) if lock != '0' else Vector((ref.x, ref.y, 0))
    dz = hp.z - ref.z if 'z' in lock else 0
    # Pivot: the point on the ground under the hips sits at (128, 248) in the cell.
    # 'y' in lock: the camera follows the hips' facing, so turning in the mo-cap doesn't spin
    # the character away from the player.
    yaw = 0.0
    if 'y' in lock:
        v = (arm.matrix_world @ arm.pose.bones['Head'].matrix).to_3x3() @ Vector((0, 0, 1))
        yaw = math.atan2(v.y, v.x) - math.radians(refyaw)
    t = math.radians(az) + yaw
    d = Vector((math.sin(t), -math.cos(t), 0))
    target = Vector((c.x, c.y, ground + dz + ortho * (0.5 - 8 / 256)))
    cam.location = target + d * 20
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(out, f'f{i:03d}.png')
    if os.path.exists(sc.render.filepath): continue  # resumable: keep frames already rendered
    bpy.ops.render.render(write_still=True)
print('DONE', len(frames))
