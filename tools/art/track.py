import bpy, sys
from mathutils import Vector
glb = sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene; arm = next(o for o in sc.objects if o.type == 'ARMATURE')
act = arm.animation_data.action; a, b = act.frame_range
lf, rf, hp = (arm.pose.bones[n] for n in ('LeftToeBase', 'RightToeBase', 'Hips'))
rows = []
for f in range(int(a), int(b) + 1):
    sc.frame_set(f); m = arm.matrix_world
    rows.append((f, round((m @ hp.head).z, 3), round(min((m @ lf.head).z, (m @ rf.head).z), 3)))
print('ROWS', rows)
