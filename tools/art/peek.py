import bpy, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[-1])
for a in bpy.data.actions: print('ACTION', a.name, tuple(a.frame_range))
arm=[o for o in bpy.data.objects if o.type=='ARMATURE'][0]
print('BONES', [b.name for b in arm.data.bones])
print('FPS', bpy.context.scene.render.fps)
