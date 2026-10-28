import bpy, sys
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=sys.argv[-1])
sc = bpy.context.scene; arm = next(o for o in sc.objects if o.type == 'ARMATURE')
a, b = arm.animation_data.action.frame_range; m = arm.matrix_world; P = arm.pose.bones
best = []
for f in range(int(a), int(b) + 1):
    sc.frame_set(f); h = m @ P['Hips'].head
    r = max(((m @ P[n].tail) - h).length for n in ('LeftFoot', 'RightFoot', 'LeftHand', 'RightHand'))
    best.append((round(r, 3), f))
print('REACH', sorted(best)[-3:], 'of', int(b))
