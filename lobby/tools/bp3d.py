import json, gzip, numpy as np, functools
ROOT='/tmp/claude-0/dl/dagno/package/model/'
ATLAS=json.load(open(ROOT+'atlas.json'))
PARTS=ATLAS['parts']
@functools.lru_cache(None)
def chunk(i):
    return gzip.open(ROOT+ATLAS['chunks'][i]['gzip']).read()
def mesh(p):
    b=chunk(p['chunk']); n=p['vertexCount']
    pos=np.frombuffer(b,np.float32,n*3,p['positions']).reshape(-1,3).astype(np.float64)
    nor=np.frombuffer(b,np.int16,n*3,p['normals']).reshape(-1,3)/32767.0
    idx=np.frombuffer(b,np.uint32,p['indexCount'],p['indices']).reshape(-1,3)
    return pos,nor,idx
def parts(pred):
    return [p for p in PARTS if pred(p)]
def merge(ps):
    P=[];I=[];o=0
    for p in ps:
        v,n,i=mesh(p); P.append(v); I.append(i+o); o+=len(v)
    return np.vstack(P), np.vstack(I)
CONCEPTS={c['name']:c for c in ATLAS['concepts']}
BYID={p['id']:p for p in PARTS}

def outer_layer(v, f, step=0.004):
    """皮膚模型是約 2 mm 厚的雙層殼。沿面法線走 4 mm：離骨骼更遠的是外層（法線朝外），留下；朝內的內層去掉"""
    import trimesh
    from scipy.spatial import cKDTree
    t = trimesh.Trimesh(v, f, process=False)
    c = t.triangles_center; n = t.face_normals
    bones = np.vstack([mesh(p)[0] for p in PARTS if p['system'] == 'skeletal'])
    kd = cKDTree(bones[::3])
    d0, _ = kd.query(c); d1, _ = kd.query(c + n * step)
    keep = d1 > d0
    # 鄰面多數決，修掉零星誤判
    adj = t.face_adjacency
    for _ in range(4):
        votes = np.zeros(len(f)); cnt = np.zeros(len(f))
        np.add.at(votes, adj[:, 0], keep[adj[:, 1]]); np.add.at(cnt, adj[:, 0], 1)
        np.add.at(votes, adj[:, 1], keep[adj[:, 0]]); np.add.at(cnt, adj[:, 1], 1)
        r = votes / np.maximum(cnt, 1)
        keep = np.where(cnt > 0, np.where(r > 0.5, True, np.where(r < 0.5, False, keep)), keep)
    t2 = trimesh.Trimesh(v, f[keep], process=False)
    # 只留大塊（去掉孤立碎片）
    parts_ = t2.split(only_watertight=False)
    big = [p for p in parts_ if len(p.faces) > 200]
    t2 = trimesh.util.concatenate(big)
    t2.remove_unreferenced_vertices()
    return np.asarray(t2.vertices), np.asarray(t2.faces), keep.mean()

def fill_holes(v, f):
    """把皮膚的開口（眼、口、鼻孔、耳道）用扇形三角形補起來，射線才不會穿進頭裡"""
    import trimesh
    from collections import defaultdict
    t = trimesh.Trimesh(v, f, process=True)
    e = t.edges_sorted
    rows = trimesh.grouping.group_rows(e, require_count=1)
    be = t.edges[rows]                     # 有方向的邊界邊
    nxt = defaultdict(list)
    for a, b in be: nxt[a].append(b)
    used = set(); V = list(t.vertices); F = list(t.faces)
    for a0, b0 in be:
        if (a0, b0) in used: continue
        loop = [a0]; a, b = a0, b0
        while (a, b) not in used:
            used.add((a, b)); loop.append(b)
            cand = [c for c in nxt[b] if (b, c) not in used]
            if not cand: break
            a, b = b, cand[0]
        loop = loop[:-1]
        if len(loop) < 3 or len(loop) > 400: continue
        c = np.mean([V[i] for i in loop], axis=0); ci = len(V); V.append(c)
        for i in range(len(loop)):
            F.append([loop[(i + 1) % len(loop)], loop[i], ci])
    return np.array(V), np.array(F)
