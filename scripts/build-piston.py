"""Build the editable M52-family piston reference and its browser GLB.

Run with Blender 4.5+: blender --background --factory-startup --python scripts/build-piston.py
Dimensions are millimetres while modelling, then explicitly converted to metres.
This is original reference geometry, NOT licensed manufacturer CAD or a tooling drawing.
"""
import bpy, bmesh, math, json, pathlib, sys
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets' / 'piston'
PUBLIC = ROOT / 'public' / 'models'
SOURCE.mkdir(parents=True, exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials): bpy.data.materials.remove(block)

R = 41.985  # Reference diameter 83.97, not a claimed production tolerance.
TOP = 31.82
BOTTOM = TOP - 51.8
N = 128

def material(name, color, metal, rough):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = rough
    return m

aluminium = material('machined_aluminium', (.59, .65, .69), 1, .29)
coating = material('skirt_dry_film_reference', (.075, .085, .095), .05, .58)
cast = material('cast_aluminium_interior', (.43, .47, .49), 1, .48)
steel = material('hardened_pin_steel', (.57, .61, .64), 1, .18)
rings = material('ring_steel', (.17, .19, .21), 1, .31)
spring_steel = material('spring_steel', (.31, .33, .35), 1, .27)

# An original, deterministic normal map: restrained turning marks, no external images.
size = 512
image = bpy.data.images.new('turning_marks_normal', width=size, height=size, alpha=False)
image.colorspace_settings.name = 'Non-Color'
pixels = []
for y in range(size):
    for x in range(size):
        v, u = y / size, x / size
        wave = .075 * math.sin(v * math.tau * 158) + .012 * math.sin(v * math.tau * 37 + u * 11)
        pixels.extend((.5, .5 + wave, .997, 1.0))
image.pixels.foreach_set(pixels)
image.filepath_raw = str(SOURCE / 'turning-marks-normal.png')
image.file_format = 'PNG'; image.save(); image.pack()
for m, strength in [(aluminium, .21), (cast, .10)]:
    nodes = m.node_tree.nodes
    tex = nodes.new('ShaderNodeTexImage'); tex.image = image
    normal = nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value = strength
    m.node_tree.links.new(tex.outputs['Color'], normal.inputs['Color'])
    m.node_tree.links.new(normal.outputs['Normal'], nodes.get('Principled BSDF').inputs['Normal'])

parts = []
def mesh_object(name, vertices, faces, mats):
    mesh = bpy.data.meshes.new(name + '_mesh'); mesh.from_pydata(vertices, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    for m in mats: mesh.materials.append(m)
    return obj

def lathe(name, profile, mats, gap=0, phase=0, segments=N):
    # Blender Z is the cylinder axis. glTF's Y-up export maps this to Three Y.
    closed = gap == 0
    count = segments if closed else segments + 1
    vertices = []
    for radius, height in profile:
        for j in range(count):
            a = phase + gap / 2 + j / segments * (math.tau - gap)
            vertices.append((radius * math.cos(a), radius * math.sin(a), height))
    faces = []
    for k in range(len(profile)):
        next_k = (k + 1) % len(profile)
        for j in range(segments):
            j2 = (j + 1) % count
            faces.append((k*count+j, k*count+j2, next_k*count+j2, next_k*count+j))
    if not closed:
        faces.append(tuple(k*count for k in reversed(range(len(profile)))))
        faces.append(tuple(k*count+count-1 for k in range(len(profile))))
    obj = mesh_object(name, vertices, faces, mats)
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces)); bm.to_mesh(obj.data); bm.free()
    uv = obj.data.uv_layers.new(name='UVMap')
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            co = obj.data.vertices[obj.data.loops[li].vertex_index].co
            a = math.atan2(co.y, co.x) / math.tau + .5
            radial = math.hypot(co.x, co.y)
            v = radial/R if co.z > TOP-5.2 else (co.z-BOTTOM)/(TOP-BOTTOM)
            uv.data[li].uv = (a, v)
        if len(mats)>1:
            center = poly.center
            radial = math.hypot(center.x, center.y)
            if center.z < 9 and radial > 39 and abs(center.y) > 21: poly.material_index=1
            elif radial < 37.5 and center.z < TOP-3: poly.material_index=2
    return obj

def active(obj):
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active=obj

def apply_boolean(obj, tool, operation='DIFFERENCE'):
    active(obj)
    mod=obj.modifiers.new('Reference construction', 'BOOLEAN'); mod.operation=operation; mod.solver='EXACT'; mod.object=tool
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(tool, do_unlink=True)

def cube(name, location, dimensions, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj=bpy.context.object; obj.name=name; obj.dimensions=dimensions
    active(obj); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        m=obj.modifiers.new('Rounded opening', 'BEVEL');m.width=bevel;m.segments=4
        bpy.ops.object.modifier_apply(modifier=m.name)
    return obj

def cylinder(name, radius, depth, location=(0,0,0), axis='Z', vertices=64):
    rotation=(0,math.pi/2,0) if axis=='X' else (math.pi/2,0,0) if axis=='Y' else (0,0,0)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj=bpy.context.object;obj.name=name
    active(obj);bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    return obj

def bevel_finish(obj, width=.16, segments=3):
    active(obj)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00002)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.00001)
    boundary=[edge for edge in bm.edges if edge.is_boundary]
    if boundary:bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    m=obj.modifiers.new('Small edge radii', 'BEVEL');m.width=width;m.segments=segments;m.limit_method='ANGLE';m.angle_limit=.52
    bpy.ops.object.modifier_apply(modifier=m.name)
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00002)
    bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=.00001)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    for p in obj.data.polygons:p.use_smooth=True
    obj.data.set_sharp_from_angle(angle=.52)
    m=obj.modifiers.new('Machined face normals','WEIGHTED_NORMAL');m.keep_sharp=True;m.weight=50
    bpy.ops.object.modifier_apply(modifier=m.name)

profile = [(40.70,BOTTOM),(41.40,-17),(41.78,-9),(41.90,4),(R,10.5),
    (R,15.95),(39.85,15.95),(39.85,18.05),(R,18.05),
    (R,21.60),(39.90,21.60),(39.90,23.20),(R,23.20),
    (R,25.80),(39.90,25.80),(39.90,27.40),(R,27.40),
    (R,31.45),(41.62,TOP),(31.4,TOP),(30.5,TOP-.30),(0,TOP-.30),
    (0,26.60),(26.2,26.60),(34.4,24.1),(36.8,19),(37.8,10),(38.0,BOTTOM)]
body=lathe('piston_body',profile,[aluminium,coating,cast])
# Two pin-side windows leave the thrust skirt surfaces and the complete ring belt.
for side in [-1,1]:
    tool=cube('pin_side_relief',(side*46,0,-4),(36,46,36),6.5)
    apply_boolean(body,tool)
# Bearing bosses and load paths into the underside of the crown.
for side in [-1,1]:
    boss=cylinder('pin_boss',16.6,14.8,(side*22.4,0,0),'X')
    apply_boolean(body,boss,'UNION')
    for depth in [-9.5,9.5]:
        support=cube('boss_web',(side*21.5,depth,18),(13,8,22),1.1)
        apply_boolean(body,support,'UNION')
apply_boolean(body,cylinder('wrist_pin_bore',11.02,104,(0,0,0),'X',96))
# Illustrative retaining grooves let the separate C clips sit in the bore wall.
# Groove dimensions are model assumptions, not production/service dimensions.
for side in [-1,1]:
    apply_boolean(body,cylinder('retainer_groove',11.85,1.05,(side*29.25,0,0),'X',96))
# Four recesses: depths from the MAHLE product data; positions/radii are approximations.
for depth_side, pocket_depth, pocket_r in [(-1,2.37,11.7),(1,.45,10.8)]:
    for side in [-1,1]:
        cut=cylinder('valve_recess',pocket_r,8,(side*17.4,depth_side*15.0,TOP-pocket_depth+4),'Z',64)
        cut.scale.y=.87
        apply_boolean(body,cut)
# Drain holes through the oil-ring groove, not a fabricated pressure/cooling circuit.
for j in range(12):
    a=(j+.5)/12*math.tau
    tool=cylinder('oil_return',.70,12,(math.cos(a)*39,math.sin(a)*39,17),'Z',12)
    tool.rotation_euler=Vector((math.cos(a),math.sin(a),0)).to_track_quat('Z','Y').to_euler()
    apply_boolean(body,tool)
bevel_finish(body,.16,3)
body['role']='piston_body';body['geometry_status']='reference_reconstruction';parts.append(body)

def ring(name, height, width, inner, outer, phase, mat=rings):
    obj=lathe(name,[(inner,height-width/2),(outer-.06,height-width/2),(outer,height-width/2+.06),(outer,height+width/2-.06),(outer-.06,height+width/2),(inner,height+width/2)], [mat], gap=.017,phase=phase)
    bevel_finish(obj,.035,2);obj['role']=name;parts.append(obj);return obj
ring('compression_ring_top',26.60,1.50,40.0,41.985,0)
ring('compression_ring_second',22.40,1.50,40.0,41.985,math.tau/3)
ring('oil_rail_upper',17.77,.38,40.0,41.98,math.tau*2/3)
ring('oil_rail_lower',16.23,.38,40.0,41.98,math.pi)

# Schematic corrugated expander, kept separate from its two scraper rails.
verts=[];faces=[];segments=256
for j in range(segments):
    a=j/segments*math.tau
    radius=40.75+.36*math.cos(a*32)
    for dr,z in [(-.18,16.43),(.18,16.43),(.18,17.57),(-.18,17.57)]:
        verts.append(((radius+dr)*math.cos(a),(radius+dr)*math.sin(a),z))
for j in range(segments):
    for k in range(4):faces.append((j*4+k,((j+1)%segments)*4+k,((j+1)%segments)*4+(k+1)%4,j*4+(k+1)%4))
expander=mesh_object('oil_expander',verts,faces,[spring_steel]);bevel_finish(expander,.025,2);parts.append(expander)

# Hollow pin, its axis is exactly the native wrist-pin datum.
pin=lathe('wrist_pin',[(6.7,-28),(10.65,-28),(11,-27.65),(11,27.65),(10.65,28),(6.7,28)], [steel],segments=96)
pin.rotation_euler.y=math.pi/2
active(pin);bpy.ops.object.transform_apply(location=False,rotation=True,scale=False)
bevel_finish(pin,.07,2);pin['role']='wrist_pin';parts.append(pin)

for side in [-1,1]:
    curve=bpy.data.curves.new('retainer_wire','CURVE');curve.dimensions='3D';curve.bevel_depth=.42;curve.bevel_resolution=3;curve.use_fill_caps=True
    spline=curve.splines.new('POLY');count=70;spline.points.add(count-1)
    for j,p in enumerate(spline.points):
        a=.25+j/(count-1)*(math.tau-.5)
        p.co=(side*29.25,11.35*math.cos(a),11.35*math.sin(a),1)
    obj=bpy.data.objects.new('retaining_clip_'+('left' if side<0 else 'right'),curve);bpy.context.collection.objects.link(obj);obj.data.materials.append(spring_steel)
    active(obj);bpy.ops.object.convert(target='MESH');obj=bpy.context.object
    # Blender's curve caps duplicate their boundary vertices. Weld them into
    # the wire mesh so each C clip is one closed connected solid.
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00002)
    bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
    obj.data.set_sharp_from_angle(angle=.52);parts.append(obj)

root=bpy.data.objects.new('m52_piston_reference',None);bpy.context.collection.objects.link(root)
root['asset_id']='m52-piston-reference-v1';root['source_units']='metres';root['reference_engine']='M52B28 / 286S1';root['manufacturer_cad']=False
for obj in parts:
    obj.parent=root
    # Apply the modelling-unit conversion once in source coordinates.
    for vertex in obj.data.vertices:vertex.co*=.001
    obj.location*=.001
    obj['part_name']=obj.name
    obj.data.update()
for name,location in [('anchor_wrist_pin',(0,0,0)),('anchor_crown',(0,0,TOP)),('anchor_skirt_bottom',(0,0,BOTTOM))]:
    obj=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(obj);obj.parent=root;obj.location=Vector(location)*.001
    obj['datum']=True;obj['datum_name']=name

def validate_solids(objects):
    for obj in objects:
        bm=bmesh.new();bm.from_mesh(obj.data)
        try:
            assert all(edge.is_manifold for edge in bm.edges), 'Open/nonmanifold mesh: '+obj.name
            remaining=set(bm.verts);components=0
            while remaining:
                components+=1;pending=[remaining.pop()]
                while pending:
                    vertex=pending.pop()
                    for edge in vertex.link_edges:
                        other=edge.other_vert(vertex)
                        if other in remaining:remaining.remove(other);pending.append(other)
            assert components==1, 'Disconnected mesh: '+obj.name
            assert bm.calc_volume(signed=True)>0, 'Inverted mesh: '+obj.name
        finally:bm.free()

validate_solids(parts)

# Editable source contains the actual parts and a simple inspection setup.
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
scene.render.engine='CYCLES';scene.cycles.samples=32
world=bpy.data.worlds.new('Neutral inspection world');scene.world=world;world.use_nodes=True
world.node_tree.nodes.get('Background').inputs[0].default_value=(.17,.19,.22,1)
world.node_tree.nodes.get('Background').inputs[1].default_value=.7
studio=bpy.data.collections.new('Source inspection lighting');scene.collection.children.link(studio)
for name,location,power,size_m in [('Key',(.15,-.12,.20),45,.20),('Fill',(-.15,-.02,.08),25,.18),('Rim',(0,.15,.12),50,.13)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size_m
    obj=bpy.data.objects.new(name,data);studio.objects.link(obj);obj.location=location
    obj.rotation_euler=(Vector((0,0,.01))-obj.location).to_track_quat('-Z','Y').to_euler()

active(root)
for obj in root.children:obj.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'m52-piston-reference.blend'))
bpy.ops.export_scene.gltf(filepath=str(PUBLIC/'m52-piston-reference.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_animations=False,export_materials='EXPORT',export_image_format='AUTO')

# An explicit lower-detail asset shares the same datums and materials. Six native
# engine instances share this one geometry set; the studio keeps the detailed set.
lod_root=bpy.data.objects.new('m52_piston_reference_engine_lod',None);bpy.context.collection.objects.link(lod_root)
for k in root.keys():lod_root[k]=root[k]
lod_root['detail']='engine_lod'
lod_parts=[]
for original in root.children:
    obj=original.copy()
    if original.type=='MESH':obj.data=original.data.copy()
    bpy.context.collection.objects.link(obj);obj.parent=lod_root
    if original.type=='MESH':
        active(obj)
        triangulate=obj.modifiers.new('Stable triangle budget','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=triangulate.name)
        decimate=obj.modifiers.new('Engine viewing distance','DECIMATE');decimate.ratio=.22;decimate.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=decimate.name);lod_parts.append(obj)
        # Simplification invalidates the source's custom split normals. Rebuild
        # them on the final topology, keeping the hard machined transitions.
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=2e-8)
        bmesh.ops.dissolve_degenerate(bm,edges=list(bm.edges),dist=1e-8)
        boundary=[edge for edge in bm.edges if edge.is_boundary]
        if boundary:bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
        bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
        active(obj)
        if obj.data.has_custom_normals:bpy.ops.mesh.customdata_custom_splitnormals_clear()
        obj.data.set_sharp_from_angle(angle=.52)
        normal=obj.modifiers.new('Final LOD face normals','WEIGHTED_NORMAL');normal.keep_sharp=True;normal.weight=50
        bpy.ops.object.modifier_apply(modifier=normal.name)
validate_solids(lod_parts)
active(lod_root)
for obj in lod_root.children:obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(PUBLIC/'m52-piston-engine.glb'),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_extras=True,export_animations=False,export_materials='EXPORT',export_image_format='AUTO')
# Keep both explicitly named versions in the editable source, hide the overlapping LOD.
lod_root.hide_viewport=True;lod_root.hide_render=True
for obj in lod_root.children:obj.hide_viewport=True;obj.hide_render=True
active(root)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'m52-piston-reference.blend'))

stats=[]
for obj in parts:
    obj.data.calc_loop_triangles()
    stats.append({'name':obj.name,'vertices':len(obj.data.vertices),'triangles':len(obj.data.loop_triangles)})
manifest={
 'assetId':'m52-piston-reference-v1','units':'metres','runtimeScaleToMillimetres':1000,
 'referenceEngine':'M52B28 / 286S1','manufacturerCad':False,'authoredBy':'Original scripted reference geometry for Engine Playground',
 'dimensions':{'referenceDiameterMm':R*2,'cylinderBoreMm':84,'compressionHeightMm':TOP,'overallHeightMm':TOP-BOTTOM,'pinDiameterMm':22,'pinLengthMm':56,'ringHeightsMm':[1.5,1.5,2.0]},
 'approximate':['Outside diameter is a modelling reference, not a manufacturing tolerance','Skirt profile, windows, walls, bosses and webs','Ring groove axial positions and clearances','Valve recess positions, radii and tilt; only listed depths used; central 0.30 mm dish is illustrative','Pin inside diameter, retainer form, drain hole pattern and edge radii','Fine turning marks and surface roughness','No piston mass/inertia changes to the native model'],
 'references':[
  {'url':'https://nm-germany.com/wp-content/uploads/2022/11/European_Piston_Catalog_EK1.pdf','kind':'supplier catalogue, indexed M52B28 dimensional row; original drawing unavailable'},
  {'url':'https://www.kmotorshop.com/en/article-detail/view/156780/piston-with-rings-and-pin-0831600-mahle-11251432806-11251432807-1432806','kind':'retailer MAHLE product data cross-check; not manufacturer CAD'},
  {'url':'native/headless/assets/engines/bmw/M52B28.mr','kind':'existing native compression height 31.82 mm, wrist-pin offset zero'},
 ],
 'parts':stats,'triangles':sum(p['triangles'] for p in stats),'generator':'scripts/build-piston.py','blenderVersion':bpy.app.version_string,
 'licence':'Original model and generated texture, same licence as this project; no third-party model or image redistributed',
 'topologyValidation':{'heroSolids':len(parts),'engineSolids':len(lod_parts),'boundaryEdges':0,'nonmanifoldEdges':0,'componentsPerPart':1},
}
for obj in lod_parts:obj.data.calc_loop_triangles()
manifest['engineLod']={'triangles':sum(len(obj.data.loop_triangles) for obj in lod_parts),'file':'m52-piston-engine.glb','bytes':(PUBLIC/'m52-piston-engine.glb').stat().st_size}
(PUBLIC/'m52-piston-reference.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding='utf8')
print('PISTON_ASSET '+json.dumps({'parts':len(parts),'triangles':manifest['triangles'],'bytes':(PUBLIC/'m52-piston-reference.glb').stat().st_size}))
