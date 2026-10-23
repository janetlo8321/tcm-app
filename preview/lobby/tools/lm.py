import numpy as np, trimesh, re
from bp3d import *
S=10.0; YOFF=-8.7
def toScene(v): return np.c_[v[:,0]*S, v[:,1]*S+YOFF, v[:,2]*S]
def B(*names):
    ps=[p for p in PARTS if p['name'] in names]
    assert ps, names
    return np.vstack([toScene(mesh(p)[0]) for p in ps])
def ext(V, d): d=np.asarray(d,float); return V[np.argmax(V@d)]
_v,_f=merge(parts(lambda p:p['name']=='Skin')); _v,_f,_=outer_layer(_v,_f); _v,_f=fill_holes(_v,_f)
SKIN=trimesh.Trimesh(toScene(_v),_f,process=False)
RI=trimesh.ray.ray_pyembree.RayMeshIntersector(SKIN)
def cast(p, d):
    """從體內點 p 往方向 d 射出，回傳第一個碰到的皮膚點"""
    p=np.asarray(p,float); d=np.asarray(d,float); d=d/np.linalg.norm(d)
    loc,ir,it=RI.intersects_location([p],[d],multiple_hits=True)
    if len(loc)==0: raise ValueError(f'no hit {p} {d}')
    k=np.argmin(np.linalg.norm(loc-p,axis=1)); return loc[k]
def closest(p):
    c,dist,t=trimesh.proximity.closest_point(SKIN,[p]); return c[0]
