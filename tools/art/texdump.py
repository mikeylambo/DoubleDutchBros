"""Save every image embedded in a glb (to find and repaint texture flaws)."""
import bpy, sys, os
glb, out = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=glb)
os.makedirs(out, exist_ok=True)
for im in bpy.data.images:
    if im.size[0] == 0: continue
    im.filepath_raw = os.path.join(out, im.name.replace('/', '_') + '.png'); im.file_format = 'PNG'; im.save()
    print('IMG', im.name, tuple(im.size))
for m in bpy.data.materials:
    if m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image: print('MAT', m.name, n.image.name, [l.to_socket.name for l in n.outputs[0].links])
