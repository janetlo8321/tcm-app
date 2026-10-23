# 從 BodyParts3D（CC BY 4.0）挑出皮膚、骨骼、臟腑，簡化後打包成大廳用的 body.bin.gz + body.json
import json, gzip, numpy as np, trimesh, fast_simplification as fs, re, sys
from scipy.spatial import ConvexHull
from bp3d import *

S = 10.0; YOFF = -8.7          # 場景座標 = 公尺 × 10，腳底在 y = -8.7
def toScene(v): return np.c_[v[:,0]*S, v[:,1]*S+YOFF, v[:,2]*S]

def simplify(v, f, ratio):
    if ratio >= 0.99 or len(f) < 400: return v, f
    v2, f2 = fs.simplify(v.astype(np.float32), f.astype(np.int32), target_reduction=1-ratio)
    return v2.astype(np.float64), f2

def hull_organ(concept_names, inflate, smooth=6):
    ids=set()
    for n in concept_names: ids |= set(CONCEPTS[n]['elements'])
    V=np.vstack([mesh(BYID[i])[0] for i in ids if i in BYID])
    m=trimesh.convex.convex_hull(V)
    v2,f2=fs.simplify(np.asarray(m.vertices,np.float32),np.asarray(m.faces,np.int32),target_count=min(400,len(m.faces)-1))
    m=trimesh.Trimesh(v2.astype(np.float64),f2,process=True)
    for _ in range(2): m=m.subdivide()
    c=m.centroid
    m.vertices = c + (m.vertices-c)*(1+inflate)
    trimesh.smoothing.filter_taubin(m, iterations=smooth)
    return np.array(m.vertices), np.array(m.faces)

GROUPS = []   # (key, zh, layer, color, v, f)
import lm
def tuck_inside(v):
    """骨骼、臟腑若有頂點穿出皮膚（胸骨、鼻軟骨），往內收到皮膚下 1.5 mm"""
    from scipy.spatial import cKDTree
    kd = cKDTree(lm.SKIN.triangles_center)
    d, i = kd.query(v)
    near = np.where(d < 0.25)[0]
    if not len(near): return v
    c, dist, tri = trimesh.proximity.closest_point(lm.SKIN, v[near])
    n = lm.SKIN.face_normals[tri]
    out = np.einsum('ij,ij->i', v[near] - c, n) > -0.01
    v = v.copy(); v[near[out]] = c[out] - n[out] * 0.015
    print('   tucked', out.sum())
    return v
def add(key, zh, layer, color, pred=None, ratio=1.0, vf=None):
    if vf is None:
        ps = parts(pred)
        if not ps: print('!! none', key); return
        V=[];F=[];o=0
        for p in ps:
            v,n,i = mesh(p)
            v,i = simplify(v,i,ratio)
            V.append(v); F.append(i+o); o+=len(v)
        v=np.vstack(V); f=np.vstack(F)
    else: v,f=vf
    v = toScene(v)
    if layer != 'skin': v = tuck_inside(v)
    GROUPS.append((key,zh,layer,color,v,f))
    print(key, len(f))

nm = lambda *names: (lambda p: p['name'] in names)
rx = lambda r, sys_=None: (lambda p: re.search(r, p['name']) and (sys_ is None or p['system']==sys_))

_sv,_sf=merge(parts(nm('Skin'))); _sv,_sf,_=outer_layer(_sv,_sf)
add('skin','皮膚','skin',0xd9a184, vf=(_sv,_sf))
add('lip','唇','skin',0xb86a62, nm('Lip'), 1.0)
add('ear','耳','skin',0xd9a184, nm('External ear'), 0.7)
add('eye','眼','skin',0xf2efe8, nm('Left sclera','Right sclera'), 0.2)
add('iris','眼','skin',0x4a3426, nm('Left iris','Right iris'), 0.6)
CART = r'cartilage|Gingiva|meniscus|dis[ck]'
SKULL = r'Frontal bone|Occipital bone|parietal bone|temporal bone|zygomatic bone|maxilla|nasal bone|palatine bone|lacrimal bone|Sphenoid|Ethmoid|Vomer|Mandible|nasal concha'
add('skull','顱面骨','face',0xece5d6, lambda p: re.search(SKULL, p['name'], re.I) is not None and p['system'] in ('skeletal','respiratory','sensory'), 0.45)
add('bone','骨骼','skeleton',0xe6dfcf, lambda p: p['system']=='skeletal' and not re.search(CART+r'|tooth|Tooth|fibularis|tibialis|iliotibial|levator|subscapularis|'+SKULL, p['name'], re.I), 0.26)
add('teeth','牙齒','face',0xf3eee2, lambda p: p['system']=='skeletal' and re.search(r'tooth',p['name'],re.I), 0.3)
THROAT_C = r'Thyroid cartilage|Cricoid|arytenoid cartilage|corniculate|cuneiform cartilage|Epiglottis|Hyoid'
add('cart','軟骨','skeleton',0xc9d0cf, lambda p: p['system']=='skeletal' and re.search(CART,p['name'],re.I) and 'Gingiva' not in p['name'] and not re.search(THROAT_C,p['name']), 0.4)
add('gum','牙齦','face',0xc9787a, rx(r'Gingiva'), 0.6)
add('larynx','喉','face',0xe8d4c0, lambda p: re.search(THROAT_C, p['name']) is not None, 0.6)
add('pharynx','咽','face',0xc9827a, lambda p: re.search(r'pharyngeal constrictor|palatopharyngeus|salpingopharyngeus|stylopharyngeus|Pharyngeal raphe', p['name']) is not None, 0.35)
add('tongue','舌','face',0xc76f6e, nm('Tongue'), 1.0)

# 臟腑（key 對應十二經的臟腑）
add('lung','肺','organs',0xe8b4bc, vf=hull_organ(['right lung'],0.10)) ; GROUPS[-1]=('lungR',)+GROUPS[-1][1:]
add('lung','肺','organs',0xe8b4bc, vf=hull_organ(['left lung'],0.10)) ; GROUPS[-1]=('lungL',)+GROUPS[-1][1:]
add('trachea','氣管','organs',0xe2cbb6, nm('Trachea','Left main bronchus','Right main bronchus proper'), 0.6)
add('heart','心','organs',0xa9483f, lambda p: p['system']=='cardiac' and re.search(r'^Wall of',p['name']), 0.6)
add('liver','肝','organs',0x8a3f44, vf=hull_organ(['liver'],0.12))
add('gall','膽','organs',0x5b7d3c, nm('Gallbladder'), 1.0)
add('stomach','胃','organs',0xd99c94, nm('Stomach'), 1.0)
add('esoph','食道','organs',0xcf8577, nm('Esophagus'), 1.0)
add('spleen','脾','organs',0x7d2f3e, nm('Spleen'), 1.0)
add('pancreas','胰','organs',0xe2b27e, nm('Pancreas'), 1.0)
add('kidney','腎','organs',0x9a3a33, nm('Left kidney','Right kidney','Left adrenal gland','Right adrenal gland'), 1.0)
add('ureter','輸尿管','organs',0xd8b39a, nm('Left ureter','Right ureter','Urethra'), 1.0)
add('bladder','膀胱','organs',0xd9a08c, nm('Urinary bladder'), 1.0)
add('sint','小腸','organs',0xe0a3a0, rx(r'jejunum|ileum|Duodenum|Ileocecal','digestive'), 0.8)
add('lint','大腸','organs',0xc98482, nm('Ascending colon','Transverse colon','Descending colon','Rectum','Appendix'), 0.8)
add('brain','腦','organs',0xe8c2b6, lambda p: p['system']=='nervous' and re.search(r'hemisphere|Cerebell|cerebrum|Pons|Medulla|Midbrain', p['name'], re.I) is not None, 0.25)

# 打包
allv=np.vstack([g[4] for g in GROUPS]); lo=allv.min(0); hi=allv.max(0)
posb=bytearray(); norb=bytearray(); idxb=bytearray(); meta=[]
vo=0; io=0
for key,zh,layer,color,v,f in GROUPS:
    m=trimesh.Trimesh(v,f,process=False)
    n=np.asarray(m.vertex_normals)
    q=np.round((v-lo)/(hi-lo)*65535).astype(np.uint16)
    posb+=q.tobytes(); norb+=np.clip(np.round(n*127),-127,127).astype(np.int8).tobytes()
    idxb+=f.astype(np.uint32).tobytes()
    meta.append(dict(key=key,zh=zh,layer=layer,color=color,v0=vo,vn=len(v),i0=io,i_n=f.size))
    vo+=len(v); io+=f.size
# 各段補齊 4 位元組
pad=lambda b: b+bytes((-len(b))%4)
posb=pad(posb); norb=pad(norb)
blob=bytes(posb)+bytes(norb)+bytes(idxb)
out=sys.argv[1]
json.dump(dict(lo=lo.tolist(),hi=hi.tolist(),verts=vo,indices=io,posBytes=len(posb),norBytes=len(norb),meshes=meta,
  credit='BodyParts3D, © The Database Center for Life Science, CC BY 4.0（經 Human Atlas／Dagno 整理，本 App 再簡化）'),
  open(out+'/body.json','w'),ensure_ascii=False)
open(out+'/body.bin.gz','wb').write(gzip.compress(blob,9))
print('verts',vo,'tris',io//3,'raw',len(blob),'gz',len(gzip.compress(blob,9)))
# 也存一份給經絡定位用（公尺座標的皮膚、骨骼）
