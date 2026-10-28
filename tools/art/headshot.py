"""Close-up of a character's head (for tuning accessories). args: glb out az [res]"""
import bpy, sys, math, os, importlib.util
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
glb, out, az = a[0], a[1], float(a[2]); res = int(a[3]) if len(a) > 3 else 512
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene; arm = next(o for o in sc.objects if o.type == 'ARMATURE')
sc.frame_set(1)
char = os.path.basename(os.path.dirname(os.path.dirname(os.path.abspath(glb))))
fx = os.path.join(os.path.dirname(os.path.abspath(__file__)), f'fix_{char}.py')
if os.path.exists(fx):
    spec = importlib.util.spec_from_file_location('fix', fx); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    m.apply(arm, [o for o in sc.objects if o.type == 'MESH'])
B = arm.data.bones; M = arm.matrix_world
c = (M @ B['Head'].head_local + M @ B['head_end'].head_local) / 2
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = 0.42
t = math.radians(az); cam.location = c + Vector((math.sin(t), -math.cos(t), 0)) * 5
cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
for rot, e in [((50, 0, -40), 4.5), ((70, 0, 60), 1.0)]:
    l = bpy.data.objects.new('l', bpy.data.lights.new('l', 'SUN')); l.data.energy = e
    l.rotation_euler = [math.radians(v) for v in rot]; sc.collection.objects.link(l)
w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[1].default_value = 0.8; sc.world = w
sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x = sc.render.resolution_y = res
sc.render.film_transparent = True; sc.view_settings.view_transform = 'Standard'
sc.render.filepath = out; bpy.ops.render.render(write_still=True); print('DONE')
