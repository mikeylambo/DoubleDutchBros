import bpy, sys, math
from mathutils import Vector
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=sys.argv[-1])
sc = bpy.context.scene; arm = next(o for o in sc.objects if o.type == 'ARMATURE')
a, b = arm.animation_data.action.frame_range; P = arm.pose.bones; m = arm.matrix_world
def yaw(pb):
    v = (m @ pb.matrix).to_3x3() @ Vector((0, 0, 1)); return round(math.degrees(math.atan2(v.y, v.x)))
out = []
for f in range(int(a), int(b) + 1, 3):
    sc.frame_set(f); out.append((f, yaw(P['Hips']), yaw(P['Head'])))
print('YAW', out)
